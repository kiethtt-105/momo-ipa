import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
// POS endpoint: same domain as ENDPOINT but /pos instead of /create
const POS_ENDPOINT = process.env.MOMO_POS_ENDPOINT ||
  (process.env.MOMO_ENDPOINT || '').replace(/\/create$/, '/pos')

function sign(raw) {
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Session guard — reuse same cookie auth as orders endpoint
  const cookie = req.headers.cookie || ''
  const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/session`, {
    headers: { cookie },
  })
  if (!sessionRes.ok || !(await sessionRes.json()).authed) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { orderId, amount, orderInfo, paymentCode } = req.body

  if (!orderId || !amount || !orderInfo || !paymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 5_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1,000–5,000,000 ₫)' })
  }

  const requestId = `${orderId}_${Date.now()}`
  const extraData = ''

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${amt}`,
    `extraData=${extraData}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${PARTNER_CODE}`,
    `paymentCode=${paymentCode}`,
    `requestId=${requestId}`,
  ].join('&')

  const body = {
    partnerCode: PARTNER_CODE,
    orderId,
    requestId,
    amount: amt,
    orderInfo,
    paymentCode,
    extraData,
    autoCapture: true,
    lang: 'vi',
    signature: sign(rawSignature),
  }

  try {
    // Save pending record
    const now = new Date().toISOString()
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo,
        status: 'PENDING', createdAt: now,
        paidAt: null, transId: '', payType: '',
        source: 'pos',
      }),
    })
    console.log('[POS] endpoint:', POS_ENDPOINT)
    console.log('[POS] body:', JSON.stringify(body))
    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await momoRes.json()

    // Update record with result
    const updated = {
      orderId, amount: amt, orderInfo,
      status: data.resultCode === 0 ? 'PAID' : 'FAILED',
      createdAt: now,
      paidAt: data.resultCode === 0 ? new Date().toISOString() : null,
      transId: data.transId?.toString() || '',
      payType: data.payType || 'pos',
      resultCode: data.resultCode,
      message: data.message,
      responseTime: data.responseTime,
      source: 'pos',
    }
    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    return res.status(200).json(data)
  } catch (err) {
    console.error('[POS] error:', err)
    return res.status(500).json({ error: 'Lỗi server' })
  }
}