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

  // Idempotency: chỉ lưu nếu IPN chưa lưu trước đó
  const existing = await redis.hget('momo:orders', orderId)
  if (existing) return res.status(200).json({ ok: true, source: 'existing' })

  const isPaid = parseInt(resultCode) === 0
  const now = new Date().toISOString()

  const record = {
    orderId,
    transId:    transId   || '',
    amount:     parseInt(amount) || 0,   // FIX BUG 3: parseInt
    payType:    payType   || '',
    orderInfo:  orderInfo || '',
    resultCode: parseInt(resultCode || 0),
    paidAt:     isPaid ? now : null,     // FIX BUG 2: null nếu thất bại
    createdAt:  now,
    status:     isPaid ? 'PAID' : 'FAILED',
    source:     'redirect',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })

  return res.status(200).json({ ok: true, source: 'redirect' })
}
