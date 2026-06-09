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
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --pink:        #d81b60;
          --pink-hover:  #c01755;
          --pink-active: #ad134c;
          --pink-soft:   #fce4ec;
          --pink-mid:    #f48fb1;
          --pink-pale:   #fdf5f8;
          --pink-border: #f8bbd0;
          --text:        #1a0a10;
          --text2:       #5a2a3a;
          --muted:       #b06080;
          --bg:          #fff8fb;
          --surface:     #ffffff;
          --surface2:    #fdf0f5;
          --radius-lg:   20px;
          --radius-md:   14px;
          --radius-sm:   10px;
          --shadow:      0 8px 32px rgba(216,27,96,.12), 0 2px 8px rgba(216,27,96,.06);
        }

        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: var(--bg);
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px;
        }

        /* subtle top gradient */
        body::before {
          content: '';
          position: fixed; top: 0; left: 0; right: 0;
          height: 260px;
          background: linear-gradient(180deg, #fce4ec 0%, transparent 100%);
          pointer-events: none; z-index: 0;
        }

        .wrap {
          width: 100%; max-width: 420px;
          position: relative; z-index: 1;
        }

        /* ── Brand ── */
        .brand {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 24px; padding: 0 4px;
        }
        .brand-mark {
          width: 44px; height: 44px; border-radius: 14px;
          background: var(--pink);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 900; color: #fff;
          box-shadow: 0 4px 16px rgba(216,27,96,.35);
          transition: transform .2s, box-shadow .2s;
          flex-shrink: 0; cursor: default;
        }
        .brand-mark:hover {
          transform: scale(1.06);
          box-shadow: 0 6px 22px rgba(216,27,96,.45);
        }
        .brand-name  { font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -.3px; }
        .brand-sub   { font-size: 11px; color: var(--muted); margin-top: 1px; letter-spacing: .2px; }

        /* ── Card ── */
        .card {
          background: var(--surface);
          border: 1.5px solid var(--pink-border);
          border-radius: var(--radius-lg);
          padding: 30px 28px;
          box-shadow: var(--shadow);
          transition: box-shadow .3s;
        }
        .card:hover {
          box-shadow: 0 12px 40px rgba(216,27,96,.15), 0 2px 8px rgba(216,27,96,.07);
        }

        /* ── Amount block ── */
        .amount-block {
          background: var(--surface2);
          border: 1.5px solid var(--pink-border);
          border-radius: var(--radius-md);
          padding: 22px 20px 18px;
          margin-bottom: 20px;
          text-align: center;
          transition: border-color .2s, box-shadow .2s;
        }
        .amount-block:focus-within {
          border-color: var(--pink);
          box-shadow: 0 0 0 3px rgba(216,27,96,.1);
        }
        .amt-label {
          font-size: 10px; font-weight: 700;
          color: var(--muted); text-transform: uppercase;
          letter-spacing: 1.2px; margin-bottom: 10px;
        }
        .amt-row {
          display: flex; align-items: baseline;
          justify-content: center; gap: 6px;
        }
        .amt-input {
          background: transparent; border: none; outline: none;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 44px; font-weight: 900;
          color: var(--pink); text-align: right;
          min-width: 40px; max-width: 270px;
          caret-color: var(--pink);
          transition: color .2s;
        }
        .amt-input::placeholder { color: #f8bbd0; }
        .amt-unit {
          font-size: 18px; font-weight: 700;
          color: var(--muted); padding-bottom: 4px;
        }
        .amt-sub {
          font-size: 12px; color: var(--muted);
          margin-top: 6px; letter-spacing: .1px;
        }

        /* ── Quick amounts ── */
        .quick-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin-bottom: 22px;
        }
        .qa {
          padding: 9px 6px; border-radius: var(--radius-sm);
          border: 1.5px solid var(--pink-border);
          background: var(--surface);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 13px; font-weight: 700;
          color: var(--muted); cursor: pointer;
          transition: all .15s ease;
          text-align: center;
          position: relative; overflow: hidden;
        }
        .qa::after {
          content: '';
          position: absolute; inset: 0;
          background: var(--pink);
          opacity: 0; transition: opacity .15s;
        }
        .qa:hover {
          border-color: var(--pink);
          color: var(--pink);
          background: var(--pink-soft);
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(216,27,96,.15);
        }
        .qa:active { transform: translateY(0) scale(.97); }
        .qa.sel {
          border-color: var(--pink);
          background: var(--pink);
          color: #fff;
          box-shadow: 0 4px 14px rgba(216,27,96,.35);
        }
        .qa.sel:hover { background: var(--pink-hover); border-color: var(--pink-hover); }

        /* ── Field ── */
        .field { margin-bottom: 20px; }
        .field-label {
          display: block;
          font-size: 11px; font-weight: 700;
          color: var(--muted); text-transform: uppercase;
          letter-spacing: .9px; margin-bottom: 8px;
        }
        .field-input {
          width: 100%; padding: 12px 14px;
          background: var(--surface2);
          border: 1.5px solid var(--pink-border);
          border-radius: var(--radius-md);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 14px; font-weight: 500;
          color: var(--text); outline: none;
          transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .field-input::placeholder { color: var(--muted); opacity: .6; }
        .field-input:hover { border-color: var(--pink-mid); }
        .field-input:focus {
          border-color: var(--pink);
          box-shadow: 0 0 0 3px rgba(216,27,96,.1);
          background: #fff;
        }

        /* ── Divider ── */
        .divider {
          border: none; border-top: 1.5px solid var(--pink-border);
          margin: 22px 0;
          background: none;
        }

        /* ── Error ── */
        .error {
          display: flex; align-items: center; gap: 8px;
          background: #fff5f5;
          border: 1.5px solid #fca5a5;
          border-radius: var(--radius-sm);
          padding: 10px 14px;
          color: #dc2626; font-size: 13px; font-weight: 600;
          margin-bottom: 16px;
          animation: shake .3s ease;
        }
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          25%      { transform: translateX(-6px) }
          75%      { transform: translateX(6px) }
        }

        /* ── Pay button ── */
        .pay-btn {
          width: 100%; padding: 15px;
          border-radius: var(--radius-md); border: none;
          background: var(--pink); color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px; font-weight: 800;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          letter-spacing: .1px;
          box-shadow: 0 6px 20px rgba(216,27,96,.4);
          transition: background .15s, transform .15s, box-shadow .15s;
          position: relative; overflow: hidden;
        }
        /* shimmer highlight */
        .pay-btn::before {
          content: '';
          position: absolute; top: 0; left: -100%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent);
          transition: left .5s ease;
        }
        .pay-btn:hover:not(:disabled)::before { left: 150%; }
        .pay-btn:hover:not(:disabled) {
          background: var(--pink-hover);
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(216,27,96,.45);
        }
        .pay-btn:active:not(:disabled) {
          background: var(--pink-active);
          transform: translateY(0) scale(.99);
          box-shadow: 0 4px 12px rgba(216,27,96,.3);
        }
        .pay-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }

        /* ── Footer ── */
        .foot {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 16px; font-size: 11px; color: var(--muted);
        }
        .foot-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--pink-mid); }

        /* ── Spinner ── */
        .spin {
          width: 18px; height: 18px; flex-shrink: 0;
          border: 2.5px solid rgba(255,255,255,.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: rot .6s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        @media(max-width:480px) {
          .card { padding: 22px 18px; }
          .amt-input { font-size: 36px; }
        }
      `}</style>

      <div className="wrap">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">MoMo Payment</div>
            <div className="brand-sub">Cổng thanh toán bảo mật · IPA</div>
          </div>
        </div>

        <div className="card">
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
                style={{ width: `${Math.max((displayAmt.length || 1) * 28, 44)}px` }}
              />
              <span className="amt-unit">₫</span>
            </div>
            {form.amount && parseInt(form.amount) > 0 && (
              <div className="amt-sub">{parseInt(form.amount).toLocaleString('vi-VN')} đồng</div>
            )}
          </div>

          {/* Quick */}
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