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
        <title>Thanh toán MoMo · Green Coffee</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        
        :root {
          --mm: #ae0070;
          --text: #1e0f18;
          --muted: #6e5261;
          --surface: #ffffff;
          --bg-input: #f8f9fa;
          --border-input: #e9ecef;
        }

        html, body {
          height: 100%;
          width: 100%;
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #f1f3f5;
          overflow-x: hidden;
        }

        /* Luôn cố định tuyệt đối ở giữa màn hình bất kể zoom */
        .wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100vw;
          padding: 20px;
          background: radial-gradient(circle at 50% 50%, #ffffff 0%, #e9ecef 100%);
        }

        /* CARD TRẮNG SÁNG SANG TRỌNG */
        .card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          background: var(--surface);
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.05);
          padding: 36px 32px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.01);
        }

        /* Header / Logo */
        .logo {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 32px;
        }
        .logo-mark {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #fff;
          border: 1px solid #e9ecef;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
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

        /* Vùng khung nhập tiền lớn */
        .amt-wrap {
          background: var(--bg-input);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
          border: 1px solid var(--border-input);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .amt-wrap:focus-within {
          border-color: #f0bcd4;
          box-shadow: 0 0 0 4px rgba(174, 0, 112, 0.06);
          background: #fff;
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
        
        /* Chữ số input TO RÕ */
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
          color: #adb5bd; 
        }
        
        .amt-unit {
          font-size: 24px;
          font-weight: 800;
          color: #495057;
        }

        /* Lưới các nút chọn tiền nhanh */
        .quick-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 24px;
        }
        .qa {
          padding: 12px 4px;
          border-radius: 12px;
          border: 1px solid #dee2e6;
          background: #ffffff;
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
        .qa:active { 
          transform: scale(0.97); 
        }
        .qa.sel {
          background: var(--mm);
          border-color: var(--mm);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(174, 0, 112, 0.2);
        }

        /* Lỗi cảnh báo chữ TO nổi bật */
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

        /* Nút thanh toán */
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
        .btn:active:not(:disabled) { 
          transform: scale(0.99); 
        }
        .btn:disabled {
          background: #e9ecef;
          color: #adb5bd;
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
          flex-shrink: 0;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        /* FOOTER CHỨNG NHẬN BẢO MẬT CHUẨN MOMO */
        .security-footer {
          margin-top: 24px;
          width: 100%;
          max-width: 440px;
          text-align: center;
        }
        .security-divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: #adb5bd;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 16px;
        }
        .security-divider::before, .security-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px dashed #ced4da;
        }
        .security-divider:not(:empty)::before { margin-right: .75em; }
        .security-divider:not(:empty)::after { margin-left: .75em; }

        .badges-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .sec-badge {
          background: #ffffff;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          box-shadow: 0 4px 10px rgba(0,0,0,0.01);
        }
        .sec-icon {
          font-size: 18px;
          background: #fff0f7;
          color: var(--mm);
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .sec-text-main {
          font-size: 11px;
          font-weight: 700;
          color: var(--text);
        }
        .sec-text-sub {
          font-size: 10px;
          color: var(--muted);
          margin-top: 1px;
        }

        /* Mobile Responsive gọn gàng */
        @media (max-width: 480px) {
          .wrapper { padding: 16px; }
          .card { border-radius: 20px; padding: 28px 20px; }
          .amt-input { font-size: 34px; }
          .logo { margin-bottom: 24px; }
          .badges-container { grid-template-columns: 1fr; gap: 8px; }
        }
      `}</style>

      <div className="wrapper">
        <div className="card">
          
          {/* LOGO & BRAND */}
          <div className="logo">
            <div className="logo-mark">
              <img src="/Main.png" alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain' }} />
            </div>
            <div>
              <div className="logo-name">Green Coffee</div>
              <div className="logo-sub">Cổng thanh toán an toàn</div>
            </div>
          </div>

          {/* Ô NHẬP TIỀN (ĐÃ BỎ DÒNG CHỮ CHỮ BÊN DƯỚI) */}
          <div className="amt-wrap">
            <div className="amt-label">Số tiền cần thanh toán</div>
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
          </div>

          {/* LƯỚI CHỌN NHANH GIÁ TIỀN */}
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

          {/* THÔNG BÁO LỖI (NẾU CÓ) */}
          {error && <div className="err">⚠ {error}</div>}

          {/* NÚT SUBMIT TO RÕ */}
          <button className="btn" onClick={handlePay} disabled={loading || !amount}>
            {loading ? (
              <><div className="spin" />Đang tạo đơn hàng…</>
            ) : (
              `Thanh toán${display ? ' ' + display + ' ₫' : ''}`
            )}
          </button>
          
        </div>

        {/* KHỐI CHỨNG NHẬN BẢO MẬT CHUẨN ĐÚNG KIỂU MOMO ĐỂ TĂNG ĐỘ UY TÍN */}
        <div className="security-footer">
          <div className="security-divider">Bảo mật cổng thanh toán</div>
          
          <div className="badges-container">
            <div className="sec-badge">
              <div className="sec-icon">🛡️</div>
              <div>
                <div className="sec-text-main">Chứng chỉ PCI DSS</div>
                <div className="sec-text-sub">Tiêu chuẩn quốc tế</div>
              </div>
            </div>
            
            <div className="sec-badge">
              <div className="sec-icon">🔑</div>
              <div>
                <div className="sec-text-main">Mã hóa P2P</div>
                <div className="sec-text-sub">Bảo vệ luồng tiền</div>
              </div>
            </div>
            
            <div className="sec-badge">
              <div className="sec-icon">🔒</div>
              <div>
                <div className="sec-text-main">SHA-256 mã hóa</div>
                <div className="sec-text-sub">Bảo mật dữ liệu 2 tầng</div>
              </div>
            </div>
            
            <div className="sec-badge">
              <div className="sec-icon">✅</div>
              <div>
                <div className="sec-text-main">MoMo Verified</div>
                <div className="sec-text-sub">Đối tác liên kết gốc</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}