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

  const handleKeyDown = e => {
    if (e.key === 'Enter' && amount && !loading) {
      handlePay()
    }
  }

  const display = amount ? parseInt(amount).toLocaleString('vi-VN') : ''
  const numVal = parseInt(amount) || 0

  return (
    <>
      <Head>
        <title>Thanh toán MoMo · IPA</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        
        :root {
          --mm: #ae0070;
          --text: #1a0413;
          --muted: #614655;
          --surface: rgba(255, 255, 255, 0.85); 
          --bg-input: rgba(240, 232, 236, 0.6);
          --border-input: rgba(174, 0, 112, 0.1);
        }

        html, body {
          height: 100%;
          width: 100%;
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #f3e9ed;
          overflow: hidden;
        }

        .wrapper {
          position: relative;
          display: grid;             /* Đổi từ flex sang grid */
          place-content: center;     /* Khóa chặt card vào chính giữa tâm màn hình */
          justify-items: center;     /* Căn giữa tất cả các thành phần con theo trục ngang */
          min-height: 100dvh;        /* Đổi từ 100vh sang 100dvh để chuẩn màn hình điện thoại */
          width: 100vw;
          padding: 20px 16px;
          background-color: #f6eff2;
          overflow-y: auto;          /* Cho phép cuộn mượt khi thu phóng lớn */
          overflow-x: hidden;
        }

        /* NỀN MESH GRADIENT ĐẬM RÕ - CHẠY NHANH - KHÔNG ĐƠ */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(55px); /* Giảm blur để màu sắc khối cầu tụ lại sắc nét và đậm hơn */
          opacity: 0.65; /* Tăng độ đậm */
          z-index: 0;
          pointer-events: none;
          transform: translate3d(0,0,0); /* Kích hoạt tăng tốc phần cứng bằng GPU */
        }
        
        /* Đẩy tốc độ thời gian chạy nhanh mạnh mẽ (5s - 7s) */
        .orb-1 {
          top: -5%; left: -5%; width: 50vw; height: 50vw;
          background: #ff9cb7;
          animation: orbMove1 5s infinite alternate ease-in-out;
        }
        .orb-2 {
          bottom: -5%; right: -5%; width: 60vw; height: 60vw;
          background: #b0bec5;
          animation: orbMove2 7s infinite alternate ease-in-out;
        }
        .orb-3 {
          top: 25%; right: -5%; width: 45vw; height: 45vw;
          background: #dfb2ea;
          animation: orbMove3 6s infinite alternate ease-in-out;
        }
        .orb-4 {
          bottom: -5%; left: 5%; width: 40vw; height: 40vw;
          background: #80cbc4;
          animation: orbMove1 6.5s infinite alternate ease-in-out;
        }

        @keyframes orbMove1 {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(8vw, 4vh, 0) scale(1.15); }
          100% { transform: translate3d(-4vw, 7vh, 0) scale(0.9); }
        }
        @keyframes orbMove2 {
          0% { transform: translate3d(0, 0, 0) scale(1.1); }
          50% { transform: translate3d(-10vw, -6vh, 0) scale(0.9); }
          100% { transform: translate3d(6vw, 4vh, 0) scale(1.1); }
        }
        @keyframes orbMove3 {
          0% { transform: translate3d(0, 0, 0) scale(0.9); }
          50% { transform: translate3d(-5vw, 7vh, 0) scale(1.2); }
          100% { transform: translate3d(7vw, -4vh, 0) scale(1); }
        }

        .wrapper::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3e%3cfilter id='noiseFilter'%3e%3ccolorMatrix type='matrix' values='0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.05 0'/%3e%3cturbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3e%3c/filter%3e%3crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3e%3c/svg%3e");
          opacity: 0.5; z-index: 1; pointer-events: none;
        }

        /* CARD TÁCH BIỆT LAYER GIÚP RENDER SIÊU MƯỢT */
        .card {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 400px;        /* SỬA TỪ 440px THÀNH 400px */
          background: var(--surface);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          padding: 36px 32px;
          box-shadow: 0 25px 50px rgba(174, 0, 112, 0.04), 0 1px 2px rgba(0, 0, 0, 0.01);
          will-change: transform;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 32px;
          border-bottom: 1px dashed var(--border-input);
          padding-bottom: 16px;
        }
        .logo-mark {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid var(--border-input);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .logo-name { 
          font-size: 19px; 
          font-weight: 800; 
          color: var(--text);
          letter-spacing: -0.3px;
        }
        .logo-sub { 
          font-size: 12px; 
          color: var(--muted); 
          margin-top: 2px; 
        }

        .amt-wrap {
          background: var(--bg-input);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
          border: 1px solid var(--border-input);
          transition: all 0.2s ease;
        }
        .amt-wrap:focus-within {
          border-color: #f0bcd4;
          box-shadow: 0 0 0 4px rgba(174, 0, 112, 0.06);
          background: #ffffff;
        }
        
        .amt-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1.2px;
          margin-bottom: 12px;
        }
        
        .amt-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .amt-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 42px;
          font-weight: 900;
          color: var(--text);
          min-width: 0;
          caret-color: var(--mm);
        }
        .amt-input::placeholder { 
          color: #b3a5ad; 
        }
        
        .amt-unit {
          font-size: 24px;
          font-weight: 800;
          color: #495057;
        }

        .quick-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 24px;
        }
        .qa {
          padding: 12px 4px;
          border-radius: 12px;
          border: 1px solid var(--border-input);
          background: rgba(255, 255, 255, 0.7);
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #495057;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s ease;
        }
        .qa:hover {
          border-color: var(--mm);
          color: var(--mm);
          background: #fff0f7;
          transform: translateY(-1px);
        }
        .qa.sel {
          background: var(--mm);
          border-color: var(--mm);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(174, 0, 112, 0.2);
        }

        .err {
          font-size: 13px;
          font-weight: 700;
          color: #dc2626;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 6px;
          background: #ffebee;
          padding: 10px 14px;
          border-radius: 10px;
        }

        .btn {
          width: 100%;
          padding: 16px;
          border-radius: 14px;
          border: none;
          background: var(--mm);
          color: #ffffff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 8px 24px rgba(174, 0, 112, 0.2);
          transition: all 0.2s ease;
        }
        .btn:hover:not(:disabled) {
          background: #91005d;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(174, 0, 112, 0.3);
        }
        .btn:disabled {
          background: #e2d7dc;
          color: #a6989f;
          box-shadow: none;
          cursor: not-allowed;
        }

        .spin {
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: rot 0.6s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        /* FOOTER BẢO MẬT */
        .security-footer {
          position: relative;
          z-index: 2;
          margin-top: 32px;
          width: 100%;
          max-width: 400px; 
          text-align: center;
          will-change: transform;
        }
        
        .security-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8c7381;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 20px;
        }
        .security-divider::before, .security-divider::after {
          content: '';
          width: 40px;
          border-bottom: 1px dashed rgba(174, 0, 112, 0.25);
          margin: 0 12px;
        }

        .badges-container { 
          display: grid;
          grid-template-columns: 1fr 1fr; /* Chia lưới đều thành 2 cột đối xứng */
          gap: 12px 16px;
          justify-items: center;          /* Đẩy nội dung từng ô ra chính giữa */
          width: 100%;
        }

        .sec-badge { 
          justify-content: center;        /* Căn icon và chữ ra tâm */
          width: 100%; 
        }
        
        
        .sec-icon-svg {
          width: 16px;
          height: 16px;
          fill: var(--mm); 
          opacity: 0.85;
          flex-shrink: 0;
        }
        
        .sec-text-main {
          font-size: 12px;
          font-weight: 700;
          color: #4a3240;
          letter-spacing: -0.1px;
        }
        
        .sec-text-sub {
          font-size: 11px;
          color: #8c7381;
          font-weight: 500;
        }

        @media (max-width: 600px) {
          .wrapper { padding: 16px; }
          .card { border-radius: 20px; padding: 28px 20px; }
          .amt-input { font-size: 34px; }
          .badges-container { 
            display: grid;
            grid-template-columns: 1fr 1fr; 
            gap: 14px 16px;
            padding: 0 12px;
          }
          .sec-badge { justify-content: flex-start; }
        }
      `}</style>

      <div className="wrapper">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
        <div className="orb orb-4"></div>

        <div className="card">
          <div className="logo">
            <div className="logo-mark">
              <img src="/Main.png" alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain' }} />
            </div>
            <div>
              <div className="logo-name">MOMO</div>
              <div className="logo-sub">Thanh toán IPA</div>
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
                onKeyDown={handleKeyDown}
                placeholder="0"
                autoFocus
              />
              <span className="amt-unit">₫</span>
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
              <><div className="spin" />Đang tạo đơn hàng…</>
            ) : (
              `Thanh toán${display ? ' ' + display + ' ₫' : ''}`
            )}
          </button>
        </div>

        <div className="security-footer">
          <div className="security-divider">Bảo mật cổng thanh toán</div>
          <div className="badges-container">
            
            <div className="sec-badge">
              <svg className="sec-icon-svg" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 1.9v2.6c0 .3-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5v-2.6c-.6-.4-1-1.1-1-1.9 0-1.4 1.1-2.5 2.5-2.5z"/>
              </svg>
              <span className="sec-text-main">PCI DSS</span>
            </div>

            <div className="sec-badge">
              <svg className="sec-icon-svg" viewBox="0 0 24 24">
                <path d="M12.65 10C11.83 7.59 9.57 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.57 0 4.83-1.59 5.65-4H17v3h3v-3h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
              </svg>
              <span className="sec-text-main">Mã hóa P2P</span>
            </div>

            <div className="sec-badge">
              <svg className="sec-icon-svg" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1 .9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
              <span className="sec-text-main">SHA-256</span>
            </div>

            <div className="sec-badge">
              <svg className="sec-icon-svg" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span className="sec-text-main">MoMo Verified</span>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}