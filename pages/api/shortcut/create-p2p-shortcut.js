import { createMoMoPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'
import { resolveStore } from '../../../lib/stores'
import { markOrderOpen, markOrderClosed } from '../../../lib/openOrders'
import { describeResultCode, formatResultCodeMessage } from '../../../lib/momoResultCodes'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// File này CHỈ dành cho SHORTCUT (Shortcuts app trên iPhone gọi thẳng vào đây).
// KHÔNG dùng requireAdmin (không có session đăng nhập trong Shortcuts) —
// thay vào đó xác thực bằng SHORTCUT_API_KEY tĩnh, đặt trong biến môi trường.
// Nhánh admin (đăng nhập trang quản trị) nằm riêng ở create-p2p.js.
//
// Response chỉ trả về orderId (và link trang thanh toán) để Shortcut lấy
// và tự gửi link `https://kiehtt.vercel.app/pay/<orderId>` cho khách —
// không cần QR code ở bước này (trang /pay/ tự lo phần hiển thị QR).

const PAY_PAGE_BASE = 'https://kiehtt.vercel.app/pay'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const params = req.method === 'GET' ? req.query : req.body

  // ─── XÁC THỰC BẰNG KEY (thay cho requireAdmin) ─────────────────
  const key = (params.key || req.headers['x-shortcut-key'] || '').toString().trim()
  if (!process.env.SHORTCUT_API_KEY) {
    console.error('[create-p2p-shortcut] Thiếu SHORTCUT_API_KEY trong env — chặn toàn bộ request để an toàn.')
    return res.status(500).json({ error: 'Server chưa cấu hình SHORTCUT_API_KEY' })
  }
  if (!key || key !== process.env.SHORTCUT_API_KEY) {
    return res.status(401).json({ error: 'Sai hoặc thiếu key' })
  }

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

  // storeId: giống create-p2p.js — nếu không truyền thì resolveStore tự
  // lấy store mặc định (đánh dấu "default" trong MOMO_STORES).
  const rawStoreId = (params.storeId || '').toString().trim()
  const store = resolveStore(rawStoreId)

  const storeId = store.id
  const storeName = store.name
  const partnerName = store.partnerName

  const now = new Date().toISOString()
  const payPageUrl = `${PAY_PAGE_BASE}/${orderId}`

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo, status: 'PENDING',
        createdAt: now, paidAt: null, transId: '', payType: '',
        paymentOption: '', source: 'create-p2p-shortcut',
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
          paymentOption: '', source: 'create-p2p-shortcut',
          storeId, storeName, partnerName, error: result.message || '',
          message: finalMessage, resultCode: result.resultCode,
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
        orderId,
      })
    }

    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo, status: 'PENDING',
        createdAt: now, paidAt: null, transId: '', payType: '',
        paymentOption: '', source: 'create-p2p-shortcut',
        storeId, storeName, partnerName,
        payUrl: result.payUrl || '',
        deeplink: result.deeplink || '',
        qrCodeUrl: result.qrCodeUrl || '',
        requestId: result.requestId || '',
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

    // Cái Shortcut cần chủ yếu là orderId + link trang /pay/ để gửi thẳng
    // cho khách — không trả payUrl/deeplink/qrCode raw ra đây nữa.
    return res.status(200).json({
      orderId,
      payPageUrl,
      amount: amt,
      orderInfo,
      storeId,
      storeName,
    })
  } catch (err) {
    console.error('[MoMo] create-p2p-shortcut error:', err)
    try {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo, status: 'FAILED',
          createdAt: now, paidAt: null, transId: '', payType: '',
          paymentOption: '', source: 'create-p2p-shortcut',
          storeId, storeName, partnerName, error: 'server_error',
          message: `⚠ Lỗi hệ thống (server) khi gọi MoMo — ADMIN cần kiểm tra log server: ${err.message || 'không rõ nguyên nhân'}`,
          type: 'p2p',
        }),
      })
      await markOrderClosed(redis, orderId)
    } catch (cleanupErr) {
      console.error('[MoMo] create-p2p-shortcut cleanup error:', cleanupErr)
    }
    return res.status(500).json({ error: 'Lỗi server, thử lại sau', orderId })
  }
}
