// lib/momo/vietqr-parser.js
//
// Parser cho chuỗi QR động chuẩn EMVCo (VietQR dựa trên chuẩn này).
// Format: mỗi field là ID(2 số) + LENGTH(2 số) + VALUE(length ký tự),
// một số field (38, 62...) có VALUE là chuỗi TLV con (nested).
//
// Tham khảo cấu trúc field chính (theo tài liệu VietQR/NAPAS 247):
//   00        Payload Format Indicator
//   01        Point of Initiation Method (11 = tĩnh, 12 = động)
//   38        Merchant Account Information (chứa GUID + thông tin ngân hàng)
//     └ 00      GUID (A000000727 = NAPAS)
//     └ 01      Thông tin thụ hưởng (nested)
//         └ 00    BIN ngân hàng thụ hưởng
//         └ 01    Số tài khoản / số thẻ thụ hưởng
//     └ 02      Service code (QRIBFTTA: chuyển tới TK, QRIBFTTC: chuyển tới thẻ)
//   53        Currency code (704 = VND)
//   54        Transaction Amount (số tiền)
//   58        Country Code (VN)
//   59        Merchant Name
//   60        Merchant City
//   62        Additional Data Field
//     └ 01      Bill Number
//     └ 08      Purpose of Transaction (nội dung chuyển khoản)
//   63        CRC (checksum, 4 ký tự hex)

/**
 * Parse một chuỗi TLV phẳng thành mảng {id, value}.
 * Không throw khi gặp field lệch định dạng — bỏ qua phần còn lại thay vì
 * crash toàn bộ, vì QR thực tế đôi khi có rác cuối chuỗi.
 */
function parseTLVFlat(str) {
  const fields = []
  let i = 0
  while (i + 4 <= str.length) {
    const id = str.slice(i, i + 2)
    const lenStr = str.slice(i + 2, i + 4)
    const len = parseInt(lenStr, 10)
    if (!/^\d{2}$/.test(id) || Number.isNaN(len)) break
    const value = str.slice(i + 4, i + 4 + len)
    if (value.length !== len) break // chuỗi bị cắt cụt, dừng parse
    fields.push({ id, value })
    i += 4 + len
  }
  return fields
}

function findField(fields, id) {
  return fields.find((f) => f.id === id) || null
}

/**
 * Parse chuỗi VietQR EMV đầy đủ -> object có cấu trúc rõ ràng.
 * @param {string} qrString chuỗi raw đọc được từ QR, ví dụ "000201010211...6304ABCD"
 */
export function parseVietQR(qrString) {
  if (!qrString || typeof qrString !== 'string') {
    throw new Error('Chuỗi QR rỗng hoặc không hợp lệ')
  }

  const fields = parseTLVFlat(qrString.trim())
  if (fields.length === 0) {
    throw new Error('Không parse được chuỗi QR (sai định dạng EMV TLV)')
  }

  const result = {
    raw: qrString,
    payloadFormatIndicator: findField(fields, '00')?.value ?? null,
    initMethod: findField(fields, '01')?.value ?? null, // 11 tĩnh, 12 động
    bankBin: null,
    bankCode: null,
    bankName: null,
    accountNumber: null,
    serviceCode: null, // QRIBFTTA | QRIBFTTC
    currency: null,
    amount: null,
    countryCode: null,
    merchantName: null,
    merchantCity: null,
    billNumber: null,
    content: null, // nội dung chuyển khoản
    crc: findField(fields, '63')?.value ?? null,
  }

  // Field 38 - Merchant Account Information (VietQR)
  const f38 = findField(fields, '38')
  if (f38) {
    const sub38 = parseTLVFlat(f38.value)
    const beneficiary = findField(sub38, '01') // nested: 00=bin, 01=account
    const serviceCode = findField(sub38, '02')
    if (beneficiary) {
      const subBank = parseTLVFlat(beneficiary.value)
      result.bankBin = findField(subBank, '00')?.value ?? null
      result.accountNumber = findField(subBank, '01')?.value ?? null
    }
    result.serviceCode = serviceCode?.value ?? null
  }

  // Field 53 - Currency (704 = VND theo ISO 4217)
  result.currency = findField(fields, '53')?.value ?? null

  // Field 54 - Amount
  const f54 = findField(fields, '54')
  result.amount = f54 ? f54.value : null

  // Field 58/59/60 - country / merchant name / city
  result.countryCode = findField(fields, '58')?.value ?? null
  result.merchantName = findField(fields, '59')?.value ?? null
  result.merchantCity = findField(fields, '60')?.value ?? null

  // Field 62 - Additional Data (nội dung chuyển khoản thường nằm ở sub 08,
  // một số ứng dụng lại nhét vào sub 01 - Bill Number)
  const f62 = findField(fields, '62')
  if (f62) {
    const sub62 = parseTLVFlat(f62.value)
    result.billNumber = findField(sub62, '01')?.value ?? null
    const purpose = findField(sub62, '08')?.value ?? null
    result.content = purpose || result.billNumber || null
  }

  return result
}