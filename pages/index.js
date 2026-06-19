import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'

const DEFAULT_SUGGESTIONS = [10000, 50000, 100000, 200000]
const MAX_AMOUNT = 50000000
const MIN_AMOUNT = 1000

const fmtDisplay = (n) => (n ? parseInt(n).toLocaleString('vi-VN') : '')

const SEC_BADGES = [
  { label: 'PCI DSS', icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 1.9v2.6c0 .3-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5v-2.6c-.6-.4-1-1.1-1-1.9 0-1.4 1.1-2.5 2.5-2.5z' },
  { label: 'Mã hóa P2P', icon: 'M12.65 10C11.83 7.59 9.57 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.57 0 4.83-1.59 5.65-4H17v3h3v-3h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  { label: 'SHA-256', icon: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' },
  { label: 'MoMo Verified', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
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

  const handleChange = (e) => {
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

  const handlePay = async () => {
    if (loading || numVal < MIN_AMOUNT || numVal > MAX_AMOUNT) return

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
      if (!res.ok) throw new Error(data.error || 'Lỗi server')

      setRedirecting(true)
      window.location.href = data.payUrl
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  // Loading Redirect Screen
  if (redirecting || autoLoading) {
    return (
      <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center p-4">
        <div className="text-center">
          <img src="/Main.png" alt="MoMo" className="w-16 h-16 mx-auto mb-6" />
          <div className="w-16 h-16 border-4 border-[#ae0070]/30 border-t-[#ae0070] rounded-full animate-spin mx-auto mb-6" />
          <p className="text-xl font-semibold">Đang chuyển hướng đến MoMo...</p>
          <p className="text-[#ae0070] font-bold text-2xl mt-3">{display} ₫</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Thanh toán MoMo · IPA</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/Main.png" />
      </Head>

      <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="orb orb-4" />
        </div>

        <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-white">
          {/* Header */}
          <div className="p-8 pb-6 border-b flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-2xl border flex items-center justify-center shadow">
              <img src="/Main.png" alt="MoMo" className="w-9 h-9" />
            </div>
            <div>
              <div className="text-2xl font-bold">MOMO</div>
              <div className="text-sm text-gray-500">Thanh toán IPA</div>
            </div>
          </div>

          <div className="p-8">
            {/* Amount Input */}
            <div className="mb-8">
              <label className="block uppercase text-xs font-bold tracking-widest text-gray-500 mb-3">SỐ TIỀN THANH TOÁN</label>
              <div className="flex items-center border-2 border-pink-200 focus-within:border-[#ae0070] rounded-2xl px-6 py-5 bg-white">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={display}
                  onChange={handleChange}
                  placeholder="0"
                  className="flex-1 text-5xl font-black outline-none bg-transparent"
                  autoFocus
                />
                <span className="text-4xl text-gray-400 font-bold">₫</span>
              </div>
            </div>

            {/* Suggestions */}
            <div className="grid grid-cols-4 gap-3 mb-8">
              {suggestions.map((v) => (
                <button
                  key={v}
                  onClick={() => setRawAmount(String(v))}
                  className={`py-3 text-sm font-bold rounded-2xl border transition-all ${
                    numVal === v
                      ? 'bg-[#ae0070] text-white border-[#ae0070]'
                      : 'bg-white border-gray-200 hover:border-pink-300'
                  }`}
                >
                  {v >= 1000000 ? `${v / 1000000}tr` : `${v / 1000}k`}
                </button>
              ))}
            </div>

            {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm">{error}</div>}

            <button
              onClick={handlePay}
              disabled={loading || numVal < MIN_AMOUNT}
              className="w-full py-5 bg-[#ae0070] hover:bg-[#8c005a] disabled:bg-gray-300 text-white font-bold text-lg rounded-2xl transition-all flex items-center justify-center gap-3"
            >
              {loading ? 'Đang tạo đơn...' : `Thanh toán ${display || ''} ₫`}
            </button>
          </div>

          {/* Security */}
          <div className="border-t p-6 text-center text-xs text-gray-500">
            <p className="mb-4 font-medium">BẢO MẬT CỔNG THANH TOÁN</p>
            <div className="grid grid-cols-2 gap-4">
              {SEC_BADGES.map((b) => (
                <div key={b.label} className="flex items-center gap-2 justify-center">
                  <svg className="w-4 h-4 text-[#ae0070]" viewBox="0 0 24 24" fill="currentColor">
                    <path d={b.icon} />
                  </svg>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.55;
          z-index: 0;
        }
        .orb-1 { top: -20%; left: -20%; width: 70vw; height: 70vw; background: #ff9cb7; animation: float1 7s infinite alternate; }
        .orb-2 { bottom: -20%; right: -20%; width: 80vw; height: 80vw; background: #b0d0ff; animation: float2 9s infinite alternate; }
        .orb-3 { top: 30%; right: -10%; width: 60vw; height: 60vw; background: #e0b0ff; animation: float1 8s infinite alternate; }
        .orb-4 { bottom: 10%; left: 10%; width: 55vw; height: 55vw; background: #80e0d0; animation: float2 6s infinite alternate; }

        @keyframes float1 { from { transform: translate(0, 0); } to { transform: translate(30px, 40px); } }
        @keyframes float2 { from { transform: translate(0, 0); } to { transform: translate(-40px, 30px); } }
      `}</style>
    </>
  )
}