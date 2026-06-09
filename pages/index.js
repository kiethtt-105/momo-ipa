import { useState } from 'react'
import Head from 'next/head'

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

  return (
    <>
      <Head>
        <title>Thanh toán MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #ae0070;
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
        }

        .card {
          background: #fff;
          border-radius: 20px;
          padding: 40px 36px 36px;
          width: 100%;
          max-width: 360px;
          box-shadow: 0 24px 64px rgba(0,0,0,.22);
        }

        /* logo */
        .logo {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 32px;
        }
        .logo-mark {
          width: 40px; height: 40px; border-radius: 12px;
          background: #ae0070;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .logo-name { font-size: 16px; font-weight: 900; color: #180a12; }
        .logo-sub  { font-size: 11px; color: #a06080; margin-top: 1px; }

        /* amount */
        .amt-label {
          font-size: 10px; font-weight: 700; color: #a06080;
          text-transform: uppercase; letter-spacing: 1.2px;
          margin-bottom: 10px;
        }
        .amt-row {
          display: flex; align-items: baseline; gap: 6px;
          border-bottom: 2px solid #f0e0ea;
          padding-bottom: 10px;
          margin-bottom: 6px;
          transition: border-color .15s;
        }
        .amt-row:focus-within { border-color: #ae0070; }
        .amt-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 44px; font-weight: 900;
          color: #180a12;
          min-width: 0;
        }
        .amt-input::placeholder { color: #ddc0cc; }
        .amt-unit {
          font-size: 18px; font-weight: 700;
          color: #a06080; padding-bottom: 6px; flex-shrink: 0;
        }
        .amt-hint {
          font-size: 12px; color: #c090a8;
          margin-bottom: 28px; min-height: 18px;
        }

        /* error */
        .err {
          font-size: 12px; font-weight: 700;
          color: #dc2626; margin-bottom: 16px;
        }

        /* button */
        .btn {
          width: 100%; padding: 16px;
          border-radius: 12px; border: none;
          background: #ae0070; color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px; font-weight: 800;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: 0 6px 20px rgba(174,0,112,.35);
          transition: opacity .14s, transform .14s;
        }
        .btn:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
        .btn:active:not(:disabled) { transform: scale(.99); }
        .btn:disabled { opacity: .5; cursor: not-allowed; }

        .spin {
          width: 16px; height: 16px;
          border: 2.5px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: rot .6s linear infinite;
          flex-shrink: 0;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        @media (max-width: 420px) {
          .card { padding: 32px 24px 28px; border-radius: 0; max-width: 100%; min-height: 100vh; }
          body { align-items: flex-start; }
          .amt-input { font-size: 38px; }
        }
      `}</style>

      <div className="card">
        <div className="logo">
          <div className="logo-mark">
            <svg viewBox="0 0 30 30" fill="none" width="26" height="26">
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

        <div className="amt-label">Số tiền</div>
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
          {amount && !error ? `${parseInt(amount).toLocaleString('vi-VN')} đồng` : ''}
        </div>

        {error && <div className="err">⚠ {error}</div>}

        <button className="btn" onClick={handlePay} disabled={loading || !amount}>
          {loading
            ? <><div className="spin" /> Đang xử lý…</>
            : `Thanh toán${display ? ` ${display} ₫` : ''}`
          }
        </button>
      </div>
    </>
  )
}
