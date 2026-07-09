// pages/api/admin/admin-sync.js
//
// API RIÊNG CHO LUỒNG ADMIN — khác với /api/momo/query (đã bỏ requireAdmin,
// dùng cho luồng public/scan) và /api/momo/status (dùng cho trang /pay công
// khai). Route này CHỈ admin gọi được (chế độ mặc định), mục đích: tự động
// đồng bộ lại TOÀN BỘ đơn PENDING với MoMo mỗi khi admin mở trang dashboard —
// không cần đợi polling 1s trên trình duyệt admin (vốn chỉ chạy khi có tab
// đang mở).
//
// QUAN TRỌNG: đọc trực tiếp TOÀN BỘ hash `momo:orders` từ Redis bằng
// hgetall — đây là nguồn dữ liệu gốc, đầy đủ nhất, KHÔNG phụ thuộc vào
// danh sách orders mà client đang hiển thị/lọc theo ngày tháng trên UI.
// Vì vậy dù admin đang lọc "Hôm nay" trên bảng, route này vẫn quét đúng
// TẤT CẢ đơn PENDING có thật trong Redis, kể cả đơn tạo từ hôm qua/tuần
// trước còn sót lại.
//
// ── CHẾ ĐỘ NỀN TỰ ĐỘNG (?auto=1) ─────────────────────────────────────
// Bổ sung: đồng bộ MỖI 1 GIÂY hoàn toàn ở phía server, KHÔNG phụ thuộc
// việc admin có đang mở trang dashboard hay không ("chạy dưới nền").
// Vercel serverless function không thể chạy vô thời hạn trong 1 lần gọi
// (giới hạn maxDuration) nên route tự lặp bên trong 1 request cho tới khi
// gần hết ngân sách thời gian, rồi TỰ GỌI LẠI CHÍNH NÓ (fetch không chờ
// kết quả) để nối tiếp chuỗi — tạo cảm giác "chạy nền vô hạn" dù mỗi lần
// gọi vẫn là 1 function invocation riêng biệt và có giới hạn thời gian.
//
// Một Vercel Cron (`vercel.json`, tối thiểu mỗi 1 phút — Vercel không cho
// lịch mịn hơn) chỉ đóng vai trò "mồi/tự phục hồi": nếu chuỗi bị đứt vì
// bất kỳ lý do gì (deploy mới kill invocation cũ, cold start lỗi, function
// bị Vercel giết giữa chừng…), cron sẽ khởi động lại chuỗi trong tối đa 60s.
//
// Bảo mật: chế độ auto KHÔNG dùng requireAdmin (không có session/cookie
// admin trong 1 lần gọi nền), mà xác thực bằng CRON_SECRET — Vercel tự
// gửi header `Authorization: Bearer $CRON_SECRET` khi gọi từ Cron, và
// route tự nối chuỗi cũng gửi đúng header này khi tự fetch lại chính nó.
//
// Env cần thêm để bật chế độ auto:
//   CRON_SECRET     — chuỗi bí mật bất kỳ, đặt trong Vercel > Settings > Environment Variables
//   SELF_BASE_URL    — (tuỳ chọn) URL gốc domain thật, vd https://yourapp.com
//                       Nếu bỏ trống sẽ tự dùng https://$VERCEL_URL (domain deployment hiện tại).
//                       Khuyến khích set SELF_BASE_URL = domain production cố định, vì
//                       VERCEL_URL đổi theo từng deployment/preview.

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

// Chế độ auto: khoảng cách giữa các lần quét bên trong 1 vòng lặp nền.
const AUTO_LOOP_INTERVAL_MS = 1000
// Chừa buffer so với maxDuration=60s để kịp trả response + fire request nối chuỗi.
const AUTO_LOOP_BUDGET_MS = 50_000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveStatusFromResultCode(rc) {
  const code = parseInt(rc)
  if (code === 0) return 'PAID'
  if (EXPIRED_CODES.includes(code)) return 'EXPIRED'
  return 'FAILED'
}

// Xác thực cho chế độ auto=1 — KHÔNG dùng requireAdmin vì đây là lời gọi
// nền (từ Cron hoặc route tự gọi lại chính nó), không có session admin.
function isAutoAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // chưa cấu hình CRON_SECRET -> không cho phép chạy auto
  const authHeader = req.headers.authorization || ''
  if (authHeader === `Bearer ${secret}`) return true // Vercel Cron tự gửi header này
  if (req.query.secret === secret) return true // fallback nếu cần trigger thủ công để test
  return false
}

// Logic quét + verify + cập nhật TOÀN BỘ đơn PENDING — 1 "lượt" sync.
// Tách riêng để dùng chung cho cả chế độ admin gọi tay (request thường)
// lẫn chế độ auto (mỗi tick trong vòng lặp nền).
async function syncOnce() {
  let raw
  try {
    raw = await redis.hgetall('momo:orders')
  } catch (err) {
    console.error('[admin-sync] Lỗi đọc Redis:', err)
    return { scanned: 0, checked: 0, updated: 0, updatedOrderIds: [], errors: [{ error: 'redis_read_failed' }] }
  }
  if (!raw) return { scanned: 0, checked: 0, updated: 0, updatedOrderIds: [], errors: [] }

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

  if (pendingOrders.length === 0) return result

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

  return result
}

// Tự gọi lại chính route này ở chế độ auto=1 — KHÔNG await, để lần gọi
// hiện tại trả response ngay lập tức thay vì bị tính thêm thời gian chờ
// network của lần gọi kế tiếp. Đây là bước "nối chuỗi" giúp vòng lặp nền
// tiếp diễn vô thời hạn dù mỗi function invocation đều có giới hạn thời gian.
function chainNextRun() {
  const secret = process.env.CRON_SECRET
  const base =
    process.env.SELF_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (!base || !secret) {
    console.error(
      '[admin-sync][auto] Thiếu SELF_BASE_URL/VERCEL_URL hoặc CRON_SECRET — ' +
      'không thể tự nối chuỗi, vòng lặp nền sẽ dừng cho tới lần Cron kế tiếp (tối đa 1 phút).'
    )
    return
  }

  fetch(`${base}/api/admin/admin-sync?auto=1`, {
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(err => console.error('[admin-sync][auto] Lỗi khi tự nối chuỗi:', err.message))
}

export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const isAuto = req.query.auto === '1'

  if (isAuto) {
    // ── Chế độ nền tự động — chạy mỗi 1s, KHÔNG cần admin mở dashboard ──
    if (!isAutoAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })

    const startedAt = Date.now()
    let lastResult = null
    let ticks = 0

    while (Date.now() - startedAt < AUTO_LOOP_BUDGET_MS) {
      const roundStart = Date.now()
      lastResult = await syncOnce()
      ticks += 1

      const elapsed = Date.now() - roundStart
      const waitFor = Math.max(0, AUTO_LOOP_INTERVAL_MS - elapsed)
      if (Date.now() - startedAt + waitFor >= AUTO_LOOP_BUDGET_MS) break
      await sleep(waitFor)
    }

    // Hết ngân sách thời gian của lần chạy này -> nối chuỗi sang lần chạy
    // kế tiếp TRƯỚC KHI trả response, để vòng lặp nền tiếp tục vô thời hạn.
    chainNextRun()

    console.log(
      `[admin-sync][auto] Vòng lặp nền: ${ticks} lượt quét trong ${Date.now() - startedAt}ms, ` +
      `đã nối chuỗi sang lượt tiếp theo.`
    )
    return res.status(200).json({ mode: 'auto', ticks, ...lastResult })
  }

  // ── Chế độ mặc định (không có auto=1): giữ nguyên hành vi cũ — chỉ
  // admin đã đăng nhập mới gọi được, dùng cho lúc mở trang dashboard.
  if (!requireAdmin(req, res)) return

  const result = await syncOnce()

  console.log(`[admin-sync] Quét ${result.scanned} đơn, verify ${result.checked} đơn PENDING, cập nhật ${result.updated} đơn.`)

  return res.status(200).json(result)
}