import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'

// ─── Gợi ý nhanh mặc định ────────────────────────────────────
const DEFAULT_SUGGESTIONS = [10000, 50000, 100000, 200000]
const MAX_AMOUNT = 50_000_000
const MIN_AMOUNT = 1_000

const fmtDisplay = n => n ? parseInt(n).toLocaleString('vi-VN') : ''

const SEC_BADGES = [
  { label: 'PCI DSS',       icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 1.9v2.6c0 .3-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5v-2.6c-.6-.4-1-1.1-1-1.9 0-1.4 1.1-2.5 2.5-2.5z' },
  { label: 'Mã hóa P2P',    icon: 'M12.65 10C11.83 7.59 9.57 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.57 0 4.83-1.59 5.65-4H17v3h3v-3h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  { label: 'SHA-256',        icon: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' },
  { label: 'MoMo Verified',  icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
]

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
        body: JSON.stringify({ orderId, amount: numVal, orderInfo: `Thanh toán ${orderId}` }),
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
        </Head>
        <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center overflow-hidden relative font-['Be_Vietnam_Pro',sans-serif]">
          <Orbs />
          <div className="relative z-10 bg-white/90 backdrop-blur-2xl border border-white/70 shadow-2xl rounded-3xl p-11 w-full max-w-[340px] text-center">
            <div className="mb-6">
              <img src="/Main.png" alt="MoMo" className="w-10 h-10 mx-auto rounded-xl" />
            </div>
            <div className="mx-auto w-14 h-14 border-4 border-[#ae0070]/20 border-t-[#ae0070] rounded-full animate-spin mb-6" />
            <div className="text-xl font-bold text-[#1a0413] mb-1">Đang mở MoMo…</div>
            <div className="text-sm text-[#614655] mb-5">Vui lòng đợi, đang chuyển hướng</div>
            <div className="inline-block px-6 py-3 bg-[#fff0f7] rounded-2xl text-2xl font-black text-[#ae0070]">
              {fmtDisplay(rawAmount)} ₫
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Thanh toán MoMo · IPA</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>

      <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center p-4 overflow-hidden relative font-['Be_Vietnam_Pro',sans-serif]">
        <Orbs />

        <div className="relative z-10 w-full max-w-[400px] bg-white/90 backdrop-blur-2xl border border-white/70 rounded-3xl shadow-xl p-8 md:p-9">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-[#ae0070]/10">
            <div className="w-12 h-12 bg-white rounded-2xl border border-[#ae0070]/10 flex items-center justify-center flex-shrink-0">
              <img src="/Main.png" alt="Logo" className="w-9 h-9 rounded-lg" />
            </div>
            <div>
              <div className="font-bold text-xl text-[#1a0413]">MOMO</div>
              <div className="text-xs text-[#614655]">Thanh toán IPA</div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="mb-6 bg-[#f0e8ec]/60 border-2 border-[#ae0070]/10 focus-within:border-[#f0bcd4] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(174,0,112,0.07)] rounded-2xl p-6 transition-all">
            <div className="uppercase text-[10px] font-bold tracking-[1.2px] text-[#614655] mb-3">SỐ TIỀN THANH TOÁN</div>
            <div className="flex items-baseline gap-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={display}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="0"
                className="flex-1 bg-transparent text-[clamp(26px,9vw,42px)] font-black text-[#1a0413] outline-none caret-[#ae0070] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                autoFocus
              />
              <span className="text-2xl font-black text-[#7a6070]">₫</span>
            </div>

            {numVal > 0 && (
              <div className="h-0.5 bg-[#ae0070]/10 rounded-full mt-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#ae0070] to-[#ff4fa3] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((numVal / MAX_AMOUNT) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Quick Suggestions */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            {suggestions.map(v => (
              <button
                key={v}
                onClick={() => pickSuggestion(v)}
                className={`py-3 px-2 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95
                  ${numVal === v 
                    ? 'bg-[#ae0070] border-[#ae0070] text-white shadow-lg' 
                    : 'bg-white/70 border-[#ae0070]/10 hover:border-[#ae0070] hover:text-[#ae0070] hover:bg-[#fff0f7]'
                  }`}
              >
                {v >= 1_000_000 ? `${v / 1_000_000}tr` : v >= 1_000 ? `${v / 1_000}k` : v.toLocaleString('vi-VN')}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-2xl p-4 mb-6 text-sm font-bold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePay}
            disabled={loading || !rawAmount || numVal < MIN_AMOUNT}
            className="w-full py-4 px-6 bg-[#ae0070] hover:bg-[#91005d] disabled:bg-[#e2d7dc] disabled:text-[#a89099] text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl transition-all active:scale-[0.985] disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang tạo đơn hàng…
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
                {display ? `Thanh toán ${display} ₫` : 'Nhập số tiền'}
              </>
            )}
          </button>

          {/* Security Footer */}
          <div className="mt-10">
            <div className="flex items-center justify-center gap-3 text-xs uppercase font-bold tracking-widest text-[#8c7381] mb-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#ae0070]/20 to-transparent" />
              BẢO MẬT CỔNG THANH TOÁN
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#ae0070]/20 to-transparent" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {SEC_BADGES.map(b => (
                <div key={b.label} className="flex items-center gap-2 justify-center bg-white/60 rounded-2xl py-3 px-4 border border-[#ae0070]/10">
                  <svg className="w-4 h-4 text-[#ae0070]" viewBox="0 0 24 24" fill="currentColor">
                    <path d={b.icon} />
                  </svg>
                  <span className="font-bold text-[#4a3240]">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Orbs() {
  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
    </>
  )
}

// Orbs styles
<style jsx>{`
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(55px);
    opacity: 0.65;
    z-index: 0;
    pointer-events: none;
  }
  .orb-1 { top: -5%; left: -5%; width: 50vw; height: 50vw; background: #ff9cb7; animation: orbMove1 5s infinite alternate ease-in-out; }
  .orb-2 { bottom: -5%; right: -5%; width: 60vw; height: 60vw; background: #b0bec5; animation: orbMove2 7s infinite alternate ease-in-out; }
  .orb-3 { top: 25%; right: -5%; width: 45vw; height: 45vw; background: #dfb2ea; animation: orbMove3 6s infinite alternate ease-in-out; }
  .orb-4 { bottom: -5%; left: 5%; width: 40vw; height: 40vw; background: #80cbc4; animation: orbMove1 6.5s infinite alternate ease-in-out; }

  @keyframes orbMove1 { 0% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(8vw,4vh,0) scale(1.15); } 100% { transform: translate3d(-4vw,7vh,0) scale(0.9); } }
  @keyframes orbMove2 { 0% { transform: translate3d(0,0,0) scale(1.1); } 50% { transform: translate3d(-10vw,-6vh,0) scale(0.9); } 100% { transform: translate3d(6vw,4vh,0) scale(1.1); } }
  @keyframes orbMove3 { 0% { transform: translate3d(0,0,0) scale(0.9); } 50% { transform: translate3d(-5vw,7vh,0) scale(1.2); } 100% { transform: translate3d(7vw,-4vh,0) scale(1); } }
`}</style>