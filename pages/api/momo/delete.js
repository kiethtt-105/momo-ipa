import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { key } = req.query
  const secret = process.env.ADMIN_SECRET_KEY

  if (!secret || !key || key !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { orderId } = req.body
  if (!orderId) {
    return res.status(400).json({ error: 'Thiếu orderId' })
  }

  try {
    await redis.hdel('momo:orders', orderId)
    console.log(`[Admin Delete] Đã xóa đơn: ${orderId}`)
    
    return res.status(200).json({ success: true, message: `Đã xóa đơn ${orderId}` })
  } catch (err) {
    console.error('Delete error:', err)
    return res.status(500).json({ error: 'Lỗi server khi xóa' })
  }
}