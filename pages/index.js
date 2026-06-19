import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'

// Constants
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
    : [1000, 10000, 100000].map(m => numVal * m).filter(v => v >= MIN_AMOUNT && v <= MAX_AMOUNT)

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

  if (redirecting || autoLoading) {
    return (
      <>
        <Head>
          <title>Đang chuyển hướng…</title>
          <link rel="icon" type="image/png" href="/Main.png" />
        </Head>
        <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center relative overflow-hidden font-sans">
          <Orbs />
          <div className="relative z-10 bg-white/95 backdrop-blur-xl border border-white shadow-2xl rounded-3xl p-10 w-full max-w-md text-center">
            <img src="/Main.png" alt="MoMo" className="w-12 h-12 mx-auto mb-6 rounded-2xl" />
            <div className="w-16 h-16 border-4 border-[#ae0070]/20 border-t-[#ae0070] rounded-full animate-spin mx-auto mb-6" />
            <div className="text-2xl font-bold text-gray-900 mb-2">Đang mở MoMo…</div>
            <div className="text-gray-600 mb-6">Vui lòng đợi, đang chuyển hướng</div>
            <div className="inline-block px-8 py-4 bg-pink-50 text-3xl font-black text-[#ae0070] rounded-2xl">
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>

      <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <Orbs />

        <div className="relative z-10 w-full max-w-md bg-white/95 backdrop-blur-2xl border border-white/80 rounded-3xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-pink-100">
            <div className="w-12 h-12 bg-white rounded-2xl border border-pink-200 flex items-center justify-center">
              <img src="/Main.png" alt="Logo" className="w-9 h-9" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">MOMO</div>
              <div className="text-sm text-gray-500">Thanh toán IPA</div>
            </div>
          </div>

          {/* Amount */}
          <div className="mb-6 bg-zinc-50 border-2 border-pink-100 focus-within:border-pink-400 rounded-3xl p-6 transition-all">
            <div className="uppercase text-xs font-bold tracking-widest text-gray-500 mb-3">SỐ TIỀN THANH TOÁN</div>
            <div className="flex items-baseline gap-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={display}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="0"
                className="flex-1 bg-transparent text-5xl font-black outline-none text-gray-900 caret-pink-600"
                autoFocus
              />
              <span className="text-3xl font-bold text-gray-400">₫</span>
            </div>
            {numVal > 0 && (
              <div className="mt-4 h-1 bg-pink-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-pink-600 to-pink-500 transition-all" style={{ width: `${Math.min(numVal / MAX_AMOUNT * 100, 100)}%` }} />
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {suggestions.map(v => (
              <button
                key={v}
                onClick={() => pickSuggestion(v)}
                className={`py-3 text-sm font-bold rounded-2xl border-2 transition-all ${numVal === v ? 'bg-pink-600 text-white border-pink-600' : 'bg-white border-pink-100 hover:border-pink-300'}`}
              >
                {v >= 1000000 ? `${(v/1000000)}tr` : v >= 1000 ? `${v/1000}k` : v}
              </button>
            ))}
          </div>

          {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex gap-3 text-sm">{error}</div>}

          <button
            onClick={handlePay}
            disabled={loading || numVal < MIN_AMOUNT}
            className="w-full py-4 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-all disabled:cursor-not-allowed"
          >
            {loading ? (
              <>Đang tạo đơn hàng...</>
            ) : (
              <>Thanh toán {display} ₫</>
            )}
          </button>

          {/* Security */}
          <div className="mt-10 text-center">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">BẢO MẬT CỔNG THANH TOÁN</div>
            <div className="grid grid-cols-2 gap-3">
              {SEC_BADGES.map(b => (
                <div key={b.label} className="flex items-center gap-2 bg-white border border-pink-100 rounded-2xl py-3 px-4 text-xs">
                  <svg className="w-4 h-4 text-pink-600" viewBox="0 0 24 24" fill="currentColor"><path d={b.icon} /></svg>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <OrbsStyle />
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

function OrbsStyle() {
  return (
    <style jsx global>{`
      .orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(60px);
        opacity: 0.6;
        z-index: 0;
        pointer-events: none;
      }
      .orb-1 { top: -10%; left: -10%; width: 55vw; height: 55vw; background: #ff9cb7; animation: orb1 6s infinite alternate ease-in-out; }
      .orb-2 { bottom: -10%; right: -10%; width: 65vw; height: 65vw; background: #b0bec5; animation: orb2 8s infinite alternate ease-in-out; }
      .orb-3 { top: 30%; right: -5%; width: 50vw; height: 50vw; background: #dfb2ea; animation: orb3 7s infinite alternate ease-in-out; }
      .orb-4 { bottom: 5%; left: 5%; width: 45vw; height: 45vw; background: #80cbc4; animation: orb1 7.5s infinite alternate ease-in-out; }

      @keyframes orb1 { 0% { transform: scale(1) translate(0,0); } 100% { transform: scale(1.1) translate(4vw, 5vh); } }
      @keyframes orb2 { 0% { transform: scale(1) translate(0,0); } 100% { transform: scale(0.95) translate(-5vw, -4vh); } }
      @keyframes orb3 { 0% { transform: scale(0.9) translate(0,0); } 100% { transform: scale(1.15) translate(-3vw, 6vh); } }
    `}</style>
  )
}