import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const PUBLIC_KEY   = process.env.MOMO_POS_PUBLIC_KEY || ''
const POS_ENDPOINT = 'https://payment.momo.vn/v2/gateway/api/pos'

function sign(raw) {
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

function encryptPaymentCode(code) {
  if (!PUBLIC_KEY) throw new Error('MOMO_POS_PUBLIC_KEY chưa được set')
  const normalized = PUBLIC_KEY.replace(/\\n/g, '\n').trim()
  const pubKey = normalized.includes('-----BEGIN')
    ? normalized
    : `-----BEGIN PUBLIC KEY-----\n${normalized}\n-----END PUBLIC KEY-----`
  return crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(code)
  ).toString('base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const cookie = req.headers.cookie || ''
  const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/session`, {
    headers: { cookie },
  })
  if (!sessionRes.ok || !(await sessionRes.json()).authed) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { orderId, amount, orderInfo, paymentCode: rawPaymentCode } = req.body

  if (!orderId || !amount || !orderInfo || !rawPaymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' })
  }

  const paymentCode = String(rawPaymentCode).trim()
  if (!/^(MM|mm)?\d{18}$/.test(paymentCode)) {
    return res.status(400).json({ error: 'Mã thanh toán không hợp lệ (cần 18 chữ số, có thể kèm tiền tố MM/mm)' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 5_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1,000–5,000,000 ₫)' })
  }

  const requestId = `${orderId}_${Date.now()}`
  const extraData = 'e30='

  // Encrypt paymentCode cho body
  let encryptedCode
  try {
    encryptedCode = encryptPaymentCode(paymentCode)
  } catch (err) {
    console.error('[POS] RSA encrypt error:', err.message)
    return res.status(500).json({ error: err.message })
  }

  // MoMo verify signature bằng encrypted code (raw base64, không encode)
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
    orderId,
    requestId,
    amount:      amt,
    orderInfo,
    paymentCode: encryptedCode,
    extraData,
    autoCapture: true,
    lang:        'vi',
    signature:   sign(rawSignature),
  }

  const now = new Date().toISOString()

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo,
        status: 'PENDING', createdAt: now,
        paidAt: null, transId: '', payType: '',
        source: 'pos',
      }),
    })

    console.log('[POS] endpoint:', POS_ENDPOINT)
    console.log('[POS] paymentCode plain:', paymentCode)
    console.log('[POS] encryptedCode:', encryptedCode)
    console.log('[POS] rawSignature:', rawSignature.replace(ACCESS_KEY, '***'))
    console.log('[POS] body:', JSON.stringify({ ...body, paymentCode: '[ENCRYPTED]' }))

    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })
    const rawText = await momoRes.text()
    console.log('[POS] status:', momoRes.status)
    console.log('[POS] raw response:', rawText)

    const data = JSON.parse(rawText)

    const updated = {
      orderId, amount: amt, orderInfo,
      status:       data.resultCode === 0 ? 'PAID' : 'FAILED',
      createdAt:    now,
      paidAt:       data.resultCode === 0 ? new Date().toISOString() : null,
      transId:      data.transId?.toString() || '',
      payType:      data.payType || 'pos',
      resultCode:   data.resultCode,
      message:      data.message,
      responseTime: data.responseTime,
      source:       'pos',
    }
    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    return res.status(200).json(data)
  } catch (err) {
    console.error('[POS] error:', err)
    return res.status(500).json({ error: 'Lỗi server' })
  }
}