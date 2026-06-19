// pages/api/momo/orders.js
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Xác thực qua cookie session httpOnly (xem lib/requireAdmin.js + /api/admin/login)
  // — KHÔNG còn dùng ?key=... vì key truyền qua query string sẽ lưu vào access log,
  // lịch sử trình duyệt, và phải để public (NEXT_PUBLIC_) ở phía client mới gọi được.
  if (!requireAdmin(req, res)) return

  const raw = await redis.hgetall('momo:orders')
  if (!raw) return res.status(200).json({ orders: [], total: 0 })

  const orders = Object.values(raw)
    .map(v => (typeof v === 'string' ? JSON.parse(v) : v))
    .sort((a, b) => new Date(b.createdAt || b.paidAt || 0) - new Date(a.createdAt || a.paidAt || 0))

  return res.status(200).json({ orders, total: orders.length })
}
