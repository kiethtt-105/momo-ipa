import { useState, useEffect, useRef } from 'react'
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
    return `${TX_BASE_URL}/api/momo/redirect?amount=${amt}`
  }

  // Scan — admin tự quét thanh toán nhanh
  const info = (orderInfo || '').trim() || `iPOS${Date.now()}`
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

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function CreateTransactionPage() {
  const [method,    setMethod]    = useState('p2p') // 'p2p' | 'scan'
  const [amount,     setAmount]     = useState('')
  const [orderInfo,  setOrderInfo]  = useState('')
  const [lastUrl,    setLastUrl]    = useState('')
  const [copied,     setCopied]     = useState(false)
  const amountInputRef = useRef(null)

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
        <div className="w-full max-w-[460px] overflow-hidden rounded-[20px] bg-white/95 shadow-[0_24px_60px_rgba(174,0,112,0.1),0_0_0_1px_rgba(255,255,255,0.8)] backdrop-blur-[30px]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-6 py-5">
            <img src="/Main.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <div>
              <div className="text-[17px] font-extrabold tracking-[-0.3px] text-[var(--mm)]">TẠO GIAO DỊCH</div>
            </div>
          </div>

          <div className="px-6 py-5">
            {/* Method selector */}
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">LỰA CHỌN PHƯƠNG THỨC</label>
            <div className="mb-5 grid grid-cols-2 gap-2.5">
              <button
                className={`flex flex-col items-start gap-1 rounded-[12px] border-[1.5px] px-4 py-3 text-left transition-all ${
                  isP2P ? 'border-[var(--mm)] bg-[#fff0f7]' : 'border-[var(--border)] bg-white hover:border-[rgba(174,0,112,0.4)]'
                }`}
                onClick={() => setMethod('p2p')}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: isP2P ? 'var(--mm)' : '#374151' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 17v4h-4M14 21h3"/>
                  </svg>
                  Giao dịch P2P
                </span>
              </button>

              <button
                className={`flex flex-col items-start gap-1 rounded-[12px] border-[1.5px] px-4 py-3 text-left transition-all ${
                  !isP2P ? 'border-[var(--mm)] bg-[#fff0f7]' : 'border-[var(--border)] bg-white hover:border-[rgba(174,0,112,0.4)]'
                }`}
                onClick={() => setMethod('scan')}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: !isP2P ? 'var(--mm)' : '#374151' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9V5a2 2 0 0 1 2-2h2M21 9V5a2 2 0 0 0-2-2h-2M3 15v4a2 2 0 0 0 2 2h2M21 15v4a2 2 0 0 1-2 2h-2"/>
                    <path d="M12 11v4M9 14h6"/>
                  </svg>
                  Scan QR 
                </span>
              </button>
            </div>

            {/* Amount */}
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">AMOUNT</label>
            <input
              type="text"
              inputMode="numeric"
              value={formatAmount(amount)}
              onChange={e => setAmount(unformatAmount(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
              className="mb-4 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 font-['Outfit',_sans-serif] text-xl font-extrabold tracking-tight text-[var(--mm)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.1)]"
              ref={amountInputRef}
            />

            {/* Order info — chỉ cần cho phương thức Scan */}
            {!isP2P && (
              <>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">ORDER ID</label>
                <input
                  type="text"
                  value={orderInfo}
                  onChange={e => setOrderInfo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
                  className="mb-1 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 font-mono text-sm text-[var(--admin-text)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.1)]"
                />
              </>
            )}

            {/* Submit */}
            <button
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--mm)] py-[13px] font-[var(--admin-font)] text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-px hover:bg-[#91005d] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>
              </svg>
              CREATE TRANSACTION
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