import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'

// ─── Gợi ý nhanh mặc định ────────────────────────────────────
const DEFAULT_SUGGESTIONS = [10000, 50000, 100000, 200000]
const MAX_AMOUNT = 50_000_000
const MIN_AMOUNT = 1_000

// ─── Format hiển thị (không có dấu thập phân) ─────────────────
const fmtDisplay = n => n ? parseInt(n).toLocaleString('vi-VN') : ''

export default function Home() {
  const [rawAmount, setRawAmount] = useState('') // số thô, không format
  const [loading,   setLoading]   = useState(false)
  const [redirecting, setRedirecting] = useState(false) // ẩn form khi đang redirect
  const [error,     setError]     = useState('')
  const inputRef = useRef(null)

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
    if (numVal < MIN_AMOUNT) return setError('Tối thiểu 1.000 ₫')
    if (numVal > MAX_AMOUNT) return setError('Tối đa 50.000.000 ₫')

    setLoading(true)
    setError('')

    try {
      const orderId = `${Date.now()}`
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
  if (redirecting) {
    return (
      <>
        <Head>
          <title>Đang chuyển hướng…</title>
          <link rel="icon" type="image/png" href="/Main.png" />
          <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        </Head>
        <style>{BASE_CSS + REDIRECT_CSS}</style>
        <div className="wrapper">
          <Orbs />
          <div className="redirect-card">
            <div className="rdr-logo">
              <img src="/Main.png" alt="MoMo" width={40} height={40} style={{ borderRadius: 10, objectFit: 'contain' }} />
            </div>
            <div className="rdr-spinner">
              <svg className="rdr-circle" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" />
              </svg>
            </div>
            <div className="rdr-title">Đang mở MoMo…</div>
            <div className="rdr-sub">Vui lòng đợi, đang chuyển hướng</div>
            <div className="rdr-amount">{fmtDisplay(rawAmount)} ₫</div>
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
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{BASE_CSS + FORM_CSS}</style>

      <div className="wrapper">
        <Orbs />

        <div className="card">
          {/* Logo */}
          <div className="logo-row">
            <div className="logo-mark">
              <img src="/Main.png" alt="Logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain' }} />
            </div>
            <div>
              <div className="logo-name">MOMO</div>
              <div className="logo-sub">Thanh toán IPA</div>
            </div>
          </div>

          {/* Amount input */}
          <div className="amt-wrap">
            <div className="amt-label">Số tiền thanh toán</div>
            <div className="amt-row">
              <input
                ref={inputRef}
                className="amt-input"
                type="text"
                inputMode="numeric"
                value={display}           // ← hiển thị formatted
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="0"
                autoFocus
              />
              <span className="amt-unit">₫</span>
            </div>

            {/* Range bar visual */}
            {numVal > 0 && (
              <div className="amt-bar">
                <div
                  className="amt-bar-fill"
                  style={{ width: `${Math.min(numVal / MAX_AMOUNT * 100, 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Quick suggestions */}
          <div className="quick-grid">
            {suggestions.map(v => (
              <button
                key={v}
                className={`qa ${numVal === v ? 'sel' : ''}`}
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
            <div className="err">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          {/* Pay button */}
          <button
            className="btn"
            onClick={handlePay}
            disabled={loading || !rawAmount || numVal < MIN_AMOUNT}
          >
            {loading ? (
              <><div className="spin" /> Đang tạo đơn hàng…</>
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
        <div className="sec-footer">
          <div className="sec-divider">Bảo mật cổng thanh toán</div>
          <div className="sec-grid">
            {SEC_BADGES.map(b => (
              <div key={b.label} className="sec-item">
                <svg className="sec-icon" viewBox="0 0 24 24"><path d={b.icon} /></svg>
                <span className="sec-label">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Orbs() {
  return <>
    <div className="orb orb-1" /><div className="orb orb-2" />
    <div className="orb orb-3" /><div className="orb orb-4" />
  </>
}

const SEC_BADGES = [
  { label: 'PCI DSS',       icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 1.9v2.6c0 .3-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5v-2.6c-.6-.4-1-1.1-1-1.9 0-1.4 1.1-2.5 2.5-2.5z' },
  { label: 'Mã hóa P2P',    icon: 'M12.65 10C11.83 7.59 9.57 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.57 0 4.83-1.59 5.65-4H17v3h3v-3h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  { label: 'SHA-256',        icon: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' },
  { label: 'MoMo Verified',  icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
]

// ─── CSS ─────────────────────────────────────────────────────
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
