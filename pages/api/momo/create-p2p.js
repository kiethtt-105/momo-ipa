import { createMoMoPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'
import QRCode from 'qrcode'
import { requireAdmin } from '../../../lib/requireAdmin'
import { resolveStore } from '../../../lib/stores'
import { markOrderOpen, markOrderClosed } from '../../../lib/openOrders'
import { describeResultCode, formatResultCodeMessage } from '../../../lib/momoResultCodes'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// File này CHỈ dành cho ADMIN (trang "Tạo giao dịch" trong khu vực quản trị).
// Nhánh xác thực bằng shortcut key đã tách riêng sang create-p2p-shortcut.js
// để 2 luồng không lẫn vào nhau — admin luôn phải đăng nhập, shortcut luôn
// chỉ cần đúng key, không có "hoặc" nào ở giữa.

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireAdmin(req, res)) return

  const params = req.method === 'GET' ? req.query : req.body

  const amt = parseInt(params.amount)
  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 50.000.000 ₫)' })
  }

  const rawOrderId = (params.orderId || '').toString().trim()
  const rawOrderInfo = (params.orderInfo || '').toString().trim()

  const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '')

  let orderId
  if (rawOrderId) {
    const clean = sanitize(rawOrderId)
    orderId = clean.startsWith('iPOS') ? clean : `iPOS${clean}`
  } else {
    orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  }

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    orderInfo = `Thanh toan DH ${orderId}`
  }

  // ─── CHỌN CỬA HÀNG ───────────────────────────────────────────
  // - Nếu request truyền storeId (chọn thủ công trên trang tạo giao dịch)
  //   → dùng đúng cửa hàng đó.
  // - Nếu không truyền (ví dụ link nhanh/shortcut không kèm storeId)
  //   → tự động dùng cửa hàng được đánh dấu "default" trong MOMO_STORES.
  const rawStoreId = (params.storeId || '').toString().trim()
  const store = resolveStore(rawStoreId)

  const storeId = store.id
  const storeName = store.name
  const partnerName = store.partnerName

  const now = new Date().toISOString()

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo, status: 'PENDING',
        createdAt: now, paidAt: null, transId: '', payType: '',
        paymentOption: '', source: 'create-p2p',
        storeId, storeName, partnerName,
        type: 'p2p',
      }),
    })

    await markOrderOpen(redis, orderId, Date.now())

    const result = await createMoMoPayment({
      orderId, amount: amt, orderInfo, storeId, storeName, partnerName,
    })

    if (result.resultCode !== 0) {
      const info = describeResultCode(result.resultCode)
      const finalMessage = formatResultCodeMessage(result.resultCode, result.message)
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo, status: 'FAILED',
          createdAt: now, paidAt: null, transId: '', payType: '',
          paymentOption: '', source: 'create-p2p',
          storeId, storeName, partnerName, error: result.message || '',
          message: finalMessage, resultCode: result.resultCode,
          // Trước đây bỏ sót các field này ở nhánh FAILED dù MoMo vẫn trả
          // về — giữ lại đầy đủ để admin tra cứu/đối chiếu sau này.
          requestId: result.requestId || '',
          responseTime: result.responseTime || null,
          orderType: result.orderType || '',
          extraData: result.extraData || '',
          type: 'p2p',
        }),
      })
      await markOrderClosed(redis, orderId)
      return res.status(400).json({
        error: finalMessage,
        resultCode: result.resultCode,
        category: info.category,
      })
    }

    let qrCodeImage = ''
    const qrSource = result.qrCodeUrl || result.payUrl
    if (qrSource) {
      try {
        qrCodeImage = await QRCode.toDataURL(qrSource, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 400,
        })
      } catch (qrErr) {
        console.error('[create-p2p] QR Generate Error:', qrErr.message)
      }
    }

    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo, status: 'PENDING',
        createdAt: now, paidAt: null, transId: '', payType: '',
        paymentOption: '', source: 'create-p2p',
        storeId, storeName, partnerName,
        payUrl: result.payUrl || '',
        deeplink: result.deeplink || '',
        qrCodeUrl: result.qrCodeUrl || '',
        qrCodeImage,
        requestId: result.requestId || '',
        // Bổ sung toàn bộ field còn lại MoMo trả về ở bước tạo giao dịch
        // mà trước đây bị bỏ qua — resultCode lúc này luôn là 0 (thành
        // công) nhưng vẫn lưu lại để đồng nhất cấu trúc với nhánh FAILED,
        // dễ debug/đối chiếu. applink/deeplinkMiniApp: một số merchant có
        // được MoMo trả, một số thì không (tuỳ cấu hình) — lưu phòng khi có.
        resultCode: result.resultCode ?? 0,
        message: result.message || '',
        responseTime: result.responseTime || null,
        orderType: result.orderType || '',
        extraData: result.extraData || '',
        applink: result.applink || '',
        deeplinkMiniApp: result.deeplinkMiniApp || '',
        type: 'p2p',
      }),
    })

    return res.status(200).json({
      payUrl: result.payUrl,
      deeplink: result.deeplink,
      qrCodeUrl: result.qrCodeUrl,
      qrCodeImage,
      orderId: result.orderId,
      requestId: result.requestId,
      storeId,
      storeName,
    })
  } catch (err) {
    console.error('[MoMo] create-p2p error:', err)
    // Trước đây nhánh lỗi này KHÔNG cập nhật Redis — đơn bị bỏ lại ở trạng
    // thái PENDING dù thực chất tạo thất bại. Với tính năng đồng bộ, điều
    // đó nghĩa là một vé "ma" (PENDING vô thời hạn) sẽ hiện ra ở MỌI thiết
    // bị khác. Sửa luôn: đánh dấu FAILED + gỡ khỏi danh sách đang mở.
    try {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo, status: 'FAILED',
          createdAt: now, paidAt: null, transId: '', payType: '',
          paymentOption: '', source: 'create-p2p',
          storeId, storeName, partnerName, error: 'server_error',
          message: `⚠ Lỗi hệ thống (server) khi gọi MoMo — ADMIN cần kiểm tra log server: ${err.message || 'không rõ nguyên nhân'}`,
          type: 'p2p',
        }),
      })
      await markOrderClosed(redis, orderId)
    } catch (cleanupErr) {
      console.error('[MoMo] create-p2p cleanup error:', cleanupErr)
    }
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}