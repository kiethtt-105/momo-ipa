import { useState } from 'react'
import Head from 'next/head'

export default function Home() {
  const [form, setForm] = useState({
    orderInfo: 'Thanh toán đơn hàng',
    amount:    '50000',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleChange = e =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handlePay = async () => {
    setError('')
    const amt = parseInt(form.amount)
    if (!form.orderInfo.trim()) return setError('Vui lòng nhập nội dung thanh toán')
    if (isNaN(amt) || amt < 1000) return setError('Số tiền tối thiểu 1.000 VND')
    if (amt > 50_000_000)         return setError('Số tiền tối đa 50.000.000 VND')

    setLoading(true)
    try {
      const orderId = `ORDER_${Date.now()}`
      const res = await fetch('/api/momo/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, amount: amt, orderInfo: form.orderInfo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định')

      // Chuyển thẳng sang trang MoMo
      window.location.href = data.payUrl
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const fmt = v => {
    const n = parseInt(v.replace(/\D/g, '')) || 0
    return n.toLocaleString('vi-VN')
  }

  const handleAmountChange = e => {
    const raw = e.target.value.replace(/\D/g, '')
    setForm(f => ({ ...f, amount: raw }))
  }

  return (
    <>
      <Head>
        <title>Thanh Toán MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/Main.png" type="image/png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #fdf0f8;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: #fff;
          border-radius: 24px;
          padding: 40px 36px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 8px 40px rgba(216,45,139,.15);
          border: 1px solid #f0d0e5;
        }
        .logo {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 32px;
        }
        .logo-circle {
          width: 44px; height: 44px; border-radius: 14px;
          background: linear-gradient(135deg,#e8237c,#d82d8b);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 22px; font-weight: 900;
          box-shadow: 0 4px 16px rgba(216,45,139,.35);
        }
        .logo-text { font-size: 20px; font-weight: 800; color: #1a0a14; }
        .logo-sub  { font-size: 12px; color: #b0809a; font-weight: 500; margin-top: 1px; }

        label {
          display: block;
          font-size: 12px; font-weight: 700;
          color: #9a6070;
          text-transform: uppercase; letter-spacing: .6px;
          margin-bottom: 7px;
        }
        input[type=text], input[type=number], textarea {
          width: 100%; padding: 13px 16px;
          border: 1.5px solid #f0d0e5;
          border-radius: 12px;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 15px; color: #1a0a14;
          background: #fdf0f8;
          outline: none;
          transition: border .2s, box-shadow .2s, background .2s;
        }
        input:focus, textarea:focus {
          border-color: #d82d8b;
          box-shadow: 0 0 0 3px rgba(216,45,139,.1);
          background: #fff;
        }
        .field { margin-bottom: 18px; }

        .amount-wrapper {
          position: relative;
        }
        .amount-wrapper input {
          padding-right: 55px;
          font-size: 22px; font-weight: 800; color: #d82d8b;
          letter-spacing: -.5px;
        }
        .amount-unit {
          position: absolute; right: 16px; top: 50%;
          transform: translateY(-50%);
          font-size: 13px; font-weight: 700; color: #b0809a;
          pointer-events: none;
        }

        .quick-amounts {
          display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;
        }
        .qa-btn {
          padding: 6px 13px;
          border: 1.5px solid #f0d0e5;
          border-radius: 999px;
          background: #fff;
          font-size: 12px; font-weight: 600; color: #b0809a;
          cursor: pointer; transition: all .15s;
          font-family: inherit;
        }
        .qa-btn:hover {
          border-color: #d82d8b; color: #d82d8b; background: #fdf0f8;
        }

        .pay-btn {
          width: 100%; padding: 16px;
          border-radius: 14px; border: none;
          background: linear-gradient(135deg,#e8237c,#d82d8b);
          color: #fff; font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px; font-weight: 800;
          cursor: pointer;
          box-shadow: 0 6px 24px rgba(216,45,139,.35);
          transition: all .2s;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          margin-top: 8px;
          letter-spacing: .2px;
        }
        .pay-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(216,45,139,.45);
        }
        .pay-btn:disabled { opacity: .65; cursor: not-allowed; transform: none; }

        .error-box {
          background: #fef2f2; border: 1.5px solid #fca5a5;
          border-radius: 10px; padding: 11px 14px;
          color: #b91c1c; font-size: 13px; font-weight: 600;
          margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
        }

        .divider {
          border: none; border-top: 1px solid #f0d0e5;
          margin: 24px 0;
        }
        .secure-note {
          text-align: center; font-size: 11px; color: #c09ab0;
          display: flex; align-items: center; justify-content: center; gap: 5px;
          margin-top: 16px;
        }

        .spinner {
          width: 20px; height: 20px;
          border: 3px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .65s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg) } }

        @media(max-width:480px){
          .card { padding: 28px 20px; }
        }
      `}</style>

      <div className="card">
        {/* Logo */}
        <div className="logo">
          <div className="logo-circle">M</div>
          <div>
            <div className="logo-text">MoMo</div>
            <div className="logo-sub">Cổng thanh toán</div>
          </div>
        </div>

        {/* Amount */}
        <div className="field">
          <label>Số tiền thanh toán</label>
          <div className="amount-wrapper">
            <input
              type="text"
              inputMode="numeric"
              value={form.amount ? parseInt(form.amount).toLocaleString('vi-VN') : ''}
              onChange={handleAmountChange}
              placeholder="0"
            />
            <span className="amount-unit">VND</span>
          </div>
          <div className="quick-amounts">
            {[10000,20000,50000,100000,200000,500000].map(v => (
              <button key={v} className="qa-btn"
                onClick={() => setForm(f => ({ ...f, amount: String(v) }))}>
                {v.toLocaleString('vi-VN')}
              </button>
            ))}
          </div>
        </div>

        {/* Order info */}
        <div className="field">
          <label>Nội dung thanh toán</label>
          <input
            type="text"
            name="orderInfo"
            value={form.orderInfo}
            onChange={handleChange}
            placeholder="VD: Thanh toán đơn hàng #12345"
            maxLength={255}
          />
        </div>

        <hr className="divider" />

        {/* Error */}
        {error && (
          <div className="error-box">⚠️ {error}</div>
        )}

        {/* Pay button */}
        <button className="pay-btn" onClick={handlePay} disabled={loading}>
          {loading ? (
            <><div className="spinner" /> Đang xử lý...</>
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,.2)"/>
                <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Thanh toán {form.amount ? parseInt(form.amount).toLocaleString('vi-VN') : 0} VND
            </>
          )}
        </button>

        <div className="secure-note">
          🔒 Bảo mật bởi MoMo · Mã hóa SSL
        </div>
      </div>
    </>
  )
}
