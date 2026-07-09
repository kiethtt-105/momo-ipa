// pages/api/momo/orders.js
import { Redis } from '@upstash/redis'
import { verifySession, refreshSession } from '../admin/login'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// Chỉ những field liên quan tới NGÂN HÀNG / thanh toán mà khách (không đăng
// nhập admin) được phép xem — giống hệt những gì trang /pay/[orderId] đã
// công khai hiển thị. Cố tình KHÔNG trả các field nhạy cảm khác của đơn
// (payUrl kèm chữ ký MoMo, storeId, partnerName, requestId, resultCode,
// transId, source, paymentOption, deeplink, applink...).
function toPublicOrder(o) {
  return {
    orderId:   o.orderId,
    amount:    o.amount,
    orderInfo: o.orderInfo || '',
    storeName: o.storeName || '',
    status:    o.status || 'PENDING',
    createdAt: o.createdAt,
    vietqr: o.vietqr ? {
      bank: {
        name:     o.vietqr.bank?.name,
        fullName: o.vietqr.bank?.fullName,
      },
      accountNumber: o.vietqr.accountNumber,
      amount:        o.vietqr.amount,
      currency:      o.vietqr.currency,
      content:       o.vietqr.content,
    } : null,
  }
}

export default async function handler(req, res) {
  const reqId = Math.random().toString(36).slice(2, 8)
  const startedAt = Date.now()

  console.log(`[orders][${reqId}] --> ${req.method} query=${JSON.stringify(req.query)}`)

  if (req.method !== 'GET') {
    console.warn(`[orders][${reqId}] method not allowed: ${req.method}`)
    return res.status(405).end()
  }

  try {
    // Không dùng requireAdmin() ở đây vì nó TỰ trả 401 và chặn hẳn request nếu
    // không phải admin — route này giờ phục vụ cả khách (xem thông tin ngân
    // hàng của 1 đơn) lẫn admin (xem toàn bộ), nên cần biết isAdmin true/false
    // để rẽ nhánh, chứ không được chặn cứng.
    const isAdmin = verifySession(req)
    console.log(`[orders][${reqId}] isAdmin=${isAdmin}`)

    if (isAdmin) {
      refreshSession(req, res) // rolling session, chỉ gia hạn khi đúng là admin
      console.log(`[orders][${reqId}] session refreshed (admin)`)
    }

    const { orderId } = req.query

    // Khách (không phải admin) BẮT BUỘC phải truyền orderId — không cho liệt
    // kê toàn bộ danh sách đơn của người khác. Chỉ admin mới được xem full
    // danh sách khi không truyền orderId.
    if (!isAdmin && !orderId) {
      console.warn(`[orders][${reqId}] <-- 401 thiếu orderId (khách, không session)`)
      return res.status(401).json({ error: 'Chưa đăng nhập hoặc session hết hạn' })
    }

    let raw
    try {
      raw = await redis.hgetall('momo:orders')
    } catch (redisErr) {
      console.error(`[orders][${reqId}] Redis lỗi:`, redisErr)
      return res.status(500).json({ error: 'Lỗi kết nối cơ sở dữ liệu' })
    }

    if (!raw) {
      console.log(`[orders][${reqId}] redis rỗng, không có đơn nào`)
      console.log(`[orders][${reqId}] <-- 200 total=0 (${Date.now() - startedAt}ms)`)
      return res.status(200).json({ orders: [], total: 0 })
    }

    let orders = Object.values(raw)
      .map(v => (typeof v === 'string' ? JSON.parse(v) : v))
      .sort((a, b) => new Date(b.createdAt || b.paidAt || 0) - new Date(a.createdAt || a.paidAt || 0))

    console.log(`[orders][${reqId}] tổng số đơn trong redis: ${orders.length}`)

    // Hỗ trợ lọc theo orderId qua query string, vd:
    // /api/momo/orders?orderId=iPOS1783539592319xnzu
    // Khớp CHỨA chuỗi (không phân biệt hoa/thường) để vẫn dùng được như tra
    // cứu gần đúng, không bắt buộc gõ chính xác 100%.
    if (orderId) {
      const needle = String(orderId).trim().toLowerCase()
      orders = orders.filter(o => (o.orderId || '').toLowerCase().includes(needle))
      console.log(`[orders][${reqId}] lọc theo orderId="${needle}" -> ${orders.length} kết quả`)
    }

    // Khách chỉ thấy thông tin liên quan ngân hàng của (các) đơn khớp orderId
    // đã truyền — admin thấy nguyên vẹn toàn bộ field.
    if (!isAdmin) {
      orders = orders.map(toPublicOrder)
      console.log(`[orders][${reqId}] trả dữ liệu rút gọn (khách, không phải admin)`)
    }

    console.log(`[orders][${reqId}] <-- 200 total=${orders.length} isAdmin=${isAdmin} (${Date.now() - startedAt}ms)`)
    return res.status(200).json({ orders, total: orders.length })
  } catch (err) {
    console.error(`[orders][${reqId}] Lỗi không xác định:`, err)
    return res.status(500).json({ error: 'Lỗi máy chủ' })
  }
}