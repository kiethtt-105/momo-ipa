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
          --mm: #ae0070;
          --mm-d: #920060;
          --mm-dd: #760050;
          --mm-light: #c4007e;
          --mm-soft: #fae8f2;
          --mm-border: #e8c4d8;
          --text: #180a12;
          --muted: #7a4060;
          --bg: #f7f0f4;
          --surface: #ffffff;
          --surface2: #fdf5f9;
        }

        html, body { height: 100%; }

        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: var(--bg);
          min-height: 100vh;
        }

        /* ── Full-screen two-column layout ── */
        .layout {
          display: grid;
          grid-template-columns: 1fr 480px;
          min-height: 100vh;
        }

        /* LEFT: brand panel */
        .brand-panel {
          background: linear-gradient(160deg, #ae0070 0%, #7a0052 55%, #500038 100%);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 48px 56px;
          position: relative;
          overflow: hidden;
        }

        .brand-panel::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(circle at 25% 30%, rgba(255,255,255,.07) 0%, transparent 60%),
                      radial-gradient(circle at 80% 80%, rgba(0,0,0,.15) 0%, transparent 50%);
        }

        .brand-panel::after {
          content: '';
          position: absolute;
          bottom: -120px; right: -120px;
          width: 480px; height: 480px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.07);
        }

        .brand-inner {
          position: relative; z-index: 1;
          max-width: 380px; width: 100%;
        }

        .brand-logo {
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 52px;
        }
        .logo-mark {
          width: 56px; height: 56px; border-radius: 18px;
          background: rgba(255,255,255,.15);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,.2);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .logo-name { font-size: 20px; font-weight: 900; color: #fff; }
        .logo-sub  { font-size: 11px; color: rgba(255,255,255,.6); margin-top: 2px; }

        .brand-headline {
          font-size: 38px; font-weight: 900; color: #fff;
          line-height: 1.18; letter-spacing: -.5px;
          margin-bottom: 16px;
        }
        .brand-headline em {
          font-style: normal;
          color: rgba(255,255,255,.5);
        }

        .brand-desc {
          font-size: 14px; color: rgba(255,255,255,.65);
          line-height: 1.7; margin-bottom: 44px;
        }

        .brand-features { display: flex; flex-direction: column; gap: 14px; }
        .feat {
          display: flex; align-items: center; gap: 14px;
        }
        .feat-icon {
          width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.12);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
        }
        .feat-text { font-size: 13px; color: rgba(255,255,255,.8); font-weight: 500; }
        .feat-text strong { color: #fff; font-weight: 800; display: block; font-size: 13px; }

        /* RIGHT: payment form */
        .form-panel {
          background: var(--surface);
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 48px 44px;
          border-left: 1px solid var(--mm-border);
          min-height: 100vh;
        }

        .form-top {
          margin-bottom: 32px;
        }
        .form-title { font-size: 22px; font-weight: 900; color: var(--text); margin-bottom: 4px; }
        .form-sub   { font-size: 13px; color: var(--muted); }

        /* Amount block */
        .amount-block {
          background: linear-gradient(135deg, #ae0070, #c4007e);
          border-radius: 16px;
          padding: 28px 28px 24px;
          margin-bottom: 28px;
          text-align: center;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(174,0,112,.3);
        }
        .amount-block::before {
          content: '';
          position: absolute; top: -40px; right: -40px;
          width: 160px; height: 160px; border-radius: 50%;
          background: rgba(255,255,255,.06);
        }
        .amt-label {
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,.65); text-transform: uppercase;
          letter-spacing: 1.6px; margin-bottom: 10px;
        }
        .amt-row {
          display: flex; align-items: baseline;
          justify-content: center; gap: 6px;
          position: relative;
        }
        .amt-input {
          background: transparent; border: none; outline: none;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 52px; font-weight: 900;
          color: #fff; text-align: right;
          min-width: 48px; max-width: 300px;
          caret-color: rgba(255,255,255,.8);
        }
        .amt-input::placeholder { color: rgba(255,255,255,.3); }
        .amt-unit {
          font-size: 22px; font-weight: 700;
          color: rgba(255,255,255,.7); padding-bottom: 8px;
        }
        .amt-sub {
          font-size: 12px; color: rgba(255,255,255,.55);
          margin-top: 6px;
        }

        /* Quick amounts */
        .quick-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin-bottom: 24px;
        }
        .qa {
          padding: 10px 6px; border-radius: 9px;
          border: 1.5px solid var(--mm-border);
          background: var(--surface2);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 13px; font-weight: 700;
          color: var(--muted); cursor: pointer;
          transition: all .14s; text-align: center;
        }
        .qa:hover { border-color: var(--mm); color: var(--mm); background: var(--mm-soft); }
        .qa:active { transform: scale(.96); }
        .qa.sel { border-color: var(--mm); background: var(--mm); color: #fff; box-shadow: 0 3px 10px rgba(174,0,112,.3); }

        /* Field */
        .field { margin-bottom: 20px; }
        .field-label {
          display: block;
          font-size: 11px; font-weight: 700;
          color: var(--muted); text-transform: uppercase;
          letter-spacing: .9px; margin-bottom: 8px;
        }
        .field-input {
          width: 100%; padding: 13px 16px;
          background: var(--surface2);
          border: 1.5px solid var(--mm-border);
          border-radius: 10px;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 14px; font-weight: 500;
          color: var(--text); outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .field-input::placeholder { color: var(--muted); opacity: .45; }
        .field-input:focus {
          border-color: var(--mm);
          box-shadow: 0 0 0 3px rgba(174,0,112,.1);
          background: #fff;
        }

        /* Error */
        .error {
          display: flex; align-items: center; gap: 9px;
          background: #fff0f4; border: 1.5px solid #ffaec9;
          border-radius: 9px; padding: 11px 14px;
          color: #c00055; font-size: 13px; font-weight: 600;
          margin-bottom: 16px;
          animation: shake .28s ease;
        }
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          25%      { transform: translateX(-5px) }
          75%      { transform: translateX(5px) }
        }

        /* Pay button */
        .pay-btn {
          width: 100%; padding: 16px;
          border-radius: 12px; border: none;
          background: linear-gradient(135deg, #ae0070, #c4007e);
          color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px; font-weight: 800;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: 0 6px 20px rgba(174,0,112,.38);
          transition: opacity .14s, transform .14s, box-shadow .14s;
        }
        .pay-btn:hover:not(:disabled) {
          opacity: .9;
          transform: translateY(-1px);
          box-shadow: 0 10px 26px rgba(174,0,112,.44);
        }
        .pay-btn:active:not(:disabled) { transform: scale(.99); }
        .pay-btn:disabled { opacity: .55; cursor: not-allowed; }

        /* Trust row */
        .trust-row {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 14px; font-size: 11px; color: var(--muted);
        }
        .trust-sep { color: var(--mm-border); }

        /* Spinner */
        .spin {
          width: 17px; height: 17px; flex-shrink: 0;
          border: 2.5px solid rgba(255,255,255,.3);
          border-top-color: #fff; border-radius: 50%;
          animation: rot .6s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        /* Mobile */
        @media (max-width: 860px) {
          .layout { grid-template-columns: 1fr; }
          .brand-panel { display: none; }
          .form-panel {
            padding: 36px 28px;
            border-left: none;
            justify-content: flex-start;
            padding-top: 48px;
          }
        }
        @media (max-width: 480px) {
          .form-panel { padding: 28px 20px; }
          .amt-input { font-size: 42px; }
        }
      `}</style>

      <div className="layout">
        {/* Brand panel */}
        <div className="brand-panel">
          <div className="brand-inner">
            <div className="brand-logo">
              <div className="logo-mark">
                <svg viewBox="0 0 30 30" fill="none" width="34" height="34">
                  <circle cx="9.5" cy="15" r="6" fill="white" />
                  <circle cx="20.5" cy="15" r="6" fill="white" />
                  <circle cx="9.5" cy="15" r="3" fill="#ae0070" />
                  <circle cx="20.5" cy="15" r="3" fill="#ae0070" />
                </svg>
              </div>
              <div>
                <div className="logo-name">MoMo</div>
                <div className="logo-sub">Cổng thanh toán</div>
              </div>
            </div>

            <div className="brand-headline">
              Thanh toán<br />
              <em>an toàn &</em><br />
              tức thì.
            </div>

            <p className="brand-desc">
              Được bảo vệ bởi công nghệ mã hóa SSL 256-bit và xác thực hai lớp. Giao dịch của bạn được xử lý trong vài giây.
            </p>

            <div className="brand-features">
              <div className="feat">
                <div className="feat-icon">🔒</div>
                <div className="feat-text">
                  <strong>Bảo mật tuyệt đối</strong>
                  Mã hóa SSL đầu cuối
                </div>
              </div>
              <div className="feat">
                <div className="feat-icon">⚡</div>
                <div className="feat-text">
                  <strong>Xử lý tức thì</strong>
                  Xác nhận trong dưới 5 giây
                </div>
              </div>
              <div className="feat">
                <div className="feat-icon">💳</div>
                <div className="feat-text">
                  <strong>Đa phương thức</strong>
                  Ví MoMo, ATM, Visa, QR
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="form-panel">
          <div className="form-top">
            <div className="form-title">Tạo giao dịch</div>
            <div className="form-sub">Nhập số tiền và nội dung thanh toán</div>
          </div>

          {/* Amount */}
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
                style={{ width: `${Math.max((displayAmt.length || 1) * 30, 48)}px` }}
              />
              <span className="amt-unit">₫</span>
            </div>
            {form.amount && parseInt(form.amount) > 0 && (
              <div className="amt-sub">{parseInt(form.amount).toLocaleString('vi-VN')} đồng</div>
            )}
          </div>

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
            <label className="field-label">Nội dung thanh toán</label>
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

          <div className="trust-row">
            <span>🔒 SSL 256-bit</span>
            <span className="trust-sep">·</span>
            <span>Bảo mật MoMo</span>
            <span className="trust-sep">·</span>
            <span>Mã hóa đầu cuối</span>
          </div>
        </div>
      </div>
    </>
  )
}
