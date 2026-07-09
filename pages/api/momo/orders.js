// pages/api/momo/orders.js
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()


  if (!requireAdmin(req, res)) return

  const raw = await redis.hgetall('momo:orders')
  if (!raw) return res.status(200).json({ orders: [], total: 0 })

  let orders = Object.values(raw)
    .map(v => (typeof v === 'string' ? JSON.parse(v) : v))
    .sort((a, b) => new Date(b.createdAt || b.paidAt || 0) - new Date(a.createdAt || a.paidAt || 0))

  // Hỗ trợ lọc theo orderId qua query string, vd:
  // /api/momo/orders?orderId=iPOS1783539592319xnzu
  // Trước đây route này bỏ qua mọi query param nên truyền orderId lên URL
  // không có tác dụng gì — luôn trả về TOÀN BỘ đơn. Giờ nếu có orderId,
  // chỉ trả về (các) đơn khớp — khớp CHỨA chuỗi (không phân biệt hoa/thường)
  // để vẫn dùng được như tra cứu gần đúng, không bắt buộc gõ chính xác 100%.
  const { orderId } = req.query
  if (orderId) {
    const needle = String(orderId).trim().toLowerCase()
    orders = orders.filter(o => (o.orderId || '').toLowerCase().includes(needle))
  }

  return res.status(200).json({ orders, total: orders.length })
}