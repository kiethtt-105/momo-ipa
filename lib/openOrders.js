// lib/openOrders.js
//
// Index Redis dùng để tra nhanh "các đơn đang PENDING" phục vụ tính năng
// ĐỒNG BỘ GIAO DỊCH giữa nhiều tab/thiết bị (create-transaction.js) — thay
// vì phải quét toàn bộ hash `momo:orders` (phình to dần theo lịch sử giao
// dịch, không hợp lý để quét mỗi vài giây).
//
// Một sorted set riêng: member = orderId, score = thời điểm tạo đơn (ms).
// - Thêm vào set NGAY LÚC đơn được tạo với status PENDING.
// - Gỡ khỏi set NGAY LÚC đơn có kết luận cuối (PAID/FAILED/EXPIRED).
// Dùng sorted set (không phải set thường) để giữ lại `score`, cho phép
// endpoint list-open tự phát hiện + dọn các đơn đã quá hạn mà chưa route
// status.js nào kịp poll tới (tự chữa lành, tránh vé "ma" tồn tại mãi).
export const OPEN_ORDERS_KEY = 'momo:open-orders'

export async function markOrderOpen(redis, orderId, createdAtMs = Date.now()) {
  try {
    await redis.zadd(OPEN_ORDERS_KEY, { score: createdAtMs, member: orderId })
  } catch (err) {
    // Không throw — lỗi ở bước index hóa không nên làm hỏng luồng tạo/xử
    // lý đơn hàng chính (MoMo vẫn phải tiếp tục). Chỉ log để biết mà kiểm
    // tra, tối đa là tính năng đồng bộ tạm thời "bỏ sót" đơn này.
    console.error('[openOrders] Lỗi zadd:', err.message)
  }
}

export async function markOrderClosed(redis, orderId) {
  try {
    await redis.zrem(OPEN_ORDERS_KEY, orderId)
  } catch (err) {
    console.error('[openOrders] Lỗi zrem:', err.message)
  }
}