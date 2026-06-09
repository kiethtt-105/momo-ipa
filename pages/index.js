import { useState } from 'react'
import Head from 'next/head'

const QUICK = [10000, 20000, 50000, 100000, 200000, 500000]

export default function Home() {
  const [form, setForm] = useState({
    orderInfo: `Thanh Toán ${Date.now()}`,
    amount: '50000',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleAmountChange = e => {
    const raw = e.target.value.replace(/\D/g, '')
    setForm(f => ({ ...f, amount: raw }))
  }

  const handlePay = async () => {
    setError('')
    const amt = parseInt(form.amount)
    if (!form.orderInfo.trim()) return setError('Vui lòng nhập nội dung thanh toán')
    if (isNaN(amt) || amt < 1000) return setError('Số tiền tối thiểu 1.000 VND')
    if (amt > 50_000_000) return setError('Số tiền tối đa 50.000.000 VND')
    setLoading(true)
    try {
      const orderId = `${Date.now()}`
      const res = await fetch('/api/momo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount: amt, orderInfo: form.orderInfo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định')
      window.location.href = data.payUrl
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const displayAmt = form.amount ? parseInt(form.amount).toLocaleString('vi-VN') : ''

  return (
    <>
      <Head>
        <title>Cổng Thanh Toán MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/Main.png" type="image/png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --mm: #a50064;
          --mm-d: #8a0054;
          --mm-dd: #6e0043;
          --mm-soft: #f9eaf4;
          --mm-border: #e8c4d8;
          --mm-pale: #fdf5fa;
          --text: #1a0a10;
          --muted: #7a4060;
          --bg: #f5f0f3;
          --surface: #ffffff;
          --surface2: #fdf0f8;
          --radius-lg: 16px;
          --radius-md: 10px;
          --shadow: 0 2px 16px rgba(165,0,100,.10);
        }

        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: var(--bg);
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 32px 16px;
        }

        .wrap { width: 100%; max-width: 440px; }

        /* ── Header ── */
        .header {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 20px; padding: 0 2px;
        }
        .mm-logo-mark {
          width: 48px; height: 48px; border-radius: 14px;
          background: var(--mm); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 14px rgba(165,0,100,.35);
        }
        .mm-logo-mark svg { width: 30px; height: 30px; }
        .header-text .ht-name { font-size: 17px; font-weight: 800; color: var(--text); }
        .header-text .ht-sub  { font-size: 11px; color: var(--muted); margin-top: 1px; }

        /* ── Card ── */
        .card {
          background: var(--surface);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow);
          overflow: hidden;
        }

        /* ── Amount block ── */
        .amount-block {
          background: var(--mm);
          padding: 28px 24px 24px;
          text-align: center;
        }
        .amt-label {
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,.7); text-transform: uppercase;
          letter-spacing: 1.4px; margin-bottom: 12px;
        }
        .amt-row {
          display: flex; align-items: baseline;
          justify-content: center; gap: 6px;
        }
        .amt-input {
          background: transparent; border: none; outline: none;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 48px; font-weight: 900;
          color: #fff; text-align: right;
          min-width: 44px; max-width: 280px;
          caret-color: rgba(255,255,255,.8);
        }
        .amt-input::placeholder { color: rgba(255,255,255,.35); }
        .amt-unit {
          font-size: 20px; font-weight: 700;
          color: rgba(255,255,255,.75); padding-bottom: 6px;
        }
        .amt-sub {
          font-size: 12px; color: rgba(255,255,255,.6);
          margin-top: 6px;
        }

        /* ── Body ── */
        .card-body { padding: 22px 22px 24px; }

        /* ── Quick amounts ── */
        .quick-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin-bottom: 22px;
        }
        .qa {
          padding: 10px 6px; border-radius: 8px;
          border: 1.5px solid var(--mm-border);
          background: var(--surface);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 13px; font-weight: 700;
          color: var(--muted); cursor: pointer;
          transition: all .14s ease; text-align: center;
        }
        .qa:hover {
          border-color: var(--mm);
          color: var(--mm);
          background: var(--mm-soft);
        }
        .qa:active { transform: scale(.96); }
        .qa.sel {
          border-color: var(--mm);
          background: var(--mm);
          color: #fff;
        }

        /* ── Field ── */
        .field { margin-bottom: 18px; }
        .field-label {
          display: block;
          font-size: 11px; font-weight: 700;
          color: var(--muted); text-transform: uppercase;
          letter-spacing: .8px; margin-bottom: 7px;
        }
        .field-input {
          width: 100%; padding: 12px 14px;
          background: var(--surface2);
          border: 1.5px solid var(--mm-border);
          border-radius: var(--radius-md);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 14px; font-weight: 500;
          color: var(--text); outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .field-input::placeholder { color: var(--muted); opacity: .5; }
        .field-input:focus {
          border-color: var(--mm);
          box-shadow: 0 0 0 3px rgba(165,0,100,.1);
          background: #fff;
        }

        /* ── Divider ── */
        .divider { border: none; border-top: 1px solid var(--mm-border); margin: 18px 0; }

        /* ── Error ── */
        .error {
          display: flex; align-items: center; gap: 8px;
          background: #fff0f0; border: 1.5px solid #ffb3b3;
          border-radius: 8px; padding: 10px 14px;
          color: #c00; font-size: 13px; font-weight: 600;
          margin-bottom: 14px;
          animation: shake .28s ease;
        }
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          25%      { transform: translateX(-5px) }
          75%      { transform: translateX(5px) }
        }

        /* ── Pay button ── */
        .pay-btn {
          width: 100%; padding: 15px;
          border-radius: var(--radius-md); border: none;
          background: var(--mm); color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px; font-weight: 800;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: 0 4px 16px rgba(165,0,100,.35);
          transition: background .14s, transform .14s, box-shadow .14s;
        }
        .pay-btn:hover:not(:disabled) {
          background: var(--mm-d);
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(165,0,100,.4);
        }
        .pay-btn:active:not(:disabled) {
          background: var(--mm-dd);
          transform: scale(.99);
        }
        .pay-btn:disabled { opacity: .6; cursor: not-allowed; }

        /* ── Footer ── */
        .foot {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 14px; font-size: 11px; color: var(--muted);
        }
        .foot-sep { color: var(--mm-border); }

        /* ── Spinner ── */
        .spin {
          width: 17px; height: 17px; flex-shrink: 0;
          border: 2.5px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: rot .6s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        @media(max-width:480px) {
          .card-body { padding: 18px 16px 20px; }
          .amt-input { font-size: 38px; }
        }
      `}</style>

      <div className="wrap">
        <div className="header">
          <div className="mm-logo-mark">
            <svg viewBox="0 0 30 30" fill="none">
              <circle cx="9.5" cy="15" r="6" fill="white" />
              <circle cx="20.5" cy="15" r="6" fill="white" />
              <circle cx="9.5" cy="15" r="3" fill="#a50064" />
              <circle cx="20.5" cy="15" r="3" fill="#a50064" />
            </svg>
          </div>
          <div className="header-text">
            <div className="ht-name">Cổng thanh toán MoMo</div>
            <div className="ht-sub">Bảo mật · Nhanh chóng · Tiện lợi</div>
          </div>
        </div>

        <div className="card">
          {/* Amount header */}
          <div className="amount-block">
            <div className="amt-label">Số tiền thanh toán</div>
            <div className="amt-row">
              <input
                className="amt-input"
                type="text"
                inputMode="numeric"
                value={displayAmt}
                onChange={handleAmountChange}
                placeholder="0"
                style={{ width: `${Math.max((displayAmt.length || 1) * 28, 44)}px` }}
              />
              <span className="amt-unit">₫</span>
            </div>
            {form.amount && parseInt(form.amount) > 0 && (
              <div className="amt-sub">{parseInt(form.amount).toLocaleString('vi-VN')} đồng</div>
            )}
          </div>

          <div className="card-body">
            {/* Quick amounts */}
            <div className="quick-grid">
              {QUICK.map(v => (
                <button
                  key={v}
                  className={`qa ${parseInt(form.amount) === v ? 'sel' : ''}`}
                  onClick={() => setForm(f => ({ ...f, amount: String(v) }))}
                >
                  {v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}K`}
                </button>
              ))}
            </div>

            {/* Order info */}
            <div className="field">
              <label className="field-label">Nội dung</label>
              <input
                className="field-input"
                type="text"
                name="orderInfo"
                value={form.orderInfo}
                onChange={handleChange}
                placeholder="VD: Thanh toán đơn hàng #12345"
                maxLength={255}
              />
            </div>

            <hr className="divider" />

            {error && <div className="error"><span>⚠</span> {error}</div>}

            <button className="pay-btn" onClick={handlePay} disabled={loading}>
              {loading ? (
                <><div className="spin" /> Đang xử lý…</>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="6" width="20" height="13" rx="2.5" stroke="#fff" strokeWidth="2"/>
                    <path d="M2 10h20" stroke="#fff" strokeWidth="2"/>
                    <path d="M6 15h4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Thanh toán {displayAmt || '0'} ₫
                </>
              )}
            </button>

            <div className="foot">
              <span>🔒 SSL</span>
              <span className="foot-sep">·</span>
              <span>Bảo mật MoMo</span>
              <span className="foot-sep">·</span>
              <span>Mã hóa đầu cuối</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}