// pages/api/momo/status.js
import { Redis } from '@upstash/redis'
import { queryMoMoTransaction } from '../../../lib/momo'
import { markOrderClosed } from '../../../lib/openOrders'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// Phải khớp với EXPIRE_MINUTES bên admin-dashboard.js
const EXPIRE_MINUTES      = parseInt(process.env.MOMO_EXPIRE_MINUTES || '10', 10)
const EXPIRE_MS           = EXPIRE_MINUTES * 60 * 1000
// Chỉ bắt đầu "verify thật" với MoMo trong khoảng X giây cuối trước khi coi là hết hạn,
// để tránh gọi MoMo liên tục suốt cả vòng đời PENDING (poll mỗi 1s).
const RECHECK_WINDOW_MS   = 60 * 1000
// Throttle: tối đa 1 lần gọi MoMo mỗi N giây trong khoảng recheck window, tránh rate-limit (resultCode 29).
const RECHECK_THROTTLE_MS = 5 * 1000
// Theo bảng Result Code chính thức của MoMo (Final Status = "No"):
const STILL_PROCESSING_CODES = [1000, 7000, 7002, 9000]
// resultCode coi là "hết hạn" theo MoMo — khác với 1003 (bị hủy, thuộc nhóm FAILED).
// 1005: Giao dịch thất bại do url hoặc QR code đã hết hạn.
const EXPIRED_CODES = [1005]

// ── Chế độ "wait=1": thay vì client tự setInterval poll mỗi 1s, route tự
// lặp bên trong 1 request duy nhất, mỗi 1s tự kiểm tra lại và trả về NGAY
// khi có kết luận cuối (PAID/FAILED/EXPIRED), không cần client tự bấm/gọi
// lại. Nếu hết ngân sách thời gian mà vẫn PENDING thì trả PENDING, client
// tự gọi lại route (xem ghi chú cuối file) để tiếp tục.
const WAIT_POLL_INTERVAL_MS = 1000
const WAIT_BUDGET_MS        = 25_000 // chừa buffer so với maxDuration (30s)

export const config = {
  maxDuration: 30,
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Kiểm tra 1 lần cho 1 orderId — y hệt logic gốc của status.js, tách ra
// thành hàm riêng để dùng được cả ở chế độ bình thường lẫn chế độ "wait=1".
// Trả về { order, isFinal } — isFinal = true khi đã PAID/FAILED/EXPIRED.
async function checkOnce(orderId) {
  const raw = await redis.hget('momo:orders', orderId)
  if (!raw) return { order: { status: 'PENDING', orderId }, isFinal: false }

  let order = typeof raw === 'string' ? JSON.parse(raw) : raw

  // Đã có kết luận cuối cùng (do IPN hoặc lần verify trước) → trả ngay, không cần gọi MoMo nữa.
  if (order.status === 'PAID' || order.status === 'FAILED') {
    await markOrderClosed(redis, orderId)
    return { order, isFinal: true }
  }

  // status local đang PENDING — không tin tưởng tuyệt đối, vì IPN có thể bị trễ/rớt.
  const createdAt        = order.createdAt ? new Date(order.createdAt).getTime() : Date.now()
  const age               = Date.now() - createdAt
  const nearOrPastExpiry  = age >= (EXPIRE_MS - RECHECK_WINDOW_MS)

  if (nearOrPastExpiry) {
    const lastChecked   = order.lastCheckedAt ? new Date(order.lastCheckedAt).getTime() : 0
    const shouldRecheck = (Date.now() - lastChecked) >= RECHECK_THROTTLE_MS

    if (shouldRecheck) {
      try {
        const momoResult = await queryMoMoTransaction({ orderId })
        const rc  = momoResult?.resultCode
        const now = new Date().toISOString()

        if (rc !== undefined && rc !== null && !STILL_PROCESSING_CODES.includes(parseInt(rc))) {
          const isPaid    = parseInt(rc) === 0
          const isExpired = EXPIRED_CODES.includes(parseInt(rc))
          order = {
            ...order,
            transId:       momoResult.transId      || order.transId      || '',
            amount:        parseInt(momoResult.amount || order.amount    || 0),
            payType:       momoResult.payType       || order.payType     || '',
            // Trước đây bỏ sót 3 field này dù MoMo query API vẫn trả về.
            paymentOption: momoResult.paymentOption ?? order.paymentOption ?? null,
            orderType:     momoResult.orderType      || order.orderType     || '',
            extraData:     momoResult.extraData      || order.extraData     || '',
            resultCode:    parseInt(rc),
            message:       momoResult.message       || order.message     || '',
            responseTime:  momoResult.responseTime  || order.responseTime|| null,
            requestId:     momoResult.requestId     || order.requestId   || '',
            paidAt:        isPaid ? now : (order.paidAt || null),
            // MoMo đã có kết quả rõ ràng (không còn "đang xử lý") → dùng đúng resultCode
            // để phân biệt PAID/EXPIRED/FAILED, không suy đoán EXPIRED theo thời gian nữa
            // (vd resultCode 1003 "bị hủy" phải là FAILED, không phải EXPIRED).
            status:        isPaid ? 'PAID' : (isExpired ? 'EXPIRED' : 'FAILED'),
            source:        'status-verified',
            lastCheckedAt: now,
          }
          await redis.hset('momo:orders', { [orderId]: JSON.stringify(order) })
          // Kết luận cuối (PAID/EXPIRED/FAILED) → gỡ khỏi danh sách đang mở.
          await markOrderClosed(redis, orderId)
          return { order, isFinal: true }
        }

        // MoMo vẫn đang xử lý (1000/7000/7002) → chỉ cập nhật mốc lastCheckedAt để throttle,
        // không kết luận PAID/FAILED/EXPIRED vội.
        order = { ...order, lastCheckedAt: now }
        await redis.hset('momo:orders', { [orderId]: JSON.stringify(order) })
      } catch (err) {
        console.error('[status] Lỗi verify MoMo:', err.message)
        // Gọi MoMo lỗi (timeout/rate-limit/mạng) → KHÔNG kết luận hết hạn vội, trả nguyên trạng PENDING
        // và để lần poll sau (1s tới) thử lại.
      }
    }
  }

  // Chỉ đánh dấu EXPIRED khi đã thực sự quá hạn VÀ (không verify được với MoMo, hoặc MoMo cũng
  // không xác nhận thành công) — tránh tình trạng "thành công nhưng báo hết hạn".
  if (age > EXPIRE_MS && order.status === 'PENDING') {
    order = { ...order, status: 'EXPIRED' }
    await redis.hset('momo:orders', { [orderId]: JSON.stringify(order) })
    // Hết hạn cũng là kết luận cuối → gỡ khỏi danh sách đang mở.
    await markOrderClosed(redis, orderId)
    return { order, isFinal: true }
  }

  return { order, isFinal: false }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { orderId, open, wait } = req.query
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  // ── Chế độ "open=1": redirect thẳng sang payUrl/deeplink MoMo, dùng cho
  // link "Mở trang thanh toán trong tab mới" bên create-transaction.js —
  // tận dụng lại logic tra Redis của route status.js sẵn có, không tạo
  // route riêng, đồng thời ẩn payUrl/deeplink thật (query string dài) khỏi
  // thanh địa chỉ ngay lúc bấm, chỉ để lộ "…/api/momo/status?orderId=…&open=1".
  if (open) {
    const raw = await redis.hget('momo:orders', orderId)
    if (!raw) return res.status(404).send('Không tìm thấy đơn hàng hoặc đã hết hạn')
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    // Đơn đã có kết luận cuối → đưa về trang result thay vì mở lại link MoMo cũ/hết hạn.
    if (o.status === 'PAID' || o.status === 'FAILED' || o.status === 'EXPIRED') {
      return res.redirect(302, `/result?orderId=${encodeURIComponent(orderId)}`)
    }
    const target = o.deeplink || o.payUrl
    if (!target) return res.status(404).send('Đơn hàng chưa có link thanh toán')
    return res.redirect(302, target)
  }

  // ── Chế độ mặc định (không có wait=1): giữ nguyên hành vi cũ — kiểm tra
  // 1 lần rồi trả về ngay, client tự polling phía trình duyệt như trước giờ.
  if (!wait) {
    const { order } = await checkOnce(orderId)
    return res.status(200).json(order)
  }

  // ── Chế độ "wait=1": tự lặp mỗi 1s bên trong request này, không cần
  // client tự gọi lại liên tục — trả về NGAY khi có kết luận cuối.
  const startedAt = Date.now()
  let lastOrder = null

  while (Date.now() - startedAt < WAIT_BUDGET_MS) {
    const roundStart = Date.now()
    const { order, isFinal } = await checkOnce(orderId)
    lastOrder = order

    if (isFinal) {
      return res.status(200).json(order)
    }

    const elapsed = Date.now() - roundStart
    const waitFor = Math.max(0, WAIT_POLL_INTERVAL_MS - elapsed)
    if (Date.now() - startedAt + waitFor >= WAIT_BUDGET_MS) break
    await sleep(waitFor)
  }

  // Hết ngân sách thời gian mà vẫn chưa có kết luận cuối → trả PENDING,
  // client gọi lại route (cùng orderId, wait=1) để tiếp tục chờ.
  return res.status(200).json(lastOrder || { status: 'PENDING', orderId })
}