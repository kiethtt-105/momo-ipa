import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const POS_ENDPOINT = process.env.MOMO_POS_ENDPOINT ||
  (process.env.MOMO_ENDPOINT || '').replace(/\/create$/, '/pos')

function sign(raw) {
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
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

  const { orderId, amount, orderInfo, paymentCode } = req.body

  if (!orderId || !amount || !orderInfo || !paymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ' })
  }

  // Quick Pay v1 /v2/gateway/api/pos dùng partnerRefId (không phải orderId)
  // và KHÔNG có orderType, extraData, autoCapture
  const partnerRefId = orderId

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${amt}`,
    `partnerCode=${PARTNER_CODE}`,
    `partnerRefId=${partnerRefId}`,
    `paymentCode=${paymentCode}`,
  ].join('&')

  const body = {
    partnerCode: PARTNER_CODE,
    partnerRefId,
    amount: amt,
    paymentCode,
    storeId:   '',
    storeName: '',
    signature: sign(rawSignature),
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
    console.log('[POS] body:', JSON.stringify(body))

    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })
    const rawText = await momoRes.text()
    console.log('[POS] status:', momoRes.status)
    console.log('[POS] raw response:', rawText)

    const data = JSON.parse(rawText)

    // v1 trả về { status, message: { transid, description, amount, ... } }
    const success = data.status === 0

    const updated = {
      orderId, amount: amt, orderInfo,
      status: success ? 'PAID' : 'FAILED',
      createdAt: now,
      paidAt:    success ? new Date().toISOString() : null,
      transId:   data.message?.transid?.toString() || data.transId?.toString() || '',
      payType:   'pos',
      resultCode: data.status ?? data.resultCode,
      message:   data.message?.description || data.message || '',
      responseTime: Date.now(),
      source: 'pos',
    }
    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    // Chuẩn hoá response về dạng quen thuộc cho frontend
    return res.status(200).json({
      resultCode: data.status ?? data.resultCode ?? -1,
      message:    data.message?.description || data.message || '',
      transId:    updated.transId,
      payType:    'pos',
      raw:        data,
    })
  } catch (err) {
    console.error('[POS] error:', err)
    return res.status(500).json({ error: 'Lỗi server' })
  }
}