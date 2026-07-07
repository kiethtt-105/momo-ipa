// pages/api/momo/list-open.js
//
// Trả về TOÀN BỘ giao dịch đang mở (PENDING) hiện có trong hệ thống — dùng
// cho tính năng ĐỒNG BỘ GIAO DỊCH giữa nhiều tab/thiết bị trên
// create-transaction.js: mỗi client poll route này định kỳ để phát hiện
// đơn được tạo/xử lý ở nơi khác mà mình chưa biết, rồi tự thêm vé tương
// ứng vào bảng của mình.
//
// Đọc từ sorted set `momo:open-orders` (xem lib/openOrders.js) thay vì
// quét toàn bộ hash `momo:orders` — set này chỉ chứa đúng các orderId
// đang PENDING nên luôn nhỏ gọn, không phình theo lịch sử giao dịch.
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'
import { OPEN_ORDERS_KEY } from '../../../lib/openOrders'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const EXPIRE_MINUTES = parseInt(process.env.MOMO_EXPIRE_MINUTES || '10', 10)
const EXPIRE_MS = EXPIRE_MINUTES * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Danh sách này lộ toàn bộ đơn đang chờ của TẤT CẢ quầy/thiết bị — chỉ
  // admin đã đăng nhập mới được xem, giống mọi route momo/* khác.
  if (!requireAdmin(req, res)) return

  try {
    const ids = await redis.zrange(OPEN_ORDERS_KEY, 0, -1)
    if (!ids.length) return res.status(200).json({ orders: [] })

    const raws = await redis.hmget('momo:orders', ...ids)
    const orders = []
    const staleIds = []

    for (let i = 0; i < ids.length; i++) {
      const orderId = ids[i]
      const raw = raws[i]

      // Record không còn tồn tại trong hash (không nên xảy ra, nhưng đề
      // phòng) → dọn luôn khỏi index.
      if (!raw) { staleIds.push(orderId); continue }

      const order = typeof raw === 'string' ? JSON.parse(raw) : raw

      // Đơn đã có kết luận cuối (do request khác vừa cập nhật đúng lúc ta
      // đọc, trước khi kịp zrem) → không trả về + dọn luôn tại đây.
      if (order.status !== 'PENDING') { staleIds.push(orderId); continue }

      // Tự phát hiện + dọn đơn đã quá hạn mà chưa route status.js nào kịp
      // poll tới để chuyển EXPIRED — tránh vé "ma" hiện mãi trên các thiết
      // bị đang đồng bộ dù thực chất đã hết hạn từ lâu.
      const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : Date.now()
      if (Date.now() - createdAt > EXPIRE_MS) {
        staleIds.push(orderId)
        try {
          await redis.hset('momo:orders', {
            [orderId]: JSON.stringify({ ...order, status: 'EXPIRED' }),
          })
        } catch (e) {
          console.error('[list-open] Lỗi cập nhật EXPIRED:', e.message)
        }
        continue
      }

      orders.push(order)
    }

    if (staleIds.length) {
      await redis.zrem(OPEN_ORDERS_KEY, ...staleIds)
    }

    return res.status(200).json({ orders })
  } catch (err) {
    console.error('[list-open] Lỗi:', err.message)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}