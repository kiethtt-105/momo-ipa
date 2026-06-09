// pages/api/momo/status.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { orderId } = req.query
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  const raw = await redis.hget('momo:orders', orderId)
  if (!raw) return res.status(200).json({ status: 'PENDING', orderId })

  const order = typeof raw === 'string' ? JSON.parse(raw) : raw
  return res.status(200).json(order)
}
