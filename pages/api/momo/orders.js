import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { key } = req.query
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const raw = await redis.hgetall('momo:orders')
  if (!raw) return res.status(200).json({ orders: [], total: 0 })

  const orders = Object.values(raw)
    .map(v => typeof v === 'string' ? JSON.parse(v) : v)
    .sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0))

  return res.status(200).json({ orders, total: orders.length })
}
