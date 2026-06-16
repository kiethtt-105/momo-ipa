import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!router.isReady) return
    const { orderId, resultCode, transId, amount, payType, message, orderInfo } = router.query
    if (!orderId) { setStatus('error'); return }
    const code = parseInt(resultCode)
    if (code === 0) {
      setStatus('success')
      setInfo({ orderId, transId, amount: parseInt(amount), payType, message })
      fetch('/api/momo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, transId, amount, payType, orderInfo, resultCode: 0 }),
      }).catch(() => {})
    } else if (resultCode !== undefined) {
      setStatus('failed')
      setInfo({ orderId, message, resultCode: code })
      fetch('/api/momo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, transId, amount, payType, orderInfo, resultCode: code }),
      }).catch(() => {})
    } else {
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID')    { setStatus('success'); setInfo(data); clearInterval(poll) }
          else if (data.status === 'FAILED') { setStatus('failed'); setInfo(data); clearInterval(poll) }
          else if (++attempts >= 10)     { setStatus('pending'); clearInterval(poll) }
        } catch { clearInterval(poll) }
      }, 2000)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const META = {
    loading: { spin: true,  title: 'Đang xác nhận…',          sub: 'Vui lòng không đóng trang',              accent: '#ae0070', bg: '#fdf5f9' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',   sub: 'Giao dịch đã được MoMo xác nhận',        accent: '#16a34a', bg: '#e8f5e9' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',       sub: null,                                      accent: '#dc2626', bg: '#ffebee' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',        sub: 'MoMo chưa phản hồi, kiểm tra lại sau',   accent: '#d97706', bg: '#fff3e0' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng',  sub: 'Link không hợp lệ hoặc đã hết hạn',      accent: '#dc2626', bg: '#ffebee' },
  }
  const m = META[status] || META.loading

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" /> 
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --mm: #ae0070;
          --mm-border: #f0d5e3;
          --text: #1e0f18;
          --muted: #6e5261;
          --surface: #ffffff;
          --bg: #f8f9fa;
        }

        html, body {
          height: 100%;
          width: 100%;
          background: var(--bg);
          font-family: 'Be Vietnam Pro', sans-serif;
          overflow-x: hidden;
        }

        /* AUTOFIX TRUNG TÂM: Cố định tuyệt đối ở giữa màn hình bất kể zoom hay độ phân giải */
        .wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100vw;
          padding: 20px;
          background: radial-gradient(circle at 50% 50%, #ffffff 0%, #f1f3f5 100%);
        }

        /* CARD GIAO DIỆN SÁNG CAO CẤP */
        .container-card {
          background: var(--surface);
          width: 100%;
          max-width: 900px;
          border-radius: 24px;
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.02);
          border: 1px solid rgba(0, 0, 0, 0.04);
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        /* PHẦN TRÁI: TRẠNG THÁI (Màu sáng sạch sẽ) */
        .status-section {
          background: #ffffff;
          padding: 50px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
          border-right: 1px dashed #e9ecef;
        }

        /* Logo góc trên hoặc tiêu đề thương hiệu */
        .brand-header {
          position: absolute;
          top: 24px;
          left: 32px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .brand-logo {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          object-fit: contain;
        }
        .brand-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.2px;
        }

        /* Vòng tròn Icon TO, RÕ */
        .icon-wrapper {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 46px;
          font-weight: 900;
          margin-bottom: 24px;
          margin-top: 20px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
          animation: scaleUp 0.4s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes scaleUp { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }

        .loading-spinner {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 5px solid #e9ecef;
          border-top-color: var(--mm);
          animation: spin 0.8s linear infinite;
          margin-bottom: 24px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Chữ TO RÕ */
        .status-title {
          font-size: 28px;
          font-weight: 800;
          line-height: 1.3;
          margin-bottom: 12px;
          word-break: break-word;
        }
        .status-subtitle {
          font-size: 15px;
          color: var(--muted);
          line-height: 1.5;
          max-width: 320px;
        }

        /* PHẦN PHẢI: CHI TIẾT ĐƠN HÀNG */
        .details-section {
          background: #fafbfa;
          padding: 50px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .details-heading {
          font-size: 18px;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 24px;
          letter-spacing: -0.3px;
        }

        /* Khối hiển thị thông tin bảng đơn hàng */
        .info-card {
          background: #ffffff;
          border: 1px solid #eedbe5;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 28px;
          box-shadow: 0 4px 12px rgba(174, 0, 112, 0.02);
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          font-size: 14px;
          border-bottom: 1px solid #f8f2f5;
        }
        .info-item:last-child { border-bottom: none; }
        
        .info-label {
          color: var(--muted);
          font-weight: 500;
        }
        .info-value {
          font-weight: 700;
          color: var(--text);
          text-align: right;
          max-width: 60%;
          word-break: break-all;
        }
        /* Số tiền nổi bật hơn hẳn */
        .info-value.amount-highlight {
          font-size: 24px;
          font-weight: 900;
          color: var(--mm);
        }

        /* Nút quay lại lớn và dễ bấm */
        .action-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 16px;
          border-radius: 14px;
          background: var(--mm);
          color: #ffffff;
          font-size: 16px;
          font-weight: 700;
          text-decoration: none;
          text-align: center;
          box-shadow: 0 8px 24px rgba(174, 0, 112, 0.2);
          transition: all 0.2s ease;
          border: none;
          cursor: pointer;
        }
        .action-button:hover {
          background: #91005d;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(174, 0, 112, 0.3);
        }
        .action-button:active { transform: translateY(0); }

        .state-empty-text {
          font-size: 14px;
          color: var(--muted);
          text-align: center;
          padding: 20px 0;
        }

        /* RESPONSIVE: CHUYỂN THÀNH 1 CỘT TRÊN ĐIỆN THOẠI */
        @media (max-width: 768px) {
          .wrapper {
            padding: 12px;
          }
          .container-card {
            grid-template-columns: 1fr;
            max-width: 480px;
            border-radius: 20px;
          }
          .status-section {
            border-right: none;
            border-bottom: 1px dashed #e9ecef;
            padding: 45px 24px 35px 24px;
          }
          .brand-header {
            top: 16px;
            left: 20px;
          }
          .icon-wrapper {
            width: 90px;
            height: 90px;
            font-size: 38px;
            margin-bottom: 16px;
          }
          .status-title {
            font-size: 24px;
          }
          .details-section {
            padding: 35px 24px;
          }
        }
      `}</style>

      <div className="wrapper">
        <div className="container-card">
          
          {/* CỘT TRÁI: TRẠNG THÁI TRỰC QUAN */}
          <div className="status-section">
            <div className="brand-header">
              <img src="/Main.png" alt="Logo" className="brand-logo" />
              <span className="brand-title">Green Coffee</span>
            </div>

            {m.spin ? (
              <div className="loading-spinner" />
            ) : (
              <div className="icon-wrapper" style={{ backgroundColor: m.bg, color: m.accent }}>
                {m.icon}
              </div>
            )}

            <h1 className="status-title" style={{ color: m.spin ? 'var(--text)' : m.accent }}>
              {m.title}
            </h1>
            <p className="status-subtitle">
              {m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}
            </p>
          </div>

          {/* CỘT PHẢI: CHI TIẾT GIAO DỊCH */}
          <div className="details-section">
            {(status === 'success' || status === 'failed') && (
              <h2 className="details-heading">Thông tin đơn hàng</h2>
            )}

            {status === 'success' && info && (
              <div className="info-card">
                {info.amount > 0 && (
                  <div className="info-item">
                    <span className="info-label">Số tiền</span>
                    <span className="info-value amount-highlight">{fmt(info.amount)} ₫</span>
                  </div>
                )}
                <div className="info-item">
                  <span className="info-label">Mã đơn hàng</span>
                  <span className="info-value">{info.orderId}</span>
                </div>
                {info.transId && (
                  <div className="info-item">
                    <span className="info-label">Mã GD MoMo</span>
                    <span className="info-value">{info.transId}</span>
                  </div>
                )}
                {info.payType && (
                  <div className="info-item">
                    <span className="info-label">Hình thức</span>
                    <span className="info-value">{info.payType}</span>
                  </div>
                )}
              </div>
            )}

            {status === 'failed' && info?.resultCode && (
              <div className="info-card">
                <div className="info-item">
                  <span className="info-label">Mã lỗi hệ thống</span>
                  <span className="info-value" style={{ color: 'var(--danger)' }}>{info.resultCode}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Đơn hàng số</span>
                  <span className="info-value">{info.orderId}</span>
                </div>
                {info.message && (
                  <div className="info-item">
                    <span className="info-label">Nguyên nhân</span>
                    <span className="info-value">{info.message}</span>
                  </div>
                )}
              </div>
            )}

            {status === 'loading' && (
              <div className="state-empty-text">
                <p>Đang đồng bộ dữ liệu kết quả từ MoMo...</p>
              </div>
            )}

            {status !== 'loading' && (
              <Link href="/" className="action-button">
                {status === 'failed' ? 'Thử thanh toán lại' : 'Quay lại trang chủ'}
              </Link>
            )}
          </div>

        </div>
      </div>
    </>
  )
}