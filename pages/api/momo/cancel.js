// pages/api/momo/cancel.js
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'
import { markOrderClosed } from '../../../lib/openOrders'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // orderId dạng iPOS<timestamp> khá dễ đoán — không auth thì ai cũng huỷ
  // được giao dịch PENDING của người khác. Chỉ admin đã đăng nhập mới được hủy.
  if (!requireAdmin(req, res)) return

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

    if (order.status !== 'PENDING') {
      // Tự chữa lành: đơn đã ở trạng thái cuối rồi nhưng lỡ còn sót trong
      // index "đang mở" → dọn luôn (an toàn, vô hại nếu gọi thừa).
      await markOrderClosed(redis, orderId)
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
    // Hủy = kết luận cuối → gỡ khỏi danh sách đang mở, để mọi thiết bị
    // đồng bộ khác cũng ngừng thấy vé này ngay lần poll list-open kế tiếp.
    await markOrderClosed(redis, orderId)
    return res.status(200).json(order)
  } catch (err) {
    console.error('[cancel] Lỗi:', err.message)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}