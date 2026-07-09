// lib/momo/vietqr-bank-directory.js
//
// Tra cứu thông tin ngân hàng (code ngắn dùng cho deeplink, tên hiển thị...)
// trực tiếp từ danh sách chính thức của VietQR.io theo BIN, thay vì tự
// gõ tay 1 bảng cố định — vì mã "code" ngắn (vd "VCB", "ICB"...) dùng để
// build tham số `ba=<account>@<code>` trong deeplink https://dl.vietqr.io
// cần khớp CHÍNH XÁC với hệ thống VietQR.io, không phải mã BIN/SWIFT nói
// chung (nhiều nguồn khác nhau đặt tên viết tắt khác nhau, dễ sai).
//
// Nguồn: https://api.vietqr.io/v2/banks (public, không cần API key để đọc
// danh sách ngân hàng — chỉ cần key cho các API tạo QR/tra cứu số TK).

import { lookupBank as lookupBankStatic } from './bank-bin'

const BANKS_URL = 'https://api.vietqr.io/v2/banks'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — danh sách ngân hàng hiếm khi đổi

let cache = null // { banks: [...], ts: number }

async function getBankDirectory() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.banks
  }
  const r = await fetch(BANKS_URL)
  if (!r.ok) {
    throw new Error(`VietQR.io banks API trả về status ${r.status}`)
  }
  const json = await r.json()
  const banks = Array.isArray(json.data) ? json.data : []
  cache = { banks, ts: Date.now() }
  return banks
}

/**
 * Tra cứu ngân hàng theo BIN, ưu tiên dữ liệu sống từ VietQR.io.
 * Nếu gọi API lỗi (mất mạng, VietQR.io sập...) thì fallback về bảng tĩnh
 * nội bộ (lib/momo/bank-bin.js) để API vietqr-pay vẫn trả được kết quả,
 * chỉ là có thể thiếu field `code` chuẩn để build deeplink.
 *
 * @param {string} bin
 * @returns {Promise<{bin: string|null, code: string|null, name: string|null, fullName: string|null, source: 'vietqr.io'|'static'|'none'}>}
 */
export async function lookupBankByBin(bin) {
  if (!bin) {
    return { bin: null, code: null, name: null, fullName: null, source: 'none' }
  }

  try {
    const banks = await getBankDirectory()
    const hit = banks.find((b) => String(b.bin) === String(bin))
    if (hit) {
      return {
        bin,
        code: hit.code || null, // mã ngắn dùng cho deeplink (vd "VCB", "ICB")
        name: hit.shortName || hit.short_name || hit.name || null,
        fullName: hit.name || null,
        source: 'vietqr.io',
      }
    }
    // Có kết nối được VietQR.io nhưng không thấy BIN này trong danh sách
    // (ngân hàng quá mới hoặc không hỗ trợ VietQR) -> thử fallback tĩnh
    const fallback = lookupBankStatic(bin)
    return { ...fallback, fullName: fallback.name, source: fallback.name ? 'static' : 'none' }
  } catch (err) {
    console.error('[vietqr-bank-directory] lookup lỗi, dùng bảng tĩnh:', err.message)
    const fallback = lookupBankStatic(bin)
    return { ...fallback, fullName: fallback.name, source: fallback.name ? 'static' : 'none' }
  }
}