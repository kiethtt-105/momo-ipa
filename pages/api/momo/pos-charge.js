// /pages/api/momo/pos-charge.js
// Route NÀY KHÔNG check session admin (cookie) — dành riêng cho gọi từ Shortcuts/app ngoài.
// Bảo mật bằng 1 secret key riêng (MOMO_SHORTCUT_SECRET) thay cho session.
//
// Cách gọi từ Shortcuts (action "Get Contents of URL"):
//   Method: POST
//   URL: https://your-domain.vercel.app/api/momo/pos-charge
//   Headers: Content-Type: application/json
//            x-shortcut-key: <giá trị MOMO_SHORTCUT_SECRET>
//   Body (JSON):
//     {
//       "orderId": "TEST001",          // optional, tự sinh nếu bỏ trống
//       "amount": 10000,
//       "orderInfo": "Thanh toan ban hang",  // optional
//       "paymentCode": "970000123456789012"   // 18 số quét được từ camera
//     }

import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE     = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY       = process.env.MOMO_ACCESS_KEY
const SECRET_KEY       = process.env.MOMO_SECRET_KEY
const PUBLIC_KEY       = process.env.MOMO_POS_PUBLIC_KEY || ''
const PARTNER_NAME     = process.env.MOMO_PARTNER_NAME || ''
const STORE_ID         = process.env.MOMO_STORE_ID || ''
const STORE_NAME       = process.env.MOMO_STORE_NAME || ''
const SHORTCUT_SECRET  = process.env.MOMO_SHORTCUT_SECRET || '' // tự đặt 1 chuỗi bí mật dài trong env
const POS_ENDPOINT     = 'https://payment.momo.vn/v2/gateway/api/pos'

function sign(raw) {
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

function encryptPaymentCode(code) {
  if (!PUBLIC_KEY) throw new Error('MOMO_POS_PUBLIC_KEY chưa được thiết lập trong .env')

  let normalized = PUBLIC_KEY.replace(/\\n/g, '\n').trim()
  if (!normalized.includes('-----BEGIN')) {
    normalized = `-----BEGIN PUBLIC KEY-----\n${normalized}\n-----END PUBLIC KEY-----`
  }

  return crypto.publicEncrypt(
    { key: normalized, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(code)
  ).toString('base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ====== Xác thực bằng secret key thay vì session admin ======
  if (!SHORTCUT_SECRET) {
    return res.status(500).json({ error: 'Server chưa cấu hình MOMO_SHORTCUT_SECRET' })
  }

  const clientKey = req.headers['x-shortcut-key'] || req.body?.secretKey
  if (clientKey !== SHORTCUT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized - sai secret key' })
  }

  let { orderId: rawOrderId, amount, orderInfo: rawOrderInfo, paymentCode: rawPaymentCode } = req.body

  if (!amount || !rawPaymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: amount, paymentCode' })
  }

  // Sanitize: chỉ giữ chữ/số/_-, bỏ khoảng trắng và ký tự đặc biệt vì MoMo
  // không chấp nhận orderId chứa dấu cách (lỗi resultCode 20 "Yêu cầu sai định dạng")
  const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '')

  let orderId
  if (rawOrderId) {
    const clean = sanitize(String(rawOrderId).trim())
    orderId = (clean.startsWith('iPOS') || clean.startsWith('POS')) ? clean : `iPOS${clean}`
  } else if (rawOrderInfo) {
    // Shortcut trên iPhone thường chỉ gửi amount + orderInfo, không gửi
    // orderId riêng — trước đây rơi vào nhánh dưới, sinh 1 orderId ngẫu
    // nhiên hoàn toàn khác orderInfo, khiến "Mã đơn hàng" và "Nội dung"
    // lệch nhau (cùng lỗi đã gặp ở create-p2p.js). Giờ dùng chính orderInfo
    // (đã sanitize) làm orderId, chỉ fallback ngẫu nhiên nếu sanitize xong rỗng.
    const clean = sanitize(String(rawOrderInfo).trim())
    orderId = clean
      ? ((clean.startsWith('iPOS') || clean.startsWith('POS')) ? clean : `iPOS${clean}`)
      : `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  } else {
    orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  }

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    // Đồng bộ với create-p2p.js / scan.js: "Thanh Toán {mã đơn hàng}"
    orderInfo = `Thanh Toán ${orderId}`
  }

  const paymentCode = String(rawPaymentCode).trim()
  if (!/^(MM|mm)?\d{18}$/.test(paymentCode)) {
    return res.status(400).json({ error: 'Mã thanh toán không hợp lệ (18 chữ số, có thể có MM/mm)' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 10_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 10.000.000 ₫)' })
  }

  let encryptedCode
  try {
    encryptedCode = encryptPaymentCode(paymentCode)
  } catch (err) {
    console.error('[pos-charge] RSA Encrypt Error:', err.message)
    return res.status(500).json({ error: 'Lỗi mã hóa mã thanh toán' })
  }

  const requestId = `${PARTNER_CODE}_${Date.now()}`
  const extraData = ''

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${amt}`,
    `extraData=${extraData}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${PARTNER_CODE}`,
    `paymentCode=${encryptedCode}`,
    `requestId=${requestId}`,
  ].join('&')

  const body = {
    partnerCode: PARTNER_CODE,
    partnerName: PARTNER_NAME,
    requestId,
    amount: amt,
    orderId,
    orderInfo,
    paymentCode: encryptedCode,
    extraData,
    autoCapture: true,
    lang: 'vi',
    signature: sign(rawSignature),
  }

  if (STORE_ID)   body.storeId   = STORE_ID
  if (STORE_NAME) body.storeName = STORE_NAME

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
        source: 'shortcut-pos',
      }),
    })

    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000), // 15s timeout - tránh treo vô thời hạn
    })

    const rawText = await momoRes.text()
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo,
          status: 'FAILED', createdAt: now, paidAt: null,
          transId: '', payType: 'pos', paymentOption: '',
          resultCode: -1, message: 'MoMo trả về dữ liệu không hợp lệ',
          source: 'shortcut-pos',
        }),
      })
      return res.status(500).json({ error: 'MoMo trả về dữ liệu không hợp lệ', raw: rawText })
    }

    const updated = {
      orderId,
      amount: amt,
      orderInfo,
      status: data.resultCode === 0 ? 'PAID' : 'FAILED',
      createdAt: now,
      paidAt: data.resultCode === 0 ? new Date().toISOString() : null,
      transId: data.transId?.toString() || '',
      payType: data.payType || 'pos',
      paymentOption: data.paymentOption || '',
      resultCode: data.resultCode,
      message: data.message || 'Không có thông báo',
      responseTime: data.responseTime,
      source: 'shortcut-pos',
    }

    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    console.log(`[pos-charge] ${orderId} - resultCode: ${data.resultCode} - message: ${data.message}`)

    // Trả về gọn cho Shortcuts dễ hiển thị
    return res.status(200).json({
      success: data.resultCode === 0,
      resultCode: data.resultCode,
      message: data.message,
      orderId,
      amount: amt,
      transId: data.transId || '',
    })

  } catch (err) {
    console.error('[pos-charge] Server Error:', err)
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
    try {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo,
          status: 'FAILED', createdAt: now, paidAt: null,
          transId: '', payType: 'pos', paymentOption: '',
          resultCode: -1,
          message: isTimeout ? 'Timeout khi gọi MoMo (15s)' : (err.message || 'Lỗi server'),
          source: 'shortcut-pos',
        }),
      })
    } catch (redisErr) {
      console.error('[pos-charge] Redis update FAILED error:', redisErr)
    }
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Timeout khi gọi MoMo, vui lòng thử lại' : 'Lỗi server khi xử lý thanh toán',
    })
  }
}