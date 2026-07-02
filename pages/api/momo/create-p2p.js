@ -1,150 +0,0 @@
import { createMoMoPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'
import QRCode from 'qrcode'
import { requireAdmin } from '../../../lib/requireAdmin'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const STORE_ID = process.env.MOMO_STORE_ID || ''
const STORE_NAME = process.env.MOMO_STORE_NAME || ''
const PARTNER_NAME = process.env.MOMO_PARTNER_NAME || ''

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Route này tạo giao dịch THẬT bằng credential merchant — chỉ admin đã
  // đăng nhập mới được gọi (xem giải thích tương tự trong create-atm.js).
  if (!requireAdmin(req, res)) return

  const params = req.method === 'GET' ? req.query : req.body

  const amt = parseInt(params.amount)
  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 50.000.000 ₫)' })
  }


  const rawOrderId = (params.orderId || '').toString().trim()
  const rawOrderInfo = (params.orderInfo || '').toString().trim()

  // Sanitize: chỉ giữ chữ/số/_-, bỏ khoảng trắng và ký tự đặc biệt vì MoMo
  // không chấp nhận orderId chứa dấu cách (lỗi resultCode 20 "Yêu cầu sai định dạng")
  const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '')

  let orderId
  if (rawOrderId) {
    const clean = sanitize(rawOrderId)
    orderId = clean.startsWith('iPOS') ? clean : `iPOS${clean}`
  } else {
    // KHÔNG dùng orderInfo để tạo orderId nữa (orderInfo có thể chứa dấu cách/tiếng Việt)
    orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  }

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    orderInfo = `Thanh toan DH ${orderId}`
  }
  // Cho phép override storeId/storeName/partnerName theo request, fallback về env
  const storeId = (params.storeId || STORE_ID || '').toString().trim()
  const storeName = (params.storeName || STORE_NAME || '').toString().trim()
  const partnerName = (params.partnerName || PARTNER_NAME || '').toString().trim()

  const now = new Date().toISOString()

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId,
        amount: amt,
        orderInfo,
        status: 'PENDING',
        createdAt: now,
        paidAt: null,
        transId: '',
        payType: '',
        paymentOption: '',
        source: 'create-p2p',
        storeId,
        storeName,
        partnerName,
      }),
    })

    const result = await createMoMoPayment({
      orderId,
      amount: amt,
      orderInfo,
      storeId,
      storeName,
      partnerName,
    })

    if (result.resultCode !== 0) {
      return res.status(400).json({
        error: result.message || 'MoMo từ chối giao dịch',
        resultCode: result.resultCode,
      })
    }

    // Chỉ thêm: tự generate ảnh QR (base64 PNG) — ƯU TIÊN dùng result.qrCodeUrl
    // (chuỗi VietQR/EMV gốc do MoMo trả về, quét được bằng cả app MoMo lẫn app
    // ngân hàng bất kỳ, giống QR VietQR chuẩn). Chỉ fallback về payUrl (mở trang
    // web thanh toán) nếu tài khoản chưa được cấp quyền dùng field qrCodeUrl.
    let qrCodeImage = ''
    const qrSource = result.qrCodeUrl || result.payUrl
    if (qrSource) {
      try {
        qrCodeImage = await QRCode.toDataURL(qrSource, {
          errorCorrectionLevel: 'H', // mức sửa lỗi cao nhất — cho phép overlay logo giữa QR mà vẫn quét được
          margin: 1,
          width: 400,
        })
      } catch (qrErr) {
        console.error('[create-p2p] QR Generate Error:', qrErr.message)
      }
    }

    // Lưu thêm payUrl + qrCodeImage vào record của đơn (cập nhật lại record PENDING
    // đã tạo ở trên), để phòng trường hợp lỡ tay đóng trình duyệt vẫn tra cứu lại
    // được link/QR để thanh toán tiếp qua status.js / orders.js, không cần tạo đơn mới.
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId,
        amount: amt,
        orderInfo,
        status: 'PENDING',
        createdAt: now,
        paidAt: null,
        transId: '',
        payType: '',
        paymentOption: '',
        source: 'create-p2p',
        storeId,
        storeName,
        partnerName,
        payUrl: result.payUrl || '',
        deeplink: result.deeplink || '',
        qrCodeUrl: result.qrCodeUrl || '',
        qrCodeImage,
        requestId: result.requestId || '',
      }),
    })

    return res.status(200).json({
      payUrl: result.payUrl,
      deeplink: result.deeplink,
      qrCodeUrl: result.qrCodeUrl,
      qrCodeImage, // data:image/png;base64,... - QR VietQR thật (từ qrCodeUrl), quét trực tiếp bằng app MoMo/ngân hàng
      orderId: result.orderId,
      requestId: result.requestId,
    })
  } catch (err) {
    console.error('[MoMo] create-p2p error:', err)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}