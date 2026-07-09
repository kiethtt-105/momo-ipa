// lib/momo/bank-bin.js
//
// Bảng map BIN (theo chuẩn NAPAS 247 / VietQR) -> thông tin ngân hàng.
// Đây là danh sách phổ biến, không đảm bảo đầy đủ 100% — nếu gặp BIN lạ,
// hàm lookupBank() vẫn trả về object với bin nhưng name = null, code = null
// để chỗ gọi tự xử lý (hiển thị "Ngân hàng (BIN: xxx)" chẳng hạn), thay vì
// throw lỗi.
//
// Nguồn: napas.com.vn công bố danh sách BIN các ngân hàng thành viên
// NAPAS 247 / VietQR. Cập nhật lại nếu NAPAS bổ sung thành viên mới.

export const BANK_BIN_TABLE = {
  '970436': { code: 'VCB',  name: 'Vietcombank' },
  '970415': { code: 'ICB',  name: 'VietinBank' },
  '970418': { code: 'BIDV', name: 'BIDV' },
  '970405': { code: 'AGB',  name: 'Agribank' },
  '970407': { code: 'TCB',  name: 'Techcombank' },
  '970422': { code: 'MB',   name: 'MB Bank' },
  '970432': { code: 'VPB',  name: 'VPBank' },
  '970416': { code: 'ACB',  name: 'ACB' },
  '970423': { code: 'TPB',  name: 'TPBank' },
  '970403': { code: 'STB',  name: 'Sacombank' },
  '970441': { code: 'VIB',  name: 'VIB' },
  '970443': { code: 'SHB',  name: 'SHB' },
  '970431': { code: 'EIB',  name: 'Eximbank' },
  '970448': { code: 'OCB',  name: 'OCB' },
  '970454': { code: 'VCCB', name: 'Viet Capital Bank (Bản Việt)' },
  '970442': { code: 'HDB',  name: 'HDBank' },
  '970426': { code: 'MSB',  name: 'MSB' },
  '970429': { code: 'SCB',  name: 'SCB (Sài Gòn)' },
  '970425': { code: 'ABB',  name: 'ABBank' },
  '970440': { code: 'SEAB', name: 'SeABank' },
  '970414': { code: 'IVB',  name: 'IVB (Indovina)' },
  '970419': { code: 'NCB',  name: 'NCB (Quốc Dân)' },
  '970449': { code: 'BAB',  name: 'BacABank' },
  '970433': { code: 'VAB',  name: 'VietABank' },
  '970437': { code: 'HLB',  name: 'HLBank' },
  '970438': { code: 'BVB',  name: 'BaoVietBank' },
  '970452': { code: 'KLB',  name: 'KienLongBank' },
  '970439': { code: 'PBVN', name: 'PublicBank Vietnam' },
  '970430': { code: 'PGB',  name: 'PGBank' },
  '970412': { code: 'PVCB', name: 'PVcomBank' },
  '970446': { code: 'COOPBANK', name: 'Co-opBank' },
  '970427': { code: 'VBSP', name: 'Ngân hàng Chính sách Xã hội' },
  '546034': { code: 'CIMB', name: 'CIMB Vietnam' },
  '970458': { code: 'UOB',  name: 'UOB Vietnam' },
  '970462': { code: 'MAFC', name: 'Mirae Asset Finance' },
  '970457': { code: 'WVN',  name: 'Woori Vietnam' },
  '970421': { code: 'VRB',  name: 'VRB (Việt Nga)' },
  '963388': { code: 'VTLMONEY', name: 'Viettel Money' },
  '971011': { code: 'VNPTMONEY', name: 'VNPT Money' },
  '971005': { code: 'VIETTELPAY', name: 'ViettelPay' },
  '970409': { code: 'BVBank', name: 'BVBank (Bản Việt cũ / Viet Capital)' },
}

export function lookupBank(bin) {
  const hit = bin ? BANK_BIN_TABLE[bin] : null
  return {
    bin: bin || null,
    code: hit ? hit.code : null,
    name: hit ? hit.name : null,
  }
}