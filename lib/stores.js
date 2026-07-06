// lib/stores.js
//
// Quản lý danh sách CỬA HÀNG (multi-store) cho các giao dịch MoMo.
//
// ─── CÁCH CẤU HÌNH ──────────────────────────────────────────────
// Thêm 1 biến môi trường MỚI trên Vercel: MOMO_STORES
// Giá trị là 1 chuỗi JSON, ví dụ:
//
// [
//   { "id": "fc",  "name": "IPA COFFEE - FC",  "partnerName": "IPA COFFEE", "default": true },
//   { "id": "q1",  "name": "IPA COFFEE - Q1",  "partnerName": "IPA COFFEE" },
//   { "id": "q3",  "name": "IPA COFFEE - Q3",  "partnerName": "IPA COFFEE" }
// ]
//
// - "id"          : mã định danh ngắn, dùng trong URL (?storeId=fc), KHÔNG dấu/cách
// - "name"        : tên cửa hàng hiển thị trên MoMo (storeName)
// - "partnerName" : tên đối tác hiển thị (partnerName gửi lên MoMo)
// - "default"     : true cho ĐÚNG 1 cửa hàng — cửa hàng này sẽ được tự động
//                    chọn khi không có storeId nào được truyền lên (link
//                    nhanh / shortcut không kèm storeId).
//
// Muốn thêm/sửa/xoá cửa hàng chỉ cần sửa biến MOMO_STORES này, KHÔNG cần
// sửa code hay deploy lại.
//
// ─── TƯƠNG THÍCH NGƯỢC ──────────────────────────────────────────
// Nếu MOMO_STORES chưa được set (hoặc parse lỗi), hệ thống tự fallback về
// đúng 1 cửa hàng dựng từ 3 biến cũ đã có sẵn:
//   MOMO_STORE_ID, MOMO_STORE_NAME, MOMO_PARTNER_NAME
// → không phá vỡ deployment hiện tại nếu chưa kịp thêm MOMO_STORES.

function fallbackStores() {
  const id = process.env.MOMO_STORE_ID || 'default'
  const name = process.env.MOMO_STORE_NAME || ''
  const partnerName = process.env.MOMO_PARTNER_NAME || ''
  return [{ id, name, partnerName, default: true }]
}

let cached = null

/** Trả về mảng tất cả cửa hàng đã cấu hình (đã chuẩn hoá, luôn có 1 default). */
export function getStores() {
  if (cached) return cached

  const raw = process.env.MOMO_STORES
  if (!raw) {
    cached = fallbackStores()
    return cached
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('MOMO_STORES rỗng hoặc không phải mảng')

    const stores = parsed
      .filter(s => s && s.id)
      .map(s => ({
        id: String(s.id).trim(),
        name: String(s.name || s.id).trim(),
        partnerName: String(s.partnerName || '').trim(),
        default: !!s.default,
      }))

    if (stores.length === 0) throw new Error('Không có cửa hàng hợp lệ nào trong MOMO_STORES')

    // Đảm bảo LUÔN có đúng 1 cửa hàng default — nếu không ai đánh dấu,
    // lấy cửa hàng đầu tiên làm mặc định.
    if (!stores.some(s => s.default)) stores[0].default = true

    cached = stores
  } catch (e) {
    console.error('[stores] MOMO_STORES parse lỗi, dùng fallback từ biến cũ:', e.message)
    cached = fallbackStores()
  }

  return cached
}

/** Trả về cửa hàng mặc định (dùng khi link nhanh/shortcut không truyền storeId). */
export function getDefaultStore() {
  const stores = getStores()
  return stores.find(s => s.default) || stores[0]
}

/** Tìm cửa hàng theo id, trả về null nếu không có. */
export function findStore(id) {
  if (!id) return null
  const stores = getStores()
  return stores.find(s => s.id === String(id).trim()) || null
}

/** Tìm theo id, nếu không có/không truyền → trả về cửa hàng mặc định. */
export function resolveStore(id) {
  return findStore(id) || getDefaultStore()
}