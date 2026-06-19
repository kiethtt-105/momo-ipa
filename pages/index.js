import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'

// ─── Gợi ý nhanh mặc định ────────────────────────────────────
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

  // Redirecting / Auto-loading screen
  if (redirecting || autoLoading) {
    return (
      <>
        <Head>
          <title>Đang chuyển hướng…</title>
          <link rel="icon" type="image/png" href="/Main.png" />
        </Head>
        <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center overflow-hidden relative font-['Be_Vietnam_Pro',sans-serif]">
          <Orbs />
          <div className="relative z-10 bg-white/90 backdrop-blur-2xl border border-white/70 shadow-2xl rounded-3xl p-11 w-full max-w-[340px] text-center animate-[pop_0.25s_ease]">
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

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --mm: #ae0070;
    --text: #1a0413;
    --muted: #614655;
    --surface: rgba(255,255,255,0.88);
    --bg-input: rgba(240,232,236,0.6);
    --border: rgba(174,0,112,0.1);
    --font: 'Be Vietnam Pro', sans-serif;
  }
  html, body { height: 100%; width: 100%; font-family: var(--font); background: #f3e9ed; }
  .wrapper {
    position: relative; display: grid; place-content: center; justify-items: center;
    min-height: 100dvh; width: 100vw; padding: 20px 16px;
    overflow-y: auto; overflow-x: hidden;
  }
  .orb { position: absolute; border-radius: 50%; filter: blur(55px); opacity: 0.65; z-index: 0; pointer-events: none; }
  .orb-1 { top:-5%;left:-5%;width:50vw;height:50vw;background:#ff9cb7;animation:om1 5s infinite alternate ease-in-out; }
  .orb-2 { bottom:-5%;right:-5%;width:60vw;height:60vw;background:#b0bec5;animation:om2 7s infinite alternate ease-in-out; }
  .orb-3 { top:25%;right:-5%;width:45vw;height:45vw;background:#dfb2ea;animation:om3 6s infinite alternate ease-in-out; }
  .orb-4 { bottom:-5%;left:5%;width:40vw;height:40vw;background:#80cbc4;animation:om1 6.5s infinite alternate ease-in-out; }
  @keyframes om1 { 0%{transform:translate(0,0)scale(1)} 50%{transform:translate(8vw,4vh)scale(1.15)} 100%{transform:translate(-4vw,7vh)scale(0.9)} }
  @keyframes om2 { 0%{transform:translate(0,0)scale(1.1)} 50%{transform:translate(-10vw,-6vh)scale(0.9)} 100%{transform:translate(6vw,4vh)scale(1.1)} }
  @keyframes om3 { 0%{transform:translate(0,0)scale(0.9)} 50%{transform:translate(-5vw,7vh)scale(1.2)} 100%{transform:translate(7vw,-4vh)scale(1)} }
`

const FORM_CSS = `
  .card {
    position: relative; z-index: 2; width: 100%; max-width: 400px;
    background: var(--surface); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
    border-radius: 24px; border: 1px solid rgba(255,255,255,0.7);
    padding: 32px 28px;
    box-shadow: 0 25px 50px rgba(174,0,112,0.05);
  }
  .logo-row {
    display: flex; align-items: center; gap: 14px;
    margin-bottom: 28px; padding-bottom: 20px;
    border-bottom: 1px dashed var(--border);
  }
  .logo-mark {
    width: 48px; height: 48px; border-radius: 12px; background: #fff;
    border: 1px solid var(--border); display: flex; align-items: center;
    justify-content: center; flex-shrink: 0;
  }
  .logo-name { font-size: 18px; font-weight: 800; color: var(--text); }
  .logo-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }

  /* ── AMOUNT INPUT ── */
  .amt-wrap {
    background: var(--bg-input); border-radius: 16px;
    padding: 20px 22px 16px; margin-bottom: 16px;
    border: 1.5px solid var(--border); transition: all 0.2s;
  }
  .amt-wrap:focus-within { border-color: #f0bcd4; background: #fff; box-shadow: 0 0 0 4px rgba(174,0,112,0.07); }
  .amt-label { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; }
  .amt-row { display: flex; align-items: baseline; gap: 6px; }
  .amt-input {
    flex: 1; min-width: 0; background: transparent; border: none; outline: none;
    font-family: var(--font); font-weight: 900; color: var(--text);
    caret-color: var(--mm);
    /* ← font auto-shrink: clamp(28px, 8vw, 42px) */
    font-size: clamp(26px, 9vw, 42px);
    /* Không cho wrap, tự shrink */
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .amt-input::placeholder { color: #c4b0bb; font-weight: 700; }
  .amt-unit { font-size: 22px; font-weight: 800; color: #7a6070; flex-shrink: 0; }

  /* progress bar nhỏ */
  .amt-bar { height: 3px; background: rgba(174,0,112,0.08); border-radius: 99px; margin-top: 12px; overflow: hidden; }
  .amt-bar-fill { height: 100%; background: linear-gradient(90deg, #ae0070, #ff4fa3); border-radius: 99px; transition: width 0.3s ease; }

  /* ── QUICK SUGGESTIONS ── */
  .quick-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 8px; margin-bottom: 20px;
  }
  .qa {
    padding: 11px 4px; border-radius: 12px;
    border: 1.5px solid var(--border);
    background: rgba(255,255,255,0.7);
    font-family: var(--font); font-size: 13px; font-weight: 700;
    color: #495057; cursor: pointer; text-align: center;
    transition: all 0.15s; white-space: nowrap;
  }
  .qa:hover { border-color: var(--mm); color: var(--mm); background: #fff0f7; transform: translateY(-1px); }
  .qa.sel { background: var(--mm); border-color: var(--mm); color: #fff; box-shadow: 0 4px 12px rgba(174,0,112,0.2); }

  /* ── ERROR ── */
  .err {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 700; color: #dc2626;
    background: #fff1f1; border: 1px solid #fecaca;
    padding: 10px 14px; border-radius: 10px; margin-bottom: 16px;
  }

  /* ── PAY BUTTON ── */
  .btn {
    width: 100%; padding: 16px; border-radius: 14px; border: none;
    background: var(--mm); color: #fff;
    font-family: var(--font); font-size: 16px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px;
    box-shadow: 0 8px 24px rgba(174,0,112,0.2); transition: all 0.2s;
  }
  .btn:hover:not(:disabled) { background: #91005d; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(174,0,112,0.3); }
  .btn:disabled { background: #e2d7dc; color: #a89099; box-shadow: none; cursor: not-allowed; }
  .spin { width: 17px; height: 17px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: rot 0.6s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg) } }

  /* ── SECURITY FOOTER ── */
  .sec-footer { position: relative; z-index: 2; margin-top: 28px; width: 100%; max-width: 400px; }
  .sec-divider {
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1.5px; color: #8c7381; margin-bottom: 16px;
  }
  .sec-divider::before, .sec-divider::after { content: ''; width: 36px; border-bottom: 1px dashed rgba(174,0,112,0.25); margin: 0 10px; }
  .sec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
  .sec-item { display: flex; align-items: center; justify-content: center; gap: 7px; }
  .sec-icon { width: 15px; height: 15px; fill: var(--mm); opacity: 0.8; flex-shrink: 0; }
  .sec-label { font-size: 12px; font-weight: 700; color: #4a3240; }

  @media(max-width:480px) {
    .card { padding: 24px 18px; }
    .quick-grid { grid-template-columns: repeat(4,1fr); gap: 6px; }
    .qa { font-size: 12px; padding: 10px 2px; }
  }
`

const REDIRECT_CSS = `
  .redirect-card {
    position: relative; z-index: 2;
    background: rgba(255,255,255,0.9);
    backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
    border-radius: 24px; padding: 44px 36px;
    width: 100%; max-width: 340px;
    text-align: center;
    box-shadow: 0 24px 60px rgba(174,0,112,0.1);
    border: 1px solid rgba(255,255,255,0.8);
    animation: pop 0.25s ease;
  }
  @keyframes pop { from{transform:scale(0.94);opacity:0} to{transform:scale(1);opacity:1} }
  .rdr-logo { margin-bottom: 24px; }
  .rdr-spinner { margin: 0 auto 20px; width: 52px; height: 52px; }
  .rdr-circle {
    width: 52px; height: 52px;
    animation: rot 1s linear infinite;
    stroke: var(--mm); stroke-linecap: round;
    stroke-dasharray: 90; stroke-dashoffset: 30;
  }
  .rdr-title { font-size: 20px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
  .rdr-sub { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
  .rdr-amount {
    display: inline-block; padding: 10px 20px;
    background: #fff0f7; border-radius: 12px;
    font-size: 22px; font-weight: 900; color: var(--mm);
  }
  @keyframes rot { to { transform: rotate(360deg) } }
`
