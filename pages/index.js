import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import Orbs from '../components/Orbs'
import NoiseOverlay from '../components/NoiseOverlay'

// ─── Gợi ý nhanh mặc định ────────────────────────────────────
const DEFAULT_SUGGESTIONS = [10000, 50000, 100000, 200000]
const MAX_AMOUNT = 50_000_000
const MIN_AMOUNT = 1_000

// ─── Format hiển thị (không có dấu thập phân) ─────────────────
const fmtDisplay = n => n ? parseInt(n).toLocaleString('vi-VN') : ''

export default function Home() {
  const [rawAmount, setRawAmount] = useState('') // số thô, không format
  const [loading,   setLoading]   = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false) // ẩn form khi auto-pay từ URL
  const [error,     setError]     = useState('')
  const inputRef  = useRef(null)
  const autoPayRef = useRef(null) // lưu amount từ URL để auto-pay

  const numVal = parseInt(rawAmount) || 0
  const display = fmtDisplay(rawAmount)

  // Dynamic suggestions: nếu chưa nhập → mặc định, đã nhập → x1000, x10000, x100000
  const suggestions = numVal === 0
    ? DEFAULT_SUGGESTIONS
    : [1000, 10000, 100000]
        .map(m => numVal * m)
        .filter(v => v >= MIN_AMOUNT && v <= MAX_AMOUNT)

  // ── Xử lý input: chỉ lấy số, bỏ dấu phẩy/chấm format ───────
  const handleChange = e => {
    setError('')
    // strip mọi thứ không phải số
    const digits = e.target.value.replace(/\D/g, '')
    // giới hạn 8 chữ số (max 99,999,999 — đủ cho 50tr)
    if (digits.length > 8) return
    setRawAmount(digits)
  }

  // ── Đọc ?amount= từ URL (iPhone Shortcut) ────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const amt = parseInt(params.get('amount'))
    if (amt >= MIN_AMOUNT && amt <= MAX_AMOUNT) {
      autoPayRef.current = amt
      setAutoLoading(true) // ẩn form ngay lập tức
      setRawAmount(String(amt))
    }
  }, [])

  // ── Auto-pay khi rawAmount đã set từ URL param ────────────────
  useEffect(() => {
    if (autoPayRef.current && rawAmount === String(autoPayRef.current)) {
      autoPayRef.current = null // chỉ chạy 1 lần
      handlePay()
    }
  }, [rawAmount])

  // ── Giữ cursor cuối sau khi format ───────────────────────────
  const handleKeyDown = e => {
    if (e.key === 'Enter' && numVal >= MIN_AMOUNT && !loading) handlePay()
  }

  // ── Chọn gợi ý ───────────────────────────────────────────────
  const pickSuggestion = v => {
    setError('')
    setRawAmount(String(v))
    inputRef.current?.focus()
  }

  // ── Thanh toán ───────────────────────────────────────────────
  const handlePay = async () => {
    if (loading) return // chặn double-click trước khi React re-render disabled kịp
    if (numVal < MIN_AMOUNT) return setError('Tối thiểu 1.000 ₫')
    if (numVal > MAX_AMOUNT) return setError('Tối đa 50.000.000 ₫')

    setLoading(true)
    setError('')

    try {
      // Thêm hậu tố ngẫu nhiên: Date.now() có thể trùng nếu 2 request tạo đơn
      // rơi đúng cùng 1 millisecond (vd: auto-pay từ URL + người dùng bấm tay)
      const orderId = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`
      const res = await fetch('/api/momo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount: numVal,
          orderInfo: `Thanh toán ${orderId}`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định')

      // ← ẩn form NGAY, hiện màn chờ redirect
      setRedirecting(true)
      window.location.href = data.payUrl
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  // ── Màn chờ redirect ─────────────────────────────────────────
  if (redirecting || autoLoading) {
    return (
      <>
        <Head>
          <title>Đang chuyển hướng…</title>
          <link rel="icon" type="image/png" href="/Main.png" />
        </Head>

        <div className="relative grid min-h-dvh w-screen place-content-center justify-items-center overflow-y-auto overflow-x-hidden bg-[#f3e9ed] px-4 py-5">
          <Orbs />
          <NoiseOverlay />

          <div className="relative z-[2] w-full max-w-[340px] animate-pop rounded-3xl border border-white/80 bg-white/90 px-9 py-11 text-center shadow-[0_24px_60px_rgba(174,0,112,0.1)] backdrop-blur-[25px]">
            <div className="mb-6">
              <img
                src="/Main.png"
                alt="MoMo"
                width={40}
                height={40}
                className="inline-block rounded-[10px] object-contain"
              />
            </div>

            <div className="mx-auto mb-5 h-[52px] w-[52px]">
              <svg className="h-full w-full animate-[spin_1s_linear_infinite] stroke-mm" viewBox="0 0 50 50">
                <circle
                  cx="25" cy="25" r="20" fill="none"
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray="90" strokeDashoffset="30"
                />
              </svg>
            </div>

            <div className="mb-1.5 text-xl font-extrabold text-ink">Đang mở MoMo…</div>
            <div className="mb-5 text-[13px] text-muted">Vui lòng đợi, đang chuyển hướng</div>
            <div className="inline-block rounded-xl bg-[#fff0f7] px-5 py-2.5 text-[22px] font-black text-mm">
              {fmtDisplay(rawAmount)} ₫
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Form chính ───────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Thanh toán MoMo · IPA</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>

      <div className="relative grid min-h-dvh w-screen place-content-center justify-items-center overflow-y-auto overflow-x-hidden bg-[#f3e9ed] px-4 py-5 text-ink">
        <Orbs />
        <NoiseOverlay />

        <div className="relative z-[2] w-full max-w-[400px] rounded-3xl border border-white/70 bg-white/[0.88] px-7 py-8 shadow-[0_25px_50px_rgba(174,0,112,0.05)] backdrop-blur-[25px] max-[480px]:px-[18px] max-[480px]:py-6">
          {/* Logo */}
          <div className="mb-7 flex items-center gap-3.5 border-b border-dashed border-[rgba(174,0,112,0.1)] pb-5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-[rgba(174,0,112,0.1)] bg-white">
              <img src="/Main.png" alt="Logo" className="h-9 w-9 rounded-lg object-contain" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-ink">MOMO</div>
              <div className="mt-0.5 text-xs text-muted">Thanh toán IPA</div>
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-4 rounded-2xl border-[1.5px] border-[rgba(174,0,112,0.1)] bg-[rgba(240,232,236,0.6)] px-[22px] pt-5 pb-4 transition-all duration-200 focus-within:border-[#f0bcd4] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(174,0,112,0.07)]">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[1.2px] text-muted">Số tiền thanh toán</div>
            <div className="flex items-baseline gap-1.5">
              <input
                ref={inputRef}
                className="min-w-0 flex-1 overflow-hidden whitespace-nowrap bg-transparent text-[clamp(26px,9vw,42px)] font-black text-ink text-ellipsis caret-mm outline-none placeholder:font-bold placeholder:text-[#c4b0bb]"
                type="text"
                inputMode="numeric"
                value={display}           // ← hiển thị formatted
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="0"
                autoFocus
              />
              <span className="flex-shrink-0 text-[22px] font-extrabold text-[#7a6070]">₫</span>
            </div>

            {/* Range bar visual */}
            {numVal > 0 && (
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[rgba(174,0,112,0.08)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-mm to-[#ff4fa3] transition-[width] duration-300 ease-in-out"
                  style={{ width: `${Math.min(numVal / MAX_AMOUNT * 100, 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Quick suggestions */}
          <div className="mb-5 grid grid-cols-4 gap-2">
            {suggestions.map(v => (
              <button
                key={v}
                className={
                  numVal === v
                    ? 'rounded-xl border-[1.5px] border-mm bg-mm px-1 py-[11px] text-center text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(174,0,112,0.2)] transition-all duration-150 max-[480px]:px-0.5 max-[480px]:py-2.5 max-[480px]:text-xs'
                    : 'rounded-xl border-[1.5px] border-[rgba(174,0,112,0.1)] bg-white/70 px-1 py-[11px] text-center text-[13px] font-bold text-[#495057] transition-all duration-150 hover:-translate-y-px hover:border-mm hover:bg-[#fff0f7] hover:text-mm max-[480px]:px-0.5 max-[480px]:py-2.5 max-[480px]:text-xs'
                }
                onClick={() => pickSuggestion(v)}
              >
                {v >= 1_000_000
                  ? `${v / 1_000_000}tr`
                  : v >= 1_000
                    ? `${v / 1_000}k`
                    : v.toLocaleString('vi-VN')}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-[7px] rounded-[10px] border border-[#fecaca] bg-[#fff1f1] px-3.5 py-2.5 text-[13px] font-bold text-[#dc2626]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          {/* Pay button */}
          <button
            className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-mm py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(174,0,112,0.2)] transition-all duration-200 hover:[&:not(:disabled)]:-translate-y-0.5 hover:[&:not(:disabled)]:bg-mm-dark hover:[&:not(:disabled)]:shadow-[0_12px_28px_rgba(174,0,112,0.3)] disabled:cursor-not-allowed disabled:bg-[#e2d7dc] disabled:text-[#a89099] disabled:shadow-none"
            onClick={handlePay}
            disabled={loading || !rawAmount || numVal < MIN_AMOUNT}
          >
            {loading ? (
              <>
                <div className="h-[17px] w-[17px] animate-[spin_0.6s_linear_infinite] rounded-full border-[2.5px] border-white/30 border-t-white" />
                Đang tạo đơn hàng…
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
                {display ? `Thanh toán ${display} ₫` : 'Nhập số tiền'}
              </>
            )}
          </button>
        </div>

        {/* Security footer */}
        <div className="relative z-[2] mt-7 w-full max-w-[400px]">
          <div className="mb-4 flex items-center justify-center text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#8c7381] before:mx-2.5 before:w-9 before:border-b before:border-dashed before:border-[rgba(174,0,112,0.25)] before:content-[''] after:mx-2.5 after:w-9 after:border-b after:border-dashed after:border-[rgba(174,0,112,0.25)] after:content-['']">
            Bảo mật cổng thanh toán
          </div>
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
            {SEC_BADGES.map(b => (
              <div key={b.label} className="flex items-center justify-center gap-[7px]">
                <svg className="h-[15px] w-[15px] flex-shrink-0 fill-mm opacity-80" viewBox="0 0 24 24"><path d={b.icon} /></svg>
                <span className="text-xs font-bold text-[#4a3240]">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

const SEC_BADGES = [
  { label: 'PCI DSS',       icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 1.9v2.6c0 .3-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5v-2.6c-.6-.4-1-1.1-1-1.9 0-1.4 1.1-2.5 2.5-2.5z' },
  { label: 'Mã hóa P2P',    icon: 'M12.65 10C11.83 7.59 9.57 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.57 0 4.83-1.59 5.65-4H17v3h3v-3h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  { label: 'SHA-256',        icon: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' },
  { label: 'MoMo Verified',  icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
]