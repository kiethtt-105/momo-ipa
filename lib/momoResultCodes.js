// lib/momoResultCodes.js
//
// Bảng tra cứu ĐẦY ĐỦ resultCode chính thức của MoMo (theo tài liệu
// "List Result Codes" — developers.momo.vn/v3/docs/payment/api/result-handling/resultcode)
// dùng chung cho mọi route (save.js, scan.js, create-p2p.js...) để:
//
//   1. Dịch resultCode ra tiếng Việt dễ hiểu, thay vì hiện message thô của
//      MoMo (nhiều khi tiếng Anh, cộc lốc, hoặc rỗng — như trường hợp vé
//      "Thất bại" không rõ lý do trong ảnh chụp màn hình).
//   2. PHÂN LOẠI rõ lỗi này do ai để hiện thẳng ra cho admin:
//        - 'merchant' → lỗi do CẤU HÌNH/THAO TÁC BÊN MÌNH (admin cần
//          kiểm tra lại: sai orderId trùng, sai định dạng request, sai
//          thông tin merchant...) — đây là nhóm cần hiện NGAY VÀ RÕ NHẤT
//          vì admin có thể tự sửa được.
//        - 'system'   → lỗi phía hệ thống MoMo (bảo trì, hết hạn QR...).
//        - 'user'     → do chính khách hàng thao tác (từ chối xác nhận,
//          không đủ số dư, vượt hạn mức...).
//        - 'pending'  → chưa phải kết quả cuối, vẫn đang chờ xử lý.
//        - 'success'  → thành công.
//
// Ghi chú: những resultCode KHÔNG có trong bảng chính thức (âm hoặc lạ)
// vẫn được xử lý an toàn qua nhánh mặc định ở cuối describeResultCode().

export const RESULT_CODES = {
  0:    { vi: 'Giao dịch thành công.', final: true,  category: 'success' },
  10:   { vi: 'Hệ thống MoMo đang bảo trì. Vui lòng thử lại sau khi bảo trì kết thúc.', final: false, category: 'system' },
  11:   { vi: 'Truy cập bị từ chối. Kiểm tra lại cấu hình merchant trên cổng M4B hoặc liên hệ MoMo.', final: false, category: 'merchant' },
  12:   { vi: 'Phiên bản API không còn được hỗ trợ. Cần nâng cấp lên phiên bản mới nhất của cổng thanh toán.', final: false, category: 'merchant' },
  13:   { vi: 'Xác thực merchant thất bại — sai accessKey/secretKey hoặc thông tin đăng nhập với MoMo.', final: false, category: 'merchant' },
  20:   { vi: 'Request sai định dạng hoặc thiếu tham số bắt buộc.', final: false, category: 'merchant' },
  21:   { vi: 'Số tiền giao dịch không hợp lệ.', final: false, category: 'merchant' },
  22:   { vi: 'Số tiền giao dịch vượt ngoài giới hạn cho phép của phương thức thanh toán.', final: false, category: 'merchant' },
  40:   { vi: 'Trùng requestId — cần tạo lại với requestId khác.', final: false, category: 'merchant' },
  41:   { vi: 'Trùng orderId — mã đơn hàng này đã được dùng trước đó.', final: false, category: 'merchant' },
  42:   { vi: 'orderId không hợp lệ hoặc không tìm thấy.', final: false, category: 'merchant' },
  43:   { vi: 'Bị từ chối vì đang có 1 giao dịch tương tự khác đang được xử lý.', final: false, category: 'merchant' },
  45:   { vi: 'Trùng ItemId — cần dùng ItemId khác cho mỗi item trong request.', final: false, category: 'merchant' },
  47:   { vi: 'Dữ liệu gửi lên không phù hợp/không áp dụng được. Kiểm tra lại toàn bộ request.', final: false, category: 'system' },
  98:   { vi: 'Không tạo được mã QR. Vui lòng thử lại sau.', final: true,  category: 'system' },
  99:   { vi: 'Lỗi không xác định từ MoMo. Liên hệ MoMo để biết thêm chi tiết.', final: true,  category: 'system' },
  1000: { vi: 'Giao dịch đã khởi tạo, đang chờ khách hàng xác nhận trên app MoMo.', final: false, category: 'pending' },
  1001: { vi: 'Giao dịch thất bại do tài khoản không đủ số dư.', final: true,  category: 'merchant' },
  1002: { vi: 'Giao dịch bị từ chối bởi đơn vị phát hành phương thức thanh toán. Khách nên thử phương thức khác.', final: true,  category: 'user' },
  1003: { vi: 'Giao dịch đã bị hủy sau khi được ủy quyền thành công (do merchant hoặc do timeout hệ thống).', final: true,  category: 'merchant' },
  1004: { vi: 'Giao dịch thất bại vì vượt hạn mức thanh toán ngày/tháng của khách hàng.', final: true,  category: 'user' },
  1005: { vi: 'Giao dịch thất bại vì link thanh toán hoặc mã QR đã hết hạn.', final: true,  category: 'system' },
  1006: { vi: 'Khách hàng đã từ chối xác nhận thanh toán trên app MoMo.', final: true,  category: 'user' },
  1007: { vi: 'Tài khoản khách hàng không hoạt động hoặc không tồn tại.', final: true,  category: 'system' },
  1017: { vi: 'Giao dịch đã bị merchant hủy.', final: true,  category: 'merchant' },
  1026: { vi: 'Giao dịch bị giới hạn theo quy định khuyến mãi. Liên hệ MoMo để biết chi tiết.', final: true,  category: 'system' },
  1080: { vi: 'Yêu cầu hoàn tiền thất bại trong lúc xử lý. Thử lại sau (khuyến nghị trong vòng 1 giờ).', final: true,  category: 'merchant' },
  1081: { vi: 'Yêu cầu hoàn tiền bị từ chối — giao dịch gốc có thể đã được hoàn trước đó.', final: true,  category: 'merchant' },
  1088: { vi: 'Yêu cầu hoàn tiền bị từ chối — giao dịch gốc không đủ điều kiện hoàn tiền.', final: true,  category: 'merchant' },
  2019: { vi: 'orderGroupId không hợp lệ.', final: true,  category: 'merchant' },
  4001: { vi: 'Giao dịch bị từ chối vì tài khoản khách hàng đang bị hạn chế.', final: true,  category: 'user' },
  4002: { vi: 'Giao dịch bị từ chối vì tài khoản khách hàng chưa xác thực sinh trắc học (C06/NFC).', final: true,  category: 'user' },
  4100: { vi: 'Giao dịch thất bại vì khách hàng đăng nhập app MoMo không thành công.', final: true,  category: 'user' },
  7000: { vi: 'Giao dịch đang được xử lý. Vui lòng đợi.', final: false, category: 'pending' },
  7002: { vi: 'Giao dịch đang được xử lý bởi đơn vị cung cấp phương thức thanh toán đã chọn.', final: false, category: 'pending' },
  9000: { vi: 'Giao dịch đã được ủy quyền (authorized) thành công.', final: false, category: 'pending' },
}

// Nhãn ngắn gọn hiện kèm message — để admin liếc là biết ngay lỗi thuộc
// nhóm nào mà không cần đọc hết câu mô tả dài.
const CATEGORY_LABELS = {
  success: '✓ Thành công',
  merchant: '⚠ Lỗi cấu hình/thao tác (ADMIN cần kiểm tra)',
  system: '⚠ Lỗi hệ thống MoMo',
  user: 'ℹ Do khách hàng',
  pending: '⏳ Đang xử lý',
  unknown: '⚠ Lỗi không xác định',
}

/**
 * Tra cứu thông tin đầy đủ cho 1 resultCode.
 * Luôn trả về object hợp lệ kể cả khi resultCode lạ/không có trong bảng
 * (an toàn, không throw) — nhánh 'unknown' phòng khi MoMo thêm code mới
 * mà bảng tra cứu chưa kịp cập nhật.
 */
export function describeResultCode(resultCode) {
  const code = Number(resultCode)
  const entry = RESULT_CODES[code]
  if (entry) {
    return { code, ...entry, label: CATEGORY_LABELS[entry.category] }
  }
  if (Number.isNaN(code)) {
    return { code: resultCode, vi: 'Không có mã kết quả từ MoMo.', final: false, category: 'unknown', label: CATEGORY_LABELS.unknown }
  }
  return {
    code,
    vi: `Mã lỗi ${code} chưa có trong danh sách tra cứu — kiểm tra message gốc từ MoMo bên dưới.`,
    final: true,
    category: 'unknown',
    label: CATEGORY_LABELS.unknown,
  }
}

/**
 * Ghép message gốc từ MoMo (nếu có) với phần dịch/phân loại của mình
 * thành 1 chuỗi hoàn chỉnh để lưu vào Redis / hiện cho admin. Luôn ưu
 * tiên hiện rõ nhãn phân loại lên đầu để lỗi do ADMIN gây ra không bị
 * chìm lẫn vào các lỗi khác.
 */
export function formatResultCodeMessage(resultCode, rawMoMoMessage) {
  const info = describeResultCode(resultCode)
  const raw = (rawMoMoMessage || '').toString().trim()
  const base = raw && raw !== info.vi ? `${info.vi} (MoMo: "${raw}")` : info.vi
  return `${info.label} — ${base} [mã ${info.code}]`
}