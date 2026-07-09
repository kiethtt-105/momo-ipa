// lib/momo/vietqr-deeplink.js
//
// Build deeplink mở thẳng app ngân hàng người dùng chọn, tự điền sẵn
// thông tin chuyển khoản — dựa trên dịch vụ deeplink công khai của
// VietQR.io: https://www.vietqr.io/en/danh-sach-api/deeplink-app-ngan-hang/
//
// Format: https://dl.vietqr.io/pay?app=<appId>&ba=<account>@<bankCode>&am=<amount>&tn=<content>&bn=<beneficiaryName>&url=<returnUrl>
//
// Lưu ý quan trọng (theo đúng tài liệu VietQR.io, không phải giả định):
// - `app`  : app ngân hàng NGƯỜI TRẢ TIỀN muốn mở (lấy appId từ API
//            /api/momo/bank-apps, KHÔNG phải ngân hàng thụ hưởng).
// - `ba`   : tài khoản THỤ HƯỞNG, dạng "<số_tài_khoản>@<mã_ngân_hàng_thụ_hưởng>".
//            mã_ngân_hàng_thụ_hưởng lấy từ lookupBankByBin() (field `code`),
//            KHÔNG phải BIN 6 số.
// - Không phải app nào cũng hỗ trợ auto-fill đầy đủ — một số app (theo
//   changelog VietQR.io, ví dụ ACB ONE) đã hỗ trợ điền sẵn số tiền/nội
//   dung, các app khác hiện tại chỉ mở đúng app, người dùng vẫn phải tự
//   nhập tay. Đây là giới hạn thực tế của dịch vụ, không phải lỗi code.

export function buildVietQRDeeplink({
  appId,
  accountNumber,
  bankCode,
  amount,
  content,
  beneficiaryName,
  returnUrl,
}) {
  if (!appId) {
    throw new Error('Thiếu appId (app ngân hàng muốn mở)')
  }

  const params = new URLSearchParams()
  params.set('app', appId)

  if (accountNumber && bankCode) {
    params.set('ba', `${accountNumber}@${bankCode.toLowerCase()}`)
  }
  if (amount !== undefined && amount !== null && amount !== '') {
    params.set('am', String(amount))
  }
  if (content) {
    params.set('tn', content)
  }
  if (beneficiaryName) {
    params.set('bn', beneficiaryName)
  }
  if (returnUrl) {
    params.set('url', returnUrl)
  }

  return `https://dl.vietqr.io/pay?${params.toString()}`
}