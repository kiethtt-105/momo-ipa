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

  const displayAmt = form.amount
    ? parseInt(form.amount).toLocaleString('vi-VN')
    : ''

  return (
    <>
      <Head>
        <title>Cổng Thanh Toán MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/Main.png" type="image/png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --pink:       #d81b60;
          --pink-light: #f06292;
          --pink-pale:  #fce4ec;
          --pink-glow:  rgba(216,27,96,.18);
          --bg:         #0f0a0d;
          --surface:    #1a1117;
          --surface2:   #221520;
          --border:     rgba(216,27,96,.2);
          --border2:    rgba(255,255,255,.06);
          --text:       #f5eef2;
          --muted:      #9e7a8e;
          --success:    #4ade80;
        }

        body {
          font-family: 'Inter', sans-serif;
          background: var(--bg);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          color: var(--text);
        }

        /* ── Ambient glow ── */
        body::before {
          content: '';
          position: fixed;
          top: -200px; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(216,27,96,.15) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .wrap {
          width: 100%; max-width: 420px;
          position: relative; z-index: 1;
        }

        /* ── Brand bar ── */
        .brand {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 32px; padding: 0 2px;
        }
        .brand-mark {
          width: 40px; height: 40px;
          background: var(--pink);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 900; color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          box-shadow: 0 0 24px var(--pink-glow);
          flex-shrink: 0;
        }
        .brand-info {}
        .brand-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 16px; font-weight: 700;
          color: var(--text); letter-spacing: -.2px;
        }
        .brand-tag {
          font-size: 11px; color: var(--muted);
          letter-spacing: .3px; margin-top: 1px;
        }

        /* ── Card ── */
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 0 0 1px rgba(255,255,255,.03),
                      0 24px 48px rgba(0,0,0,.4);
        }

        /* ── Amount display ── */
        .amount-display {
          text-align: center;
          padding: 28px 0 24px;
          border-bottom: 1px solid var(--border2);
          margin-bottom: 24px;
        }
        .amount-label {
          font-size: 11px; font-weight: 600;
          color: var(--muted); text-transform: uppercase;
          letter-spacing: 1px; margin-bottom: 12px;
        }
        .amount-row {
          display: flex; align-items: baseline;
          justify-content: center; gap: 8px;
        }
        .amount-input {
          background: transparent; border: none; outline: none;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 48px; font-weight: 700;
          color: var(--text);
          text-align: right;
          width: auto; min-width: 60px; max-width: 260px;
          caret-color: var(--pink);
        }
        .amount-input::placeholder { color: var(--surface2); }
        .amount-currency {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 18px; font-weight: 600;
          color: var(--muted);
        }
        .amount-sub {
          font-size: 12px; color: var(--muted);
          margin-top: 8px; letter-spacing: .2px;
        }

        /* ── Quick amounts ── */
        .quick-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin-bottom: 24px;
        }
        .qa {
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 10px;
          padding: 10px 6px;
          text-align: center;
          font-size: 12px; font-weight: 600;
          color: var(--muted);
          cursor: pointer; transition: all .15s;
          font-family: 'Inter', sans-serif;
        }
        .qa:hover {
          border-color: var(--border);
          color: var(--pink-light);
          background: rgba(216,27,96,.06);
        }
        .qa.active {
          border-color: var(--pink);
          color: var(--pink);
          background: rgba(216,27,96,.1);
        }

        /* ── Field ── */
        .field { margin-bottom: 20px; }
        .field-label {
          font-size: 11px; font-weight: 600;
          color: var(--muted); text-transform: uppercase;
          letter-spacing: .8px; margin-bottom: 8px;
          display: block;
        }
        .field-input {
          width: 100%; padding: 12px 14px;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 12px;
          color: var(--text);
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          outline: none; transition: border .15s, box-shadow .15s;
        }
        .field-input:focus {
          border-color: rgba(216,27,96,.5);
          box-shadow: 0 0 0 3px rgba(216,27,96,.08);
        }
        .field-input::placeholder { color: var(--muted); opacity: .6; }

        /* ── Error ── */
        .error {
          display: flex; align-items: center; gap: 8px;
          background: rgba(239,68,68,.08);
          border: 1px solid rgba(239,68,68,.25);
          border-radius: 10px; padding: 10px 14px;
          color: #f87171; font-size: 13px; font-weight: 500;
          margin-bottom: 16px;
        }

        /* ── Pay button ── */
        .pay-btn {
          width: 100%; padding: 15px;
          border-radius: 14px; border: none;
          background: var(--pink);
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 16px; font-weight: 700;
          cursor: pointer; transition: all .2s;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          letter-spacing: .2px;
          box-shadow: 0 8px 24px rgba(216,27,96,.4);
          position: relative; overflow: hidden;
        }
        .pay-btn::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.12) 0%, transparent 50%);
          pointer-events: none;
        }
        .pay-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(216,27,96,.5);
        }
        .pay-btn:active:not(:disabled) { transform: translateY(0); }
        .pay-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }

        /* ── Footer note ── */
        .foot {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 18px; font-size: 11px; color: var(--muted);
        }
        .foot-dot {
          width: 3px; height: 3px; border-radius: 50%;
          background: var(--muted); opacity: .4;
        }

        /* ── Spinner ── */
        .spin {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: rot .6s linear infinite; flex-shrink: 0;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        @media(max-width:480px) {
          .card { padding: 20px; }
          .amount-input { font-size: 40px; }
        }
      `}</style>

      <div className="wrap">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div className="brand-info">
            <div className="brand-name">MoMo Payment</div>
            <div className="brand-tag">Cổng thanh toán bảo mật · IPA</div>
          </div>
        </div>

        <div className="card">
          {/* Amount */}
          <div className="amount-display">
            <div className="amount-label">Số tiền</div>
            <div className="amount-row">
              <input
                className="amount-input"
                type="text"
                inputMode="numeric"
                value={displayAmt}
                onChange={handleAmountChange}
                placeholder="0"
                size={displayAmt.length || 1}
                style={{ width: `${Math.max(displayAmt.length, 1) * 30}px` }}
              />
              <span className="amount-currency">₫</span>
            </div>
            {form.amount && (
              <div className="amount-sub">
                {parseInt(form.amount).toLocaleString('vi-VN')} đồng
              </div>
            )}
          </div>

          {/* Quick select */}
          <div className="quick-grid">
            {QUICK.map(v => (
              <button
                key={v}
                className={`qa ${parseInt(form.amount) === v ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, amount: String(v) }))}
              >
                {v >= 1000000
                  ? `${v / 1000000}M`
                  : `${v / 1000}K`}
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

          {error && (
            <div className="error">
              <span>⚠</span> {error}
            </div>
          )}

          <button className="pay-btn" onClick={handlePay} disabled={loading}>
            {loading ? (
              <><div className="spin" />Đang xử lý…</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4 1.41-1.41L11 13.17l6.59-6.59L19 8l-8 8z" fill="currentColor"/>
                </svg>
                Thanh toán {displayAmt || '0'} ₫
              </>
            )}
          </button>

          <div className="foot">
            <span>🔒 SSL</span>
            <span className="foot-dot" />
            <span>Bảo mật MoMo</span>
            <span className="foot-dot" />
            <span>Mã hóa đầu cuối</span>
          </div>
        </div>
      </div>
    </>
  )
}