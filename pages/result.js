import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [info,   setInfo]   = useState(null)

  useEffect(() => {
    if (!router.isReady) return
    const { orderId, resultCode, transId, amount, payType, message, orderInfo } = router.query

    if (!orderId) { setStatus('error'); return }

    const code = parseInt(resultCode)

    if (code === 0) {
      setStatus('success')
      setInfo({ orderId, transId, amount: parseInt(amount), payType, message })

      // Lưu vào Redis (backup cho IPN — sandbox không gửi IPN)
      fetch('/api/momo/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, transId, amount, payType, orderInfo, resultCode: 0 }),
      }).catch(() => {}) // ignore lỗi, không ảnh hưởng UI

    } else if (resultCode !== undefined) {
      setStatus('failed')
      setInfo({ orderId, message, resultCode: code })

      // Lưu giao dịch thất bại cũng vào Redis
      fetch('/api/momo/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, transId, amount, payType, orderInfo, resultCode: code }),
      }).catch(() => {})

    } else {
      // Không có resultCode → poll IPN status
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res  = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID') {
            setStatus('success'); setInfo(data); clearInterval(poll)
          } else if (data.status === 'FAILED') {
            setStatus('failed');  setInfo(data); clearInterval(poll)
          } else if (++attempts >= 10) {
            setStatus('pending'); clearInterval(poll)
          }
        } catch { clearInterval(poll) }
      }, 2000)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  return (
    <>
      <Head>
        <title>Kết quả thanh toán</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #fdf0f8; min-height: 100vh;
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .card {
          background: #fff; border-radius: 24px; padding: 40px 36px;
          width: 100%; max-width: 420px;
          box-shadow: 0 8px 40px rgba(216,45,139,.15);
          border: 1px solid #f0d0e5; text-align: center;
        }
        .icon { font-size: 64px; margin-bottom: 16px; animation: pop .4s ease; }
        @keyframes pop {
          0%   { transform: scale(0); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .title { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
        .subtitle { font-size: 14px; color: #9a6070; margin-bottom: 28px; }
        .info-box {
          background: #fdf0f8; border-radius: 14px; padding: 16px;
          text-align: left; margin-bottom: 24px;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 0; border-bottom: 1px solid #f0d0e5; font-size: 13px;
        }
        .info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .info-label { color: #9a6070; font-weight: 500; }
        .info-value { font-weight: 700; color: #1a0a14; }
        .amount-val { font-size: 18px; color: #d82d8b; }
        .btn-home {
          display: block; width: 100%; padding: 14px;
          background: linear-gradient(135deg,#e8237c,#d82d8b);
          color: #fff; border: none; border-radius: 12px;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 15px; font-weight: 700; cursor: pointer;
          text-decoration: none; transition: all .2s;
          box-shadow: 0 4px 16px rgba(216,45,139,.3);
        }
        .btn-home:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(216,45,139,.4); }
        .spinner {
          width: 48px; height: 48px; margin: 0 auto 20px;
          border: 4px solid #f0d0e5; border-top-color: #d82d8b;
          border-radius: 50%; animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg) } }
        .success .title { color: #15803d; }
        .failed  .title { color: #b91c1c; }
        .pending .title { color: #c2410c; }
      `}</style>

      <div className="card">
        {status === 'loading' && (
          <>
            <div className="spinner" />
            <div className="title" style={{color:'#d82d8b'}}>Đang xác nhận...</div>
            <div className="subtitle">Vui lòng chờ trong giây lát</div>
          </>
        )}

        {status === 'success' && (
          <div className="success">
            <div className="icon">✅</div>
            <div className="title">Thanh toán thành công!</div>
            <div className="subtitle">Giao dịch đã được xác nhận bởi MoMo</div>
            {info && (
              <div className="info-box">
                {info.amount && (
                  <div className="info-row">
                    <span className="info-label">Số tiền</span>
                    <span className="info-value amount-val">{fmt(info.amount)} VND</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-label">Mã đơn hàng</span>
                  <span className="info-value" style={{fontSize:'12px'}}>{info.orderId}</span>
                </div>
                {info.transId && (
                  <div className="info-row">
                    <span className="info-label">Mã GD MoMo</span>
                    <span className="info-value" style={{fontSize:'12px'}}>{info.transId}</span>
                  </div>
                )}
                {info.payType && (
                  <div className="info-row">
                    <span className="info-label">Hình thức</span>
                    <span className="info-value">{info.payType}</span>
                  </div>
                )}
              </div>
            )}
            <Link href="/" className="btn-home">← Quay lại trang thanh toán</Link>
          </div>
        )}

        {status === 'failed' && (
          <div className="failed">
            <div className="icon">❌</div>
            <div className="title">Thanh toán thất bại</div>
            <div className="subtitle">{info?.message || 'Giao dịch không thành công'}</div>
            {info?.resultCode && (
              <div className="info-box">
                <div className="info-row">
                  <span className="info-label">Mã lỗi</span>
                  <span className="info-value">{info.resultCode}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Đơn hàng</span>
                  <span className="info-value" style={{fontSize:'12px'}}>{info.orderId}</span>
                </div>
              </div>
            )}
            <Link href="/" className="btn-home">Thử lại</Link>
          </div>
        )}

        {status === 'pending' && (
          <div className="pending">
            <div className="icon">⏳</div>
            <div className="title">Đang chờ xác nhận</div>
            <div className="subtitle">MoMo chưa phản hồi. Vui lòng kiểm tra lại sau.</div>
            <Link href="/" className="btn-home">← Về trang chủ</Link>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="icon">⚠️</div>
            <div className="title" style={{color:'#c2410c'}}>Không tìm thấy đơn hàng</div>
            <div className="subtitle">Link không hợp lệ hoặc đã hết hạn</div>
            <Link href="/" className="btn-home">← Về trang chủ</Link>
          </div>
        )}
      </div>
    </>
  )
}
