import { useState } from 'react'
import Head from 'next/head'

const QUICK = [10000, 20000, 50000, 100000, 200000, 500000]

export default function Home() {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAmountChange = e => {
    setError('')
    setAmount(e.target.value.replace(/\D/g, ''))
  }

  const handlePay = async () => {
    const amt = parseInt(amount)
    if (isNaN(amt) || amt < 1000) return setError('Tối thiểu 1.000 ₫')
    if (amt > 50_000_000) return setError('Tối đa 50.000.000 ₫')
    setLoading(true)
    try {
      const orderId = `${Date.now()}`
      const res = await fetch('/api/momo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount: amt, orderInfo: `Thanh toán ${orderId}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định')
      window.location.href = data.payUrl
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const display = amount ? parseInt(amount).toLocaleString('vi-VN') : ''
  const numVal = parseInt(amount) || 0

  return (
    <>
      <Head>
        <title>Thanh toán MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          min-height: 100vh;
          background: linear-gradient(135deg, #c2006e 0%, #8b0050 40%, #5c003a 100%);
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px;
        }

        /* Ambient blobs */
        body::before {
          content: '';
          position: fixed; top: -120px; left: -120px;
          width: 500px; height: 500px; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,100,180,.18) 0%, transparent 70%);
          pointer-events: none;
        }
        body::after {
          content: '';
          position: fixed; bottom: -100px; right: -100px;
          width: 420px; height: 420px; border-radius: 50%;
          background: radial-gradient(circle, rgba(80,0,120,.3) 0%, transparent 70%);
          pointer-events: none;
        }

        .card {
          position: relative; z-index: 1;
          width: 100%; max-width: 380px;
          background: rgba(255,255,255,.08);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.18);
          padding: 32px 28px 28px;
          box-shadow:
            0 32px 80px rgba(0,0,0,.35),
            inset 0 1px 0 rgba(255,255,255,.2);
          overflow: hidden;
        }

        /* shimmer top edge */
        .card::before {
          content: '';
          position: absolute; top: 0; left: 10%; right: 10%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent);
        }

        /* Logo */
        .logo {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 28px;
        }
        .logo-mark {
          width: 44px; height: 44px; border-radius: 14px;
          background: linear-gradient(135deg, rgba(255,255,255,.25), rgba(255,255,255,.08));
          border: 1px solid rgba(255,255,255,.25);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 16px rgba(0,0,0,.2);
        }
        .logo-name { font-size: 17px; font-weight: 900; color: #fff; }
        .logo-sub  { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 1px; }

        /* Amount area */
        .amt-wrap {
          background: rgba(0,0,0,.18);
          border-radius: 20px;
          padding: 24px 22px 20px;
          margin-bottom: 16px;
          border: 1px solid rgba(255,255,255,.08);
          position: relative;
          overflow: hidden;
        }
        .amt-wrap::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.15), transparent);
        }
        .amt-label {
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,.45);
          text-transform: uppercase; letter-spacing: 1.8px;
          margin-bottom: 10px;
        }
        .amt-row {
          display: flex; align-items: baseline; gap: 8px;
        }
        .amt-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 48px; font-weight: 900;
          color: #fff; min-width: 0;
          caret-color: rgba(255,255,255,.8);
        }
        .amt-input::placeholder { color: rgba(255,255,255,.2); }
        .amt-unit {
          font-size: 20px; font-weight: 700;
          color: rgba(255,255,255,.45); padding-bottom: 8px;
        }
        .amt-hint {
          font-size: 12px; color: rgba(255,255,255,.4);
          margin-top: 6px; min-height: 16px;
        }

        /* Quick grid */
        .quick-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin-bottom: 20px;
        }
        .qa {
          padding: 10px 4px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.07);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 13px; font-weight: 700;
          color: rgba(255,255,255,.7);
          cursor: pointer; text-align: center;
          transition: all .15s;
          backdrop-filter: blur(4px);
        }
        .qa:hover {
          background: rgba(255,255,255,.15);
          border-color: rgba(255,255,255,.3);
          color: #fff;
          transform: translateY(-1px);
        }
        .qa:active { transform: scale(.96); }
        .qa.sel {
          background: rgba(255,255,255,.22);
          border-color: rgba(255,255,255,.5);
          color: #fff;
          box-shadow: 0 0 0 1px rgba(255,255,255,.25), 0 4px 14px rgba(0,0,0,.2);
        }

        /* Error */
        .err {
          font-size: 12px; font-weight: 700;
          color: #ffb3d0;
          margin-bottom: 14px;
          display: flex; align-items: center; gap: 6px;
        }

        /* Pay button */
        .btn {
          width: 100%; padding: 17px;
          border-radius: 16px; border: none;
          background: linear-gradient(135deg, #fff 0%, #f0d0e8 100%);
          color: #9a005a;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px; font-weight: 900;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: 0 8px 28px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.8);
          transition: all .15s;
          letter-spacing: -.1px;
        }
        .btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 14px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.8);
        }
        .btn:active:not(:disabled) { transform: scale(.99); }
        .btn:disabled {
          background: rgba(255,255,255,.15);
          color: rgba(255,255,255,.35);
          box-shadow: none; cursor: not-allowed;
        }

        .spin {
          width: 17px; height: 17px;
          border: 2.5px solid rgba(154,0,90,.25);
          border-top-color: #9a005a;
          border-radius: 50%;
          animation: rot .6s linear infinite;
          flex-shrink: 0;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        @media (max-width: 420px) {
          .card { border-radius: 24px; padding: 28px 20px 24px; }
          .amt-input { font-size: 40px; }
        }
      `}</style>

      <div className="card">
        <div className="logo">
          <div className="logo-mark">
            <svg viewBox="0 0 30 30" fill="none" width="28" height="28">
              <circle cx="9.5" cy="15" r="6" fill="white"/>
              <circle cx="20.5" cy="15" r="6" fill="white"/>
              <circle cx="9.5" cy="15" r="3" fill="#ae0070"/>
              <circle cx="20.5" cy="15" r="3" fill="#ae0070"/>
            </svg>
          </div>
          <div>
            <div className="logo-name">MoMo</div>
            <div className="logo-sub">Cổng thanh toán</div>
          </div>
        </div>

        <div className="amt-wrap">
          <div className="amt-label">Số tiền thanh toán</div>
          <div className="amt-row">
            <input
              className="amt-input"
              type="text"
              inputMode="numeric"
              value={display}
              onChange={handleAmountChange}
              placeholder="0"
              autoFocus
            />
            <span className="amt-unit">₫</span>
          </div>
          <div className="amt-hint">
            {numVal >= 1000 ? `${numVal.toLocaleString('vi-VN')} đồng` : '\u00a0'}
          </div>
        </div>

        <div className="quick-grid">
          {QUICK.map(v => (
            <button
              key={v}
              className={`qa ${numVal === v ? 'sel' : ''}`}
              onClick={() => { setError(''); setAmount(String(v)) }}
            >
              {v >= 1000000 ? `${v/1000000}M` : `${v/1000}K`}
            </button>
          ))}
        </div>

        {error && <div className="err">⚠ {error}</div>}

        <button className="btn" onClick={handlePay} disabled={loading || !amount}>
          {loading ? (
            <><div className="spin" />Đang xử lý…</>
          ) : (
            `Thanh toán${display ? ' ' + display + ' ₫' : ''}`
          )}
        </button>
      </div>
    </>
  )
}
