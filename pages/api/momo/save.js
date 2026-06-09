// pages/api/momo/save.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId, transId, amount, payType, orderInfo, resultCode } = req.body
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  // Chỉ lưu nếu IPN chưa lưu trước đó
  const existing = await redis.hget('momo:orders', orderId)
  if (existing) return res.status(200).json({ ok: true, source: 'existing' })

  const record = {
    orderId,
    transId:    transId   || '',
    amount:     amount    || 0,
    payType:    payType   || '',
    orderInfo:  orderInfo || '',
    resultCode: parseInt(resultCode || 0),
    paidAt:     new Date().toISOString(),
    createdAt:  new Date().toISOString(),
    status:     parseInt(resultCode) === 0 ? 'PAID' : 'FAILED',
    source:     'redirect',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })

  return res.status(200).json({ ok: true, source: 'redirect' })
}
