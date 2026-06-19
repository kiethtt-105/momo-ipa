// pages/api/momo/query.js
//
// API tra cứu trạng thái giao dịch MoMo (POST /v2/gateway/api/query)
// Spec: https://developers.momo.vn/v3/vi/docs/payment/api/payment-api/query/
//
// ⚠️ Đặt đúng path này: pages/api/momo/query.js (Next.js Pages Router)
// để khớp với fetch('/api/momo/query') trong admin.js

import crypto from 'crypto'

// MoMo docs: dùng endpoint test khi chưa go-live, đổi sang production khi đã duyệt merchant
const MOMO_ENDPOINT =process.env.MOMO_QUERY_ENDPOINT

// ⚠️ Đổi tên các biến env này để KHỚP với những gì bạn đã dùng ở
// các route MoMo khác (create order, ipn...). Đây chỉ là tên gợi ý.
const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY = process.env.MOMO_ACCESS_KEY
const SECRET_KEY = process.env.MOMO_SECRET_KEY

// Yêu cầu timeout MIN 30s theo docs MoMo. Next.js (>=13.4) đọc được
// `maxDuration` export trong cả pages/api và app/api khi deploy lên Vercel.
// Nếu bản Next.js/Vercel của bạn không nhận export này, set thêm trong
// vercel.json:
//   { "functions": { "pages/api/momo/query.js": { "maxDuration": 30 } } }
export const config = {
  maxDuration: 30,
}

function buildSignature({ accessKey, orderId, partnerCode, requestId }) {
  // Theo docs: accessKey=$accessKey&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId
  const raw = `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

export default async function handler(req, res) {
  // Luôn trả JSON, không bao giờ để Next.js tự render trang lỗi HTML
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} không được hỗ trợ` })
  }

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[momo/query] Thiếu env: MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY')
    return res.status(500).json({ message: 'Server thiếu cấu hình MoMo (kiểm tra biến môi trường)' })
  }

  const orderId = (req.body && req.body.orderId ? String(req.body.orderId) : '').trim()
  if (!orderId) {
    return res.status(400).json({ message: 'orderId không hợp lệ' })
  }

  const requestId = Date.now().toString()
  const signature = buildSignature({
    accessKey: ACCESS_KEY,
    orderId,
    partnerCode: PARTNER_CODE,
    requestId,
  })

  const payload = {
    partnerCode: PARTNER_CODE,
    requestId,
    orderId,
    signature,
    lang: 'vi',
  }

  // Chủ động abort ở 28s (sớm hơn maxDuration 30s) để LUÔN kiểm soát được
  // response trả về client là JSON, không để platform tự cắt và trả HTML.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 28_000)

  try {
    const momoRes = await fetch(MOMO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const text = await momoRes.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      // MoMo (hoặc proxy ở giữa) trả về thứ không phải JSON -> log để debug,
      // nhưng vẫn trả JSON sạch cho client.
      console.error('[momo/query] MoMo trả dữ liệu không phải JSON:', text.slice(0, 300))
      return res.status(502).json({ message: 'MoMo server trả về dữ liệu không hợp lệ' })
    }

    return res.status(momoRes.ok ? 200 : momoRes.status).json(data)
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[momo/query] Timeout khi gọi MoMo (28s)')
      return res.status(504).json({ message: 'Hết thời gian chờ phản hồi từ MoMo (timeout)' })
    }
    console.error('[momo/query] Lỗi gọi MoMo:', err)
    return res.status(500).json({ message: err.message || 'Lỗi không xác định khi gọi MoMo' })
  } finally {
    clearTimeout(timer)
  }
}
