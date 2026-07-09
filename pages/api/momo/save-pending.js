import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'
import { markOrderOpen } from '../../../lib/openOrders'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }


  if (!requireAdmin(req, res)) return

  const { orderId, amount, orderInfo, storeId, storeName } = req.body

  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Thiếu orderId hoặc amount' })
  }

  const now = new Date().toISOString()

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId,
        amount: parseInt(amount),
        orderInfo: orderInfo || orderId,
        status: 'PENDING',
        createdAt: now,
        paidAt: null,
        transId: '',
        payType: 'pos',
        source: 'pos',
        // Trước đây không nhận/lưu storeId/storeName ở bước tạo nháp này
        // (chỉ có ở scan.js sau khi xác nhận) — bổ sung để nếu trang gọi
        // route này có sẵn thông tin cửa hàng thì lưu luôn từ đầu, không
        // phải đợi tới lúc scan.js ghi đè.
        storeId: storeId || '',
        storeName: storeName || '',
        // "type" để mọi client (kể cả đồng bộ qua list-open) biết đây là
        // giao dịch Scan mà không cần đoán qua các field khác (payUrl...).
        type: 'scan',
      }),
    })

    // Ghi vào index "đơn đang mở" để endpoint /api/momo/list-open trả về
    // ngay cho các tab/thiết bị khác — đây chính là bước cho phép ĐỒNG BỘ
    // giao dịch mới tạo qua nhiều nơi.
    await markOrderOpen(redis, orderId, Date.now())

    return res.status(200).json({ success: true, message: 'Đã tạo log đơn hàng nháp' })
  } catch (err) {
    console.error('[SAVE-PENDING] Error:', err)
    return res.status(500).json({ error: 'Lỗi server khi lưu đơn hàng nháp' })
  }
}