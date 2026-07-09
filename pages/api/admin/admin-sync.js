// pages/api/admin/admin-sync.js
//
// API RIÊNG CHO LUỒNG ADMIN — khác với /api/momo/query (đã bỏ requireAdmin,
// dùng cho luồng public/scan) và /api/momo/status (dùng cho trang /pay công
// khai). Route này CHỈ admin gọi được, mục đích: tự động đồng bộ lại TOÀN BỘ
// đơn PENDING với MoMo mỗi khi admin mở trang dashboard — không cần đợi
// polling 1s trên trình duyệt admin (vốn chỉ chạy khi có tab đang mở).
//
// QUAN TRỌNG: đọc trực tiếp TOÀN BỘ hash `momo:orders` từ Redis bằng
// hgetall — đây là nguồn dữ liệu gốc, đầy đủ nhất, KHÔNG phụ thuộc vào
// danh sách orders mà client đang hiển thị/lọc theo ngày tháng trên UI.
// Vì vậy dù admin đang lọc "Hôm nay" trên bảng, route này vẫn quét đúng
// TẤT CẢ đơn PENDING có thật trong Redis, kể cả đơn tạo từ hôm qua/tuần
// trước còn sót lại.

import { Redis } from '@upstash/redis'
import { queryMoMoTransaction } from '../../../lib/momo'
import { requireAdmin } from '../../../lib/requireAdmin'
import { markOrderClosed } from '../../../lib/openOrders'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const STILL_PROCESSING_CODES = [1000, 7000, 7002, 9000]
const EXPIRED_CODES = [1005]
// Chỉ gọi tối đa 4 request đồng thời lên MoMo — tránh bị rate-limit
// (resultCode 29) khi có nhiều đơn PENDING cùng lúc.
const CONCURRENCY = 4
// Giới hạn số đơn xử lý trong 1 lần gọi route này — phòng trường hợp Redis
// tồn đọng quá nhiều đơn PENDING cũ (lỗi hệ thống trước đó), tránh 1 lần
// sync kéo dài quá lâu (Vercel có giới hạn maxDuration).
const MAX_ORDERS_PER_RUN = 200

function resolveStatusFromResultCode(rc) {
  const code = parseInt(rc)
  if (code === 0) return 'PAID'
  if (EXPIRED_CODES.includes(code)) return 'EXPIRED'
  return 'FAILED'
}

export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireAdmin(req, res)) return

  let raw
  try {
    raw = await redis.hgetall('momo:orders')
  } catch (err) {
    console.error('[admin-sync] Lỗi đọc Redis:', err)
    return res.status(500).json({ error: 'Không đọc được dữ liệu đơn hàng' })
  }
  if (!raw) return res.status(200).json({ scanned: 0, checked: 0, updated: 0, orders: [] })

  // Toàn bộ đơn có thật trong hash — đây là "all đơn trong orders" theo
  // đúng nghĩa, không lọc theo ngày/tab client nào cả.
  const allOrders = Object.values(raw).map(v => (typeof v === 'string' ? JSON.parse(v) : v))

  const pendingOrders = allOrders
    .filter(o => (o.status || 'PENDING') === 'PENDING')
    .slice(0, MAX_ORDERS_PER_RUN)

  const result = {
    scanned: allOrders.length,      // tổng số đơn có trong Redis (mọi trạng thái)
    checked: pendingOrders.length,  // số đơn PENDING thực sự được đem đi verify với MoMo
    updated: 0,
    updatedOrderIds: [],
    errors: [],
  }

  if (pendingOrders.length === 0) {
    return res.status(200).json(result)
  }

  let idx = 0
  const worker = async () => {
    while (idx < pendingOrders.length) {
      const order = pendingOrders[idx++]
      const orderId = order.orderId
      try {
        const momoResult = await queryMoMoTransaction({ orderId })
        const rc = momoResult?.resultCode
        if (rc === undefined || rc === null || STILL_PROCESSING_CODES.includes(parseInt(rc))) {
          continue // MoMo vẫn đang xử lý — không có gì để cập nhật
        }

        const correctStatus = resolveStatusFromResultCode(rc)
        if (order.status === correctStatus) continue // đã đúng sẵn, khỏi ghi lại

        const now = new Date().toISOString()
        const isPaid = correctStatus === 'PAID'
        const reconciled = {
          ...order,
          transId:       momoResult.transId      || order.transId      || '',
          amount:        parseInt(momoResult.amount || order.amount    || 0),
          payType:       momoResult.payType       || order.payType     || '',
          paymentOption: momoResult.paymentOption ?? order.paymentOption ?? null,
          orderType:     momoResult.orderType     || order.orderType    || '',
          extraData:     momoResult.extraData     || order.extraData    || '',
          resultCode:    parseInt(rc),
          message:       momoResult.message       || order.message     || '',
          responseTime:  momoResult.responseTime  || order.responseTime || null,
          requestId:     momoResult.requestId     || order.requestId    || '',
          paidAt:        isPaid ? (order.paidAt || now) : (order.paidAt || null),
          status:        correctStatus,
          source:        'admin-sync',
          lastCheckedAt: now,
        }

        await redis.hset('momo:orders', { [orderId]: JSON.stringify(reconciled) })
        await markOrderClosed(redis, orderId) // đã có kết luận cuối -> gỡ khỏi index "đang mở"

        result.updated += 1
        result.updatedOrderIds.push({ orderId, from: order.status, to: correctStatus })
      } catch (err) {
        console.error('[admin-sync] Lỗi verify', orderId, err.message)
        result.errors.push({ orderId, error: err.message })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pendingOrders.length) }, worker))

  console.log(`[admin-sync] Quét ${result.scanned} đơn, verify ${result.checked} đơn PENDING, cập nhật ${result.updated} đơn.`)

  return res.status(200).json(result)
}