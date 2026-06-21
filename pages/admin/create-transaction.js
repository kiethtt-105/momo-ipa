import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
const TX_BASE_URL = 'https://kiehtt.vercel.app'

// ─── BUILD TARGET URL ──────────────────────────────────────
// Đây chính là "API" được gọi khi bấm nút — cùng dạng URL này
// có thể tái sử dụng trực tiếp trong iPhone Shortcuts (action
// "Get Contents of URL" / "Open URL") để tạo giao dịch nhanh
// mà không cần mở trang này.
function buildTxUrl(method, amount, orderInfo) {
  const amt = parseInt(amount, 10)
  if (!amt || amt <= 0) return null

  if (method === 'p2p') {
    // P2P — khách quét QR, trả về trang chuyển hướng MoMo
    const info = (orderInfo || '').trim() || genOrderId()
    return `${TX_BASE_URL}/api/momo/redirect?amount=${amt}&orderInfo=${encodeURIComponent(info)}`
  }

  // Scan — admin tự quét thanh toán nhanh
  const info = (orderInfo || '').trim() || genOrderId()
  return `${TX_BASE_URL}/api/admin/scan-quick?amount=${amt}&orderInfo=${encodeURIComponent(info)}`
}

// ─── FORMAT SỐ TIỀN (hiển thị có dấu phẩy ngăn hàng nghìn) ──
function formatAmount(raw) {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('en-US')
}
function unformatAmount(formatted) {
  return (formatted || '').replace(/\D/g, '')
}

// ─── SINH MÃ ĐƠN MẶC ĐỊNH — đồng bộ định dạng iPOS+... trên toàn hệ thống ──
function genOrderId() {
  return `iPOS${Date.now()}`
}

// ─── GỢI Ý SỐ TIỀN NHANH ────────────────────────────────────
const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000]

// Lưu draft form (method/amount/orderInfo) vào sessionStorage — chống mất
// nội dung đang nhập khi lỡ tay F5 trước khi bấm "Xác nhận tạo giao dịch".
const DRAFT_KEY = 'momo_create_tx_draft'

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function CreateTransactionPage() {
  const router = useRouter()
  const [method,    setMethod]    = useState('scan') // 'p2p' | 'scan' — mặc định Scan QR vì đa số dùng tại quầy
  const [amount,     setAmount]     = useState('')
  const [orderInfo,  setOrderInfo]  = useState(() => genOrderId())
  const [lastUrl,    setLastUrl]    = useState('')
  const [copied,     setCopied]     = useState(false)
  const amountInputRef = useRef(null)

  // Khôi phục draft đã nhập trước đó (nếu lỡ F5)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.method) setMethod(d.method)
        if (d.amount) setAmount(d.amount)
        if (d.orderInfo) setOrderInfo(d.orderInfo)
      }
    } catch (e) {
      console.error('Không khôi phục được draft tạo giao dịch:', e)
    }
  }, [])

  // Đọc ?method=&amount=&orderInfo= từ URL — dùng khi quay lại từ nút
  // "Thử thanh toán lại" ở result.js. ƯU TIÊN HƠN draft cũ vì đây là ý định
  // hiện tại của admin (thử lại 1 đơn cụ thể), không phải nháp đang gõ dở.
  useEffect(() => {
    if (!router.isReady) return
    const { method: qMethod, amount: qAmount, orderInfo: qOrderInfo } = router.query
    if (qMethod === 'p2p' || qMethod === 'scan') setMethod(qMethod)
    if (qAmount) setAmount(String(parseInt(qAmount, 10) || ''))
    if (qOrderInfo) setOrderInfo(String(qOrderInfo))
  }, [router.isReady])

  // Tự lưu lại draft mỗi khi admin thay đổi method/amount/orderInfo
  useEffect(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ method, amount, orderInfo }))
  }, [method, amount, orderInfo])

  // Chỉ tự focus input "Số tiền" trên màn lớn (laptop/desktop).
  // Trên điện thoại, autoFocus sẽ bật bàn phím ngay khi load
  // trang → che mất nút "Mở giao dịch" và gây giật layout.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      amountInputRef.current?.focus()
    }
  }, [])

  const isP2P     = method === 'p2p'
  const canSubmit = parseInt(amount || 0, 10) > 0

  // ── MỞ GIAO DỊCH (gọi thẳng URL — đây là phần có thể thay
  // bằng 1 action trong iPhone Shortcuts sau này) ────────────
  const handleCreate = () => {
    const url = buildTxUrl(method, amount, orderInfo)
    if (!url) return
    setLastUrl(url)
    setCopied(false)
    window.open(url, '_blank')
    setOrderInfo(genOrderId()) // sinh mã mới cho lần tạo tiếp theo
  }

  const copyUrl = () => {
    if (!lastUrl) return
    navigator.clipboard?.writeText(lastUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <Head>
        <title>Tạo Giao Dịch</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&display=swap" />
      </Head>

      <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[#f5edf2] p-5 font-[var(--admin-font)] text-[var(--admin-text)]">
        <div className="w-full max-w-[440px] overflow-hidden rounded-[22px] bg-white/95 shadow-[0_24px_60px_rgba(174,0,112,0.1),0_0_0_1px_rgba(255,255,255,0.8)] backdrop-blur-[30px]">
          {/* Dải gradient thương hiệu — đồng bộ với index.js / result.js */}
          <div className="h-1 w-full bg-gradient-to-r from-[#ff9cb7] via-[var(--mm)] to-[#dfb2ea]" />

          {/* Header */}
          <div className="flex items-center gap-3 px-6 pb-4 pt-5">
            <img src="/Main.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <div>
              <div className="text-[17px] font-extrabold tracking-[-0.3px] text-[var(--mm)]">TẠO GIAO DỊCH</div>
              <div className="text-[11px] font-medium text-[var(--admin-muted)]">Tạo link / QR thanh toán cho quầy</div>
            </div>
          </div>

          <div className="px-6 pb-6">
            {/* Method selector — tab trượt, thay cho 2 ô vuông cũ */}
            <div className="relative mb-2.5 flex rounded-2xl bg-[#f3edf1] p-1">
              <div
                className="absolute inset-y-1 rounded-xl bg-white shadow-[0_2px_10px_rgba(174,0,112,0.18)] transition-[left] duration-300 ease-out"
                style={{ left: isP2P ? '4px' : '50%', width: 'calc(50% - 4px)' }}
              />
              <button
                type="button"
                onClick={() => setMethod('p2p')}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
                  isP2P ? 'text-[var(--mm)]' : 'text-[#9a8a93] hover:text-[#6b5c64]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 17v4h-4M14 21h3"/>
                </svg>
                Giao dịch P2P
              </button>
              <button
                type="button"
                onClick={() => setMethod('scan')}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
                  !isP2P ? 'text-[var(--mm)]' : 'text-[#9a8a93] hover:text-[#6b5c64]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9V5a2 2 0 0 1 2-2h2M21 9V5a2 2 0 0 0-2-2h-2M3 15v4a2 2 0 0 0 2 2h2M21 15v4a2 2 0 0 1-2 2h-2"/>
                  <path d="M12 11v4M9 14h6"/>
                </svg>
                Scan QR
              </button>
            </div>

            {/* Mô tả ngắn theo phương thức đang chọn */}
            <p className="mb-5 px-1 text-[11.5px] leading-snug text-[var(--admin-muted)]">
              {isP2P
                ? 'Khách tự quét mã QR bằng app MoMo — hệ thống tự xác nhận khi MoMo báo về.'
                : 'Admin bắn mã thanh toán tại quầy bằng camera hoặc máy quẹt thẻ POS.'}
            </p>

            {/* Amount */}
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Nhập số tiền thanh toán</label>
            <input
              type="text"
              inputMode="numeric"
              value={formatAmount(amount)}
              onChange={e => setAmount(unformatAmount(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
              className="mb-3 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 font-['Outfit',_sans-serif] text-xl font-extrabold tracking-tight text-[var(--mm)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.1)]"
              ref={amountInputRef}
            />

            {/* Gợi ý số tiền nhanh */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map(v => {
                const active = parseInt(amount || 0, 10) === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className={`rounded-[9px] border-[1.5px] py-2 text-[13px] font-bold transition-all ${
                      active
                        ? 'border-[var(--mm)] bg-[var(--mm)] text-white'
                        : 'border-[var(--border)] bg-white text-[#495057] hover:border-[var(--mm)] hover:bg-[#fff0f7] hover:text-[var(--mm)]'
                    }`}
                  >
                    {v >= 1_000_000 ? `${v / 1_000_000}tr` : `${v / 1_000}k`}
                  </button>
                )
              })}
            </div>

            {/* Order info — hiện cho cả P2P và Scan */}
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Nhập thông tin đơn hàng</label>
            <input
              type="text"
              value={orderInfo}
              onChange={e => setOrderInfo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
              className="mb-1 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 font-mono text-sm text-[var(--admin-text)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.1)]"
            />

            {/* Submit */}
            <button
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--mm)] py-[13px] font-[var(--admin-font)] text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-px hover:bg-[#91005d] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>
              </svg>
              Xác nhận tạo giao dịch
            </button>

            {/* URL vừa gọi — để bạn copy dùng làm mẫu cho iPhone Shortcuts sau */}
            {lastUrl && (
              <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[#fafafa] p-3">
                <div className="break-all font-mono text-[11px] text-[#374151]">{lastUrl}</div>
                <button
                  className="mt-2 rounded-md bg-black/[0.06] px-2.5 py-1 text-[11px] font-semibold text-[#374151] transition-colors hover:bg-black/[0.1]"
                  onClick={copyUrl}
                >
                  {copied ? '✓ Đã copy' : 'Copy URL'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}