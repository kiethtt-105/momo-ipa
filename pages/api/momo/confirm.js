// pages/api/momo/confirm.js
// POST /v2/gateway/api/confirm
// Docs: https://developers.momo.vn/v3/vi/docs/payment/api/payment-api/confirm/

import crypto from 'crypto'

const MOMO_CONFIRM_ENDPOINT = process.env.MOMO_CONFIRM_ENDPOINT
const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY

export const config = { maxDuration: 30 }

function buildSignature({ accessKey, amount, description, orderId, partnerCode, requestId, requestType }) {
  // Đúng thứ tự theo docs:
  // accessKey=$accessKey&amount=$amount&description=$description
  // &orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId&requestType=$requestType
  const raw = `accessKey=${accessKey}&amount=${amount}&description=${description}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}&requestType=${requestType}`
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} không được hỗ trợ` })
  }

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    return res.status(500).json({ message: 'Server thiếu cấu hình MoMo' })
  }

  if (typeof MOMO_CONFIRM_ENDPOINT !== 'string' || !MOMO_CONFIRM_ENDPOINT.startsWith('http')) {
    return res.status(500).json({ message: 'Lỗi cấu hình: MOMO_CONFIRM_ENDPOINT không hợp lệ' })
  }

  const { orderId, amount, requestType, description = '' } = req.body || {}

  if (!orderId) return res.status(400).json({ message: 'orderId không hợp lệ' })
  if (!amount)  return res.status(400).json({ message: 'amount không hợp lệ' })
  if (!['capture', 'cancel'].includes(requestType)) {
    return res.status(400).json({ message: 'requestType phải là "capture" hoặc "cancel"' })
  }

  const requestId = Date.now().toString()
  const signature = buildSignature({
    accessKey:   ACCESS_KEY,
    amount:      String(amount),
    description: description,
    orderId:     String(orderId),
    partnerCode: PARTNER_CODE,
    requestId,
    requestType,
  })

  const payload = {
    partnerCode: PARTNER_CODE,
    requestId,
    orderId:     String(orderId),
    requestType,
    amount:      Number(amount),
    lang:        'vi',
    description,
    signature,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 28_000)

  try {
    console.log('[momo/confirm] Gọi MoMo:', MOMO_CONFIRM_ENDPOINT, payload)
    const momoRes = await fetch(MOMO_CONFIRM_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    })

    const text = await momoRes.text()
    let data
    try { data = JSON.parse(text) }
    catch {
      console.error('[momo/confirm] Response không phải JSON:', text.slice(0, 300))
      return res.status(502).json({ message: 'MoMo server trả về dữ liệu không hợp lệ' })
    }

    return res.status(momoRes.ok ? 200 : momoRes.status).json(data)
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ message: 'Timeout khi gọi MoMo (28s)' })
    }
    console.error('[momo/confirm] Lỗi:', err)
    return res.status(500).json({ message: err.message || 'Lỗi không xác định' })
  } finally {
    clearTimeout(timer)
  }
}