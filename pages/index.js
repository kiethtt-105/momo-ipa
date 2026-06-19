import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'

// ─── CONSTANTS ───────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [10000, 50000, 100000, 200000]
const MAX_AMOUNT = 50_000_000
const MIN_AMOUNT = 1_000

const fmtDisplay = n => n ? parseInt(n).toLocaleString('vi-VN') : ''

export default function Home() {
  const [rawAmount, setRawAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const autoPayRef = useRef(null)

  const numVal = parseInt(rawAmount) || 0
  const display = fmtDisplay(rawAmount)

  const suggestions = numVal === 0
    ? DEFAULT_SUGGESTIONS
    : [1000, 10000, 100000]
        .map(m => numVal * m)
        .filter(v => v >= MIN_AMOUNT && v <= MAX_AMOUNT)

  const handleChange = e => {
    setError('')
    const digits = e.target.value.replace(/\D/g, '')
    if (digits.length > 8) return
    setRawAmount(digits)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const amt = parseInt(params.get('amount'))
    if (amt >= MIN_AMOUNT && amt <= MAX_AMOUNT) {
      autoPayRef.current = amt
      setAutoLoading(true)
      setRawAmount(String(amt))
    }
  }, [])

  useEffect(() => {
    if (autoPayRef.current && rawAmount === String(autoPayRef.current)) {
      autoPayRef.current = null
      handlePay()
    }
  }, [rawAmount])

  const handleKeyDown = e => {
    if (e.key === 'Enter' && numVal >= MIN_AMOUNT && !loading) handlePay()
  }

  const pickSuggestion = v => {
    setError('')
    setRawAmount(String(v))
    inputRef.current?.focus()
  }

  const handlePay = async () => {
    if (loading) return
    if (numVal < MIN_AMOUNT) return setError('Tối thiểu 1.000 ₫')
    if (numVal > MAX_AMOUNT) return setError('Tối đa 50.000.000 ₫')

    setLoading(true)
    setError('')

    try {
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
          <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        </Head>
        <Orbs />
        <div className="relative z-10 flex min-h-dvh w-full items-center justify-center bg-[#f3e9ed] px-4">
          <div
            className="w-full max-w-[340px] rounded-3xl border border-white/80 bg-white/90 p-11 text-center shadow-[0_24px_60px_rgba(174,0,112,0.1)]"
            style={{ backdropFilter: 'blur(25px)', WebkitBackdropFilter: 'blur(25px)', animation: 'pop 0.25s ease' }}
          >
            <div className="mb-6 flex justify-center">
              <img src="/Main.png" alt="MoMo" width={40} height={40} className="rounded-[10px] object-contain" />
            </div>
            <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center">
              <svg className="h-[52px] w-[52px]" viewBox="0 0 50 50" style={{ animation: 'rot 1s linear infinite' }}>
                <circle cx="25" cy="25" r="20" fill="none" stroke="#ae0070" strokeWidth="4"
                  strokeLinecap="round" strokeDasharray="90" strokeDashoffset="30" />
              </svg>
            </div>
            <div className="mb-1.5 text-xl font-extrabold text-[#1a0413]">Đang mở MoMo…</div>
            <div className="mb-5 text-sm text-[#614655]">Vui lòng đợi, đang chuyển hướng</div>
            <div className="inline-block rounded-xl bg-[#fff0f7] px-5 py-2.5 text-2xl font-black text-[#ae0070]">
              {fmtDisplay(rawAmount)} ₫
            </div>
          </div>
        </div>
        <style>{`
          @keyframes pop { from{transform:scale(0.94);opacity:0} to{transform:scale(1);opacity:1} }
          @keyframes rot  { to { transform: rotate(360deg) } }
        `}</style>
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
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      {/* Background */}
      <div className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#f3e9ed] px-4 py-5"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <Orbs />

        {/* Card */}
        <div
          className="relative z-10 w-full max-w-[400px] rounded-3xl border border-white/70 bg-white/88 p-8 shadow-[0_25px_50px_rgba(174,0,112,0.05)]"
          style={{ backdropFilter: 'blur(25px)', WebkitBackdropFilter: 'blur(25px)' }}
        >
          {/* Logo */}
          <div className="mb-7 flex items-center gap-3.5 border-b border-dashed border-[rgba(174,0,112,0.1)] pb-5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-[rgba(174,0,112,0.1)] bg-white">
              <img src="/Main.png" alt="Logo" className="h-9 w-9 rounded-lg object-contain" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-[#1a0413]">MOMO</div>
              <div className="mt-0.5 text-xs text-[#614655]">Thanh toán IPA</div>
            </div>
          </div>

          {/* Amount input */}
          <div
            className="mb-4 rounded-2xl border-[1.5px] border-[rgba(174,0,112,0.1)] bg-[rgba(240,232,236,0.6)] px-5 pb-4 pt-5 transition-all focus-within:border-[#f0bcd4] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(174,0,112,0.07)]"
          >
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[1.2px] text-[#614655]">
              Số tiền thanh toán
            </div>
            <div className="flex items-baseline gap-1.5">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={display}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="0"
                autoFocus
                className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap bg-transparent text-[#1a0413] outline-none placeholder-[#c4b0bb] caret-[#ae0070]"
                style={{
                  fontFamily: "'Be Vietnam Pro', sans-serif",
                  fontWeight: 900,
                  fontSize: 'clamp(26px, 9vw, 42px)',
                }}
              />
              <span className="flex-shrink-0 text-[22px] font-extrabold text-[#7a6070]">₫</span>
            </div>
            {numVal > 0 && (
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[rgba(174,0,112,0.08)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#ae0070] to-[#ff4fa3] transition-[width] duration-300 ease-out"
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
                onClick={() => pickSuggestion(v)}
                className={`rounded-xl border-[1.5px] px-1 py-2.5 text-[13px] font-bold transition-all duration-150 ${
                  numVal === v
                    ? 'border-[#ae0070] bg-[#ae0070] text-white shadow-[0_4px_12px_rgba(174,0,112,0.2)]'
                    : 'border-[rgba(174,0,112,0.1)] bg-white/70 text-[#495057] hover:-translate-y-0.5 hover:border-[#ae0070] hover:bg-[#fff0f7] hover:text-[#ae0070]'
                }`}
              >
                {v >= 1_000_000 ? `${v / 1_000_000}tr` : v >= 1_000 ? `${v / 1_000}k` : v.toLocaleString('vi-VN')}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-1.5 rounded-[10px] border border-[#fecaca] bg-[#fff1f1] px-3.5 py-2.5 text-[13px] font-bold text-[#dc2626]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={loading || !rawAmount || numVal < MIN_AMOUNT}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-[#ae0070] py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(174,0,112,0.2)] transition-all duration-200 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-[#91005d] hover:not-disabled:shadow-[0_12px_28px_rgba(174,0,112,0.3)] disabled:cursor-not-allowed disabled:bg-[#e2d7dc] disabled:text-[#a89099] disabled:shadow-none"
            style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
          >
            {loading ? (
              <>
                <span className="h-[17px] w-[17px] animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" />
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
        <div className="relative z-10 mt-7 w-full max-w-[400px]">
          <div className="mb-4 flex items-center justify-center gap-2.5 text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#8c7381]">
            <span className="w-9 border-b border-dashed border-[rgba(174,0,112,0.25)]" />
            Bảo mật cổng thanh toán
            <span className="w-9 border-b border-dashed border-[rgba(174,0,112,0.25)]" />
          </div>
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-3.5">
            {SEC_BADGES.map(b => (
              <div key={b.label} className="flex items-center justify-center gap-1.5">
                <svg className="h-[15px] w-[15px] flex-shrink-0 fill-[#ae0070] opacity-80" viewBox="0 0 24 24">
                  <path d={b.icon} />
                </svg>
                <span className="text-xs font-bold text-[#4a3240]">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Orbs() {
  return (
    <>
      <style>{`
        @keyframes om1 { 0%{transform:translate(0,0)scale(1)} 50%{transform:translate(8vw,4vh)scale(1.15)} 100%{transform:translate(-4vw,7vh)scale(0.9)} }
        @keyframes om2 { 0%{transform:translate(0,0)scale(1.1)} 50%{transform:translate(-10vw,-6vh)scale(0.9)} 100%{transform:translate(6vw,4vh)scale(1.1)} }
        @keyframes om3 { 0%{transform:translate(0,0)scale(0.9)} 50%{transform:translate(-5vw,7vh)scale(1.2)} 100%{transform:translate(7vw,-4vh)scale(1)} }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[5%] -top-[5%] h-[50vw] w-[50vw] rounded-full bg-[#ff9cb7] opacity-65 blur-[55px]"
          style={{ animation: 'om1 5s infinite alternate ease-in-out' }} />
        <div className="absolute -bottom-[5%] -right-[5%] h-[60vw] w-[60vw] rounded-full bg-[#b0bec5] opacity-65 blur-[55px]"
          style={{ animation: 'om2 7s infinite alternate ease-in-out' }} />
        <div className="absolute -right-[5%] top-[25%] h-[45vw] w-[45vw] rounded-full bg-[#dfb2ea] opacity-65 blur-[55px]"
          style={{ animation: 'om3 6s infinite alternate ease-in-out' }} />
        <div className="absolute -bottom-[5%] left-[5%] h-[40vw] w-[40vw] rounded-full bg-[#80cbc4] opacity-65 blur-[55px]"
          style={{ animation: 'om1 6.5s infinite alternate ease-in-out' }} />
      </div>
    </>
  )
}

const SEC_BADGES = [
  { label: 'PCI DSS',      icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 1.9v2.6c0 .3-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5v-2.6c-.6-.4-1-1.1-1-1.9 0-1.4 1.1-2.5 2.5-2.5z' },
  { label: 'Mã hóa P2P',   icon: 'M12.65 10C11.83 7.59 9.57 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.57 0 4.83-1.59 5.65-4H17v3h3v-3h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  { label: 'SHA-256',       icon: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' },
  { label: 'MoMo Verified', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
]