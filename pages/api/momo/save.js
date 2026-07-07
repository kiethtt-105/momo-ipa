// pages/api/momo/save.js
import { queryMoMoTransaction } from '../../../lib/momo'
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'
import { markOrderClosed } from '../../../lib/openOrders'
import { formatResultCodeMessage } from '../../../lib/momoResultCodes'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Route này trigger 1 lệnh gọi THẬT (đã ký signature) sang MoMo cho orderId
  // bất kỳ — nếu để public, ai cũng có thể spam gọi (tốn quota/rate-limit
  // MoMo) hoặc dò trạng thái/amount của đơn người khác. Chỉ admin đã đăng
  // nhập mới được gọi.
  if (!requireAdmin(req, res)) return

  const { orderId } = req.body
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  let existing = await redis.hget('momo:orders', orderId)
  if (existing) {
    existing = typeof existing === 'string' ? JSON.parse(existing) : existing
    if (existing.status === 'PAID') {
      // Tự chữa lành: nếu vì lý do gì đó đơn đã PAID từ trước mà vẫn còn
      // sót trong index "đang mở" (VD do lỗi tạm thời ở lần zrem trước),
      // dọn luôn tại đây — gọi markOrderClosed nhiều lần vô hại (no-op).
      await markOrderClosed(redis, orderId)
      return res.status(200).json({ ok: true, source: 'already_paid' })
    }
  }

  let momoResult
  try {
    momoResult = await queryMoMoTransaction({ orderId })
  } catch (err) {
    console.error('[Save API] Lỗi khi query MoMo:', err)
    return res.status(502).json({ error: 'Không xác minh được với MoMo, thử lại sau' })
  }

  const {
    resultCode, transId, amount, payType, message,
    requestId, responseTime, orderType, extraData,
  } = momoResult

  const isPaid = parseInt(resultCode) === 0
  const now = new Date().toISOString()

  // Trước đây "message" chỉ lưu nguyên văn MoMo trả về — nhiều khi tiếng
  // Anh, cộc lốc, hoặc rỗng (đúng như trường hợp vé "Thất bại" không rõ
  // lý do). Giờ dịch resultCode qua bảng tra cứu đầy đủ + phân loại rõ
  // lỗi do ai (hệ thống MoMo / do cấu hình bên mình — admin cần kiểm tra
  // / do khách hàng), để admin nhìn message là hiểu ngay, không phải đoán
  // hay tra cứu tay resultCode.
  const finalMessage = isPaid ? (message || 'Thanh toán thành công') : formatResultCodeMessage(resultCode, message)

  const record = {
    orderId,
    transId:      transId      || existing?.transId      || '',
    amount:       parseInt(amount || existing?.amount    || 0),
    payType:      payType      || existing?.payType      || '',
    orderInfo:    existing?.orderInfo    || '',
    resultCode:   parseInt(resultCode ?? 0),
    message:      finalMessage || existing?.message      || '',
    responseTime: responseTime || existing?.responseTime || null,
    orderType:    orderType    || existing?.orderType    || '',
    extraData:    extraData    || existing?.extraData    || '',
    requestId:    requestId    || existing?.requestId    || '',
    paidAt:       isPaid ? now : (existing?.paidAt || null),
    createdAt:    existing?.createdAt || now,
    status:       isPaid ? 'PAID' : 'FAILED',
    source:       'redirect-verified',
    payUrl:       existing?.payUrl       || '',
    deeplink:     existing?.deeplink     || '',
    qrCodeUrl:    existing?.qrCodeUrl    || '',
    qrCodeImage:  existing?.qrCodeImage  || '',
    type:         existing?.type         || '',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })
  // Đơn đã có kết luận cuối (PAID/FAILED) → gỡ khỏi danh sách "đang mở"
  // để mọi thiết bị đang đồng bộ qua list-open không còn thấy vé này nữa
  // (tự nó vẫn thấy vì đã có sẵn trong local state, chỉ ngừng bị coi là
  // "đang chờ" ở các thiết bị khác chưa từng mở nó).
  await markOrderClosed(redis, orderId)
  console.log(`[Save API] Order ${orderId} → ${isPaid ? 'PAID' : 'FAILED'} (verified via MoMo query) | ${message || ''}`)

  return res.status(200).json({ ok: true })
}