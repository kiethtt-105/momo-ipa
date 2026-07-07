// lib/openOrders.js
//
// Index Redis dùng để tra nhanh "các đơn NÊN ĐƯỢC ĐỒNG BỘ" phục vụ tính
// năng ĐỒNG BỘ GIAO DỊCH giữa nhiều tab/thiết bị (create-transaction.js)
// — thay vì phải quét toàn bộ hash `momo:orders` (phình to dần theo lịch
// sử giao dịch, không hợp lý để quét mỗi vài giây).
//
// Một sorted set riêng: member = orderId, score = THỜI ĐIỂM THAY ĐỔI
// TRẠNG THÁI GẦN NHẤT (ms) — không chỉ là lúc tạo đơn.
//
// LƯU Ý QUAN TRỌNG (khác bản trước): trước đây markOrderClosed() xóa
// hẳn (zrem) đơn khỏi index NGAY LÚC có kết luận cuối (PAID/FAILED/
// EXPIRED) — hệ quả là tab/thiết bị nào CHƯA từng mở đơn đó (vd vừa mở
// tab mới) sẽ KHÔNG BAO GIỜ thấy được kết quả cuối cùng của đơn, dù đơn
// vừa kết thúc 1 giây trước trên tab khác. Giờ markOrderClosed() chỉ
// LÀM MỚI score (không xóa) — đơn vẫn nằm trong index thêm một khoảng
// "grace period" ngắn (xem SYNC_GRACE_MS ở list-open.js) để mọi tab/thiết
// bị khác kịp đồng bộ luôn cả trạng thái cuối, đúng như cách các cửa sổ
// nội bộ (cùng 1 tab) vẫn thấy — sau đó index tự dọn đơn này, không phình
// to vô hạn theo lịch sử giao dịch.
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

// Gọi khi đơn đạt trạng thái cuối (PAID/FAILED/EXPIRED). KHÔNG xóa khỏi
// index ngay — chỉ làm mới score = thời điểm hiện tại, để list-open biết
// đơn này "vừa đổi trạng thái lúc nào" và còn giữ nó trong khoảng grace
// period cho các thiết bị khác kịp đồng bộ. Việc dọn hẳn khỏi index do
// list-open đảm nhiệm (dựa theo SYNC_GRACE_MS), không phải hàm này.
export async function markOrderClosed(redis, orderId) {
  try {
    await redis.zadd(OPEN_ORDERS_KEY, { score: Date.now(), member: orderId })
  } catch (err) {
    console.error('[openOrders] Lỗi zadd (closed):', err.message)
  }
}

// Xóa hẳn khỏi index — dùng nội bộ bởi list-open sau khi hết grace
// period, hoặc khi record không còn tồn tại trong momo:orders nữa.
export async function removeFromOpenOrders(redis, orderIds) {
  if (!orderIds || !orderIds.length) return
  try {
    await redis.zrem(OPEN_ORDERS_KEY, ...orderIds)
  } catch (err) {
    console.error('[openOrders] Lỗi zrem:', err.message)
  }
}