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
          --text: #1a0413;
          --muted: #614655;
          --surface: rgba(255, 255, 255, 0.82);
          --border-input: rgba(174, 0, 112, 0.1);
        }

        html, body {
          height: 100%;
          width: 100%;
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #f7f3f5;
          overflow-x: hidden;
        }

        .wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100vw;
          padding: 20px;
          background-color: #f6eff2;
          overflow: hidden;
        }

        /* ĐỒNG BỘ NỀN MESH GRADIENT HẠT MỊN */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.55;
          z-index: 0;
          mix-blend-mode: multiply;
        }
        .orb-1 { top: -10%; left: -10%; width: 50vw; height: 50vw; background: #ffb7d2; animation: orbMove1 20s infinite alternate ease-in-out; }
        .orb-2 { bottom: -10%; right: -5%; width: 60vw; height: 60vw; background: #cbd5e1; animation: orbMove2 25s infinite alternate ease-in-out; }
        .orb-3 { top: 30%; right: -10%; width: 45vw; height: 45vw; background: #e1bee7; animation: orbMove3 18s infinite alternate ease-in-out; }
        .orb-4 { bottom: -5%; left: 10%; width: 40vw; height: 40vw; background: #b2dfdb; animation: orbMove1 22s infinite alternate ease-in-out; }

        @keyframes orbMove1 { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(8vw, 5vh) scale(1.1); } 100% { transform: translate(-4vw, 10vh) scale(0.9); } }
        @keyframes orbMove2 { 0% { transform: translate(0, 0) scale(1.1); } 50% { transform: translate(-10vw, -8vh) scale(0.95); } 100% { transform: translate(5vw, 4vh) scale(1.05); } }
        @keyframes orbMove3 { 0% { transform: translate(0, 0) scale(0.9); } 50% { transform: translate(-5vw, 10vh) scale(1.15); } 100% { transform: translate(8vw, -5vh) scale(1); } }

        .wrapper::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3e%3cfilter id='noiseFilter'%3e%3ccolorMatrix type='matrix' values='0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.07 0'/%3e%3cturbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3e%3c/filter%3e%3crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3e%3c/svg%3e");
          opacity: 0.8; z-index: 1; pointer-events: none;
        }

        /* CONTAINER CARD KÍNH MỜ */
        .container-card {
          position: relative;
          z-index: 2;
          background: var(--surface);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          width: 100%;
          max-width: 860px;
          border-radius: 24px;
          box-shadow: 0 30px 60px rgba(174, 0, 112, 0.04), 0 1px 2px rgba(0, 0, 0, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.7);
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          overflow: hidden;
        }

        .status-section {
          background: rgba(255, 255, 255, 0.3);
          padding: 50px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
          border-right: 1px dashed rgba(174, 0, 112, 0.15);
        }

        .brand-header {
          position: absolute;
          top: 24px;
          left: 32px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .brand-logo { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; }
        .brand-title { font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.2px; }

        .icon-wrapper {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 42px;
          font-weight: 900;
          margin-bottom: 24px;
          margin-top: 20px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.02);
          animation: scaleUp 0.4s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes scaleUp { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }

        .loading-spinner {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          border: 5px solid rgba(174, 0, 112, 0.1);
          border-top-color: var(--mm);
          animation: spin 0.8s linear infinite;
          margin-bottom: 24px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .status-title { font-size: 26px; font-weight: 800; line-height: 1.3; margin-bottom: 12px; color: var(--text); }
        .status-subtitle { font-size: 14px; color: var(--muted); line-height: 1.5; max-width: 300px; }

        .details-section {
          background: transparent;
          padding: 50px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .details-heading { font-size: 17px; font-weight: 800; color: var(--text); margin-bottom: 20px; letter-spacing: -0.3px; }

        .info-card {
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(174, 0, 112, 0.08);
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 24px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          font-size: 14px;
          border-bottom: 1px solid rgba(174, 0, 112, 0.04);
        }
        .info-item:last-child { border-bottom: none; }
        .info-label { color: var(--muted); font-weight: 500; }
        .info-value { font-weight: 700; color: var(--text); text-align: right; max-width: 60%; word-break: break-all; }
        .info-value.amount-highlight { font-size: 24px; font-weight: 900; color: var(--mm); }

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
        .action-button:hover { background: #91005d; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(174, 0, 112, 0.3); }

        .state-empty-text { font-size: 14px; color: var(--muted); text-align: center; padding: 20px 0; }

        @media (max-width: 768px) {
          .wrapper { padding: 16px; }
          .container-card { grid-template-columns: 1fr; max-width: 460px; border-radius: 20px; }
          .status-section { border-right: none; border-bottom: 1px dashed rgba(174, 0, 112, 0.15); padding: 45px 24px 35px 24px; }
          .brand-header { top: 16px; left: 20px; }
          .icon-wrapper { width: 85px; height: 85px; font-size: 36px; margin-bottom: 16px; }
          .status-title { font-size: 22px; }
          .details-section { padding: 35px 24px; }
        }
      `}</style>

      <div className="wrapper">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
        <div className="orb orb-4"></div>

        <div className="container-card">
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