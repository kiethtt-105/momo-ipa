// pages/api/momo/list-open.js
//
// Trả về TOÀN BỘ giao dịch NÊN ĐƯỢC ĐỒNG BỘ hiện có trong hệ thống — dùng
// cho tính năng ĐỒNG BỘ GIAO DỊCH giữa nhiều tab/thiết bị trên
// create-transaction.js: mỗi client poll route này định kỳ để phát hiện
// đơn được tạo/xử lý ở nơi khác mà mình chưa biết, rồi tự thêm vé tương
// ứng vào bảng của mình — BAO GỒM CẢ đơn vừa kết thúc (thành công/thất
// bại/hết hạn), không chỉ đơn đang PENDING (xem GHI CHÚ bên dưới).
//
// Đọc từ sorted set `momo:open-orders` (xem lib/openOrders.js) thay vì
// quét toàn bộ hash `momo:orders` — set này chỉ chứa các orderId đang
// hoạt động HOẶC vừa kết thúc gần đây nên luôn nhỏ gọn, không phình theo
// lịch sử giao dịch.
//
// GHI CHÚ VỀ GRACE PERIOD: một tab/thiết bị MỚI mở (chưa từng biết đến
// đơn hàng nào) chỉ có thể "thấy" được đơn qua đúng route này. Nếu đơn đã
// kết thúc (PAID/FAILED/EXPIRED) mà bị gỡ khỏi index NGAY LẬP TỨC, tab
// mới đó sẽ VĨNH VIỄN không bao giờ biết đơn từng tồn tại — trong khi tab
// đã tạo đơn thì vẫn hiển thị bình thường (vì giữ trong local state cho
// tới khi người dùng đóng tay). Để "giống các cửa sổ nội" như yêu cầu,
// đơn đã kết thúc vẫn được trả về thêm SYNC_GRACE_MS (mặc định 3 phút)
// sau thời điểm kết thúc, rồi mới bị dọn khỏi index.
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'
import { OPEN_ORDERS_KEY, removeFromOpenOrders } from '../../../lib/openOrders'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const EXPIRE_MINUTES = parseInt(process.env.MOMO_EXPIRE_MINUTES || '10', 10)
const EXPIRE_MS = EXPIRE_MINUTES * 60 * 1000

// Thời gian giữ lại 1 đơn ĐÃ KẾT THÚC (PAID/FAILED/EXPIRED) trong index
// đồng bộ sau khi nó đổi trạng thái — đủ để mọi tab/thiết bị khác kịp
// poll tới (mặc định poll mỗi 3s) và thấy được kết quả cuối cùng, dù họ
// chưa từng mở đơn này trước đó.
const SYNC_GRACE_MINUTES = parseInt(process.env.MOMO_SYNC_GRACE_MINUTES || '3', 10)
const SYNC_GRACE_MS = SYNC_GRACE_MINUTES * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Danh sách này lộ toàn bộ đơn đang/đã xử lý gần đây của TẤT CẢ
  // quầy/thiết bị — chỉ admin đã đăng nhập mới được xem, giống mọi route
  // momo/* khác.
  if (!requireAdmin(req, res)) return

  try {
    // Lấy kèm score (= thời điểm thay đổi trạng thái gần nhất) để tính
    // grace period cho các đơn đã kết thúc.
    const withScores = await redis.zrange(OPEN_ORDERS_KEY, 0, -1, { withScores: true })
    if (!withScores.length) return res.status(200).json({ orders: [] })

    // zrange withScores trả về mảng phẳng [member, score, member, score, ...]
    const ids = []
    const scoreById = {}
    for (let i = 0; i < withScores.length; i += 2) {
      const member = withScores[i]
      const score = Number(withScores[i + 1]) || 0
      ids.push(member)
      scoreById[member] = score
    }

    const raws = await redis.hmget('momo:orders', ...ids)
    const orders = []
    const staleIds = []
    const now = Date.now()

    for (let i = 0; i < ids.length; i++) {
      const orderId = ids[i]
      // @upstash/redis trả hmget về OBJECT keyed theo field name (orderId),
      // KHÔNG PHẢI mảng theo thứ tự như ioredis/node-redis — đọc đúng bằng
      // raws[orderId], không phải raws[i].
      const raw = raws ? raws[orderId] : null

      // Record không còn tồn tại trong hash (không nên xảy ra, nhưng đề
      // phòng) → dọn luôn khỏi index.
      if (!raw) { staleIds.push(orderId); continue }

      const order = typeof raw === 'string' ? JSON.parse(raw) : raw

      if (order.status === 'PENDING') {
        // Tự phát hiện + dọn đơn đã quá hạn mà chưa route status.js nào
        // kịp poll tới để chuyển EXPIRED — tránh vé "ma" hiện mãi trên
        // các thiết bị đang đồng bộ dù thực chất đã hết hạn từ lâu. Đơn
        // vừa chuyển EXPIRED vẫn được TRẢ VỀ (không stale) để các tab
        // khác thấy đúng trạng thái mới — chỉ score được refresh về hiện
        // tại để bắt đầu grace period của riêng nó.
        const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : now
        if (now - createdAt > EXPIRE_MS) {
          const expiredOrder = { ...order, status: 'EXPIRED' }
          try {
            await redis.hset('momo:orders', { [orderId]: JSON.stringify(expiredOrder) })
            await redis.zadd(OPEN_ORDERS_KEY, { score: now, member: orderId })
          } catch (e) {
            console.error('[list-open] Lỗi cập nhật EXPIRED:', e.message)
          }
          orders.push(expiredOrder)
          continue
        }
        orders.push(order)
        continue
      }

      // Đơn đã kết thúc (PAID/FAILED/EXPIRED) — vẫn trả về cho tới khi
      // hết grace period, để tab/thiết bị chưa từng biết đơn này cũng
      // kịp đồng bộ trạng thái cuối cùng.
      const closedAt = scoreById[orderId] || now
      if (now - closedAt > SYNC_GRACE_MS) {
        staleIds.push(orderId)
        continue
      }
      orders.push(order)
    }

    if (staleIds.length) {
      await removeFromOpenOrders(redis, staleIds)
    }

    return res.status(200).json({ orders })
  } catch (err) {
    console.error('[list-open] Lỗi:', err.message)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}