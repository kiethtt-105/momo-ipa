// pages/api/momo/cancel.js
// Hủy 1 đơn hàng đang PENDING theo yêu cầu admin (nút "Hủy giao dịch" trên
// trang create-transaction, cả luồng P2P lẫn Scan đều có thể dùng chung route này).
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const orderId = (req.body?.orderId || '').toString().trim()
  if (!orderId) {
    return res.status(400).json({ error: 'Thiếu orderId' })
  }

  try {
    const raw = await redis.hget('momo:orders', orderId)
    if (!raw) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' })
    }

    let order = typeof raw === 'string' ? JSON.parse(raw) : raw

    // Chỉ hủy khi đơn còn đang PENDING — tránh trường hợp khách vừa quét QR
    // thanh toán xong (IPN vừa cập nhật PAID) đúng lúc admin bấm hủy, hoặc
    // đơn đã kết luận FAILED/EXPIRED từ trước.
    if (order.status !== 'PENDING') {
      return res.status(200).json({ ...order, alreadyFinal: true })
    }

    const now = new Date().toISOString()
    order = {
      ...order,
      status:        'FAILED',
      message:       'Đã hủy bởi admin',
      resultCode:    order.resultCode ?? -2,
      lastCheckedAt: now,
      source:        'admin-cancelled',
    }

    await redis.hset('momo:orders', { [orderId]: JSON.stringify(order) })
    return res.status(200).json(order)
  } catch (err) {
    console.error('[cancel] Lỗi:', err.message)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}