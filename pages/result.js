import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [info, setInfo] = useState(null)
  // Đánh dấu đã có kết quả cuối (success/failed) — để effect không xử lý lại
  // khi cleanUrlBar() đổi router.query và làm effect tự chạy lại lần nữa.
  const resolvedRef = useRef(false)

useEffect(() => {
    if (!router.isReady) return
    if (resolvedRef.current) return // đã có kết quả cuối — bỏ qua lần effect chạy lại do cleanUrlBar

    // 1. Đọc thông tin từ URL bắn về — lấy TOÀN BỘ query (không chỉ vài field)
    //    vì save.js cần đủ field (kể cả signature) để xác minh chữ ký MoMo.
    const fullQuery = { ...router.query }
    let { orderId, resultCode, transId, amount, payType, message, orderInfo } = fullQuery
    const code = parseInt(resultCode)

    // 2. MẸO CHỐNG F5: Nếu URL trống, lục tìm đơn hàng trong bộ nhớ đệm trình duyệt
    if (!orderId && typeof window !== 'undefined') {
      orderId = sessionStorage.getItem('momo_current_order_id')
    }

    // Nếu cả URL và bộ nhớ đều trống thì mới báo lỗi thực sự
    if (!orderId) { setStatus('error'); resolvedRef.current = true; return }

    // Hàm phụ để dọn dẹp thanh địa chỉ URL sau 500ms cho sạch đẹp
    const cleanUrlBar = () => {
      setTimeout(() => {
        router.replace('/result', undefined, { shallow: true })
      }, 500)
    }

    // 3. Nếu có thông tin đơn mới từ URL, tiến hành lưu và ghi nhớ id
    if (resultCode !== undefined) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('momo_current_order_id', orderId) // Lưu lại để F5 không bị quên
      }

      if (code === 0) {
        setStatus('success')
        resolvedRef.current = true
        setInfo({ orderId, transId, amount: parseInt(amount), payType, message })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: 0 }),
        })
        .then(() => cleanUrlBar())
        .catch(() => cleanUrlBar())
      } else {
        setStatus('failed')
        resolvedRef.current = true
        setInfo({ orderId, message, resultCode: code })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: code }),
        })
        .then(() => cleanUrlBar())
        .catch(() => cleanUrlBar())
      }
    } else {
      // 4. LUỒNG KHI NHẤN F5: Tự động gọi API hỏi server trạng thái đơn hàng đã lưu ngầm
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID') { 
            setStatus('success')
            resolvedRef.current = true
            setInfo(data)
            clearInterval(poll)
            cleanUrlBar()
          }
          else if (data.status === 'FAILED') { 
            setStatus('failed')
            resolvedRef.current = true
            setInfo(data)
            clearInterval(poll)
            cleanUrlBar()
          }
          else if (++attempts >= 10) { 
            setStatus('pending')
            resolvedRef.current = true
            clearInterval(poll)
            cleanUrlBar()
          }
        } catch { 
          resolvedRef.current = true
          clearInterval(poll) 
          cleanUrlBar()
        }
      }, 1500)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const META = {
    loading: { spin: true,  title: 'Đang xác nhận…',          sub: 'Vui lòng không đóng trang',              accent: '#ae0070', bg: '#fdf5f9' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',   sub: 'Giao dịch đã được MoMo xác nhận',        accent: '#16a34a', bg: 'rgba(232, 245, 233, 0.85)' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',       sub: null,                                      accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',        sub: 'MoMo chưa phản hồi, kiểm tra lại sau',   accent: '#d97706', bg: 'rgba(255, 243, 224, 0.85)' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng',  sub: 'Link không hợp lệ hoặc đã hết hạn',      accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
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
          --surface: rgba(255, 255, 255, 0.85);
          --border-input: rgba(174, 0, 112, 0.1);
        }

        html, body {
          height: 100%;
          width: 100%;
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #f3e9ed;
          overflow-x: hidden;
        }

        .wrapper {
          position: relative;
          display: grid;
          place-items: center;       /* Thêm thuộc tính này */
          align-content: center;     /* Thêm thuộc tính này */
          min-height: 100dvh;
          width: 100vw;
          padding: 24px 16px;        /* Tăng nhẹ padding cho thoáng */
          background-color: #f6eff2;
          overflow-y: auto;
          overflow-x: hidden;
        }
        /* NỀN MESH GRADIENT ĐẬM RÕ - CHẢY NHANH ĐỒNG BỘ */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(55px);
          opacity: 0.65;
          z-index: 0;
          pointer-events: none;
          transform: translate3d(0,0,0); /* Kích hoạt tăng tốc phần cứng card đồ họa */
        }
        .orb-1 { top: -5%; left: -5%; width: 50vw; height: 50vw; background: #ff9cb7; animation: orbMove1 5s infinite alternate ease-in-out; }
        .orb-2 { bottom: -5%; right: -5%; width: 60vw; height: 60vw; background: #b0bec5; animation: orbMove2 7s infinite alternate ease-in-out; }
        .orb-3 { top: 25%; right: -5%; width: 45vw; height: 45vw; background: #dfb2ea; animation: orbMove3 6s infinite alternate ease-in-out; }
        .orb-4 { bottom: -5%; left: 5%; width: 40vw; height: 40vw; background: #80cbc4; animation: orbMove1 6.5s infinite alternate ease-in-out; }

        @keyframes orbMove1 { 0% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(8vw, 4vh, 0) scale(1.15); } 100% { transform: translate3d(-4vw, 7vh, 0) scale(0.9); } }
        @keyframes orbMove2 { 0% { transform: translate3d(0, 0, 0) scale(1.1); } 50% { transform: translate3d(-10vw, -6vh, 0) scale(0.9); } 100% { transform: translate3d(6vw, 4vh, 0) scale(1.1); } }
        @keyframes orbMove3 { 0% { transform: translate3d(0, 0, 0) scale(0.9); } 50% { transform: translate3d(-5vw, 7vh, 0) scale(1.2); } 100% { transform: translate3d(7vw, -4vh, 0) scale(1); } }

        .wrapper::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3e%3cfilter id='noiseFilter'%3e%3ccolorMatrix type='matrix' values='0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.05 0'/%3e%3cturbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3e%3c/filter%3e%3crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3e%3c/svg%3e");
          opacity: 0.5; z-index: 1; pointer-events: none;
        }

        /* CONTAINER CARD KÍNH MỜ SIÊU MƯỢT */
        .container-card {
          position: relative;
          z-index: 2;
          background: var(--surface);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          width: 100%;
          max-width: 860px;
          border-radius: 24px;
          box-shadow: 0 25px 50px rgba(174, 0, 112, 0.04), 0 1px 2px rgba(0, 0, 0, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.7);
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          overflow: hidden;
          will-change: transform;
        }

        .status-section {
          background: rgba(255, 255, 255, 0.2);
          padding: 50px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
          border-right: 1px dashed rgba(174, 0, 112, 0.12);
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
          background: rgba(255, 255, 255, 0.6);
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
          .container-card { 
            display: grid;           /* Đảm bảo kích hoạt grid */
            grid-template-columns: 1fr; 
            max-width: 400px;        /* Bóp gọn chiều rộng khít đều với tỉ lệ trang chủ cho cân đối */
            border-radius: 20px; 
          }
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
              <span className="brand-title">IPA</span>
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