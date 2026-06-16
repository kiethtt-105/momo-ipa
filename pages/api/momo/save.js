// pages/api/momo/save.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    orderId, transId, amount, payType, orderInfo, resultCode,
    // === CÁC FIELD MỚI ===
    requestId, message, responseTime, orderType, extraData,
  } = req.body

  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  const isPaid = parseInt(resultCode) === 0
  const now = new Date().toISOString()

  // Lấy record hiện tại để giữ createdAt gốc
  let existing = await redis.hget('momo:orders', orderId)
  if (existing) {
    existing = typeof existing === 'string' ? JSON.parse(existing) : existing
    // Nếu đã PAID (từ IPN) thì không ghi đè
    if (existing.status === 'PAID') {
      return res.status(200).json({ ok: true, source: 'already_paid' })
    }
  }

  const record = {
    orderId,
    transId:      transId      || existing?.transId      || '',
    amount:       parseInt(amount || existing?.amount    || 0),
    payType:      payType      || existing?.payType      || '',
    orderInfo:    orderInfo    || existing?.orderInfo    || '',
    resultCode:   parseInt(resultCode || 0),
    message:      message      || existing?.message      || '', // ← MỚI
    responseTime: responseTime || existing?.responseTime || null, // ← MỚI
    orderType:    orderType    || existing?.orderType    || '', // ← MỚI
    extraData:    extraData    || existing?.extraData    || '', // ← MỚI
    requestId:    requestId    || existing?.requestId    || '', // ← MỚI
    paidAt:       isPaid ? now : (existing?.paidAt || null),
    createdAt:    existing?.createdAt || now,
    status:       isPaid ? 'PAID' : 'FAILED',
    source:       'redirect',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })
  console.log(`[Save API] Order ${orderId} → ${isPaid ? 'PAID' : 'FAILED'} | ${message || ''}`)

  return res.status(200).json({ ok: true })
}
