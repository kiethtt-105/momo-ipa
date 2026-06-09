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
      fetch('/api/momo/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, transId, amount, payType, orderInfo, resultCode: 0 }) }).catch(() => {})
    } else if (resultCode !== undefined) {
      setStatus('failed')
      setInfo({ orderId, message, resultCode: code })
      fetch('/api/momo/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, transId, amount, payType, orderInfo, resultCode: code }) }).catch(() => {})
    } else {
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID') { setStatus('success'); setInfo(data); clearInterval(poll) }
          else if (data.status === 'FAILED') { setStatus('failed'); setInfo(data); clearInterval(poll) }
          else if (++attempts >= 10) { setStatus('pending'); clearInterval(poll) }
        } catch { clearInterval(poll) }
      }, 2000)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const META = {
    loading: { icon: null,  spin: true,  title: 'Đang xác nhận…',          sub: 'Vui lòng chờ trong giây lát',            accent: '#d81b60' },
    success: { icon: '✓',   spin: false, title: 'Thanh toán thành công!',   sub: 'Giao dịch đã được xác nhận bởi MoMo',   accent: '#16a34a' },
    failed:  { icon: '✕',   spin: false, title: 'Giao dịch thất bại',       sub: null,                                      accent: '#dc2626' },
    pending: { icon: '⏳',  spin: false, title: 'Đang chờ xác nhận',        sub: 'MoMo chưa phản hồi. Kiểm tra lại sau',  accent: '#d97706' },
    error:   { icon: '!',   spin: false, title: 'Không tìm thấy đơn hàng', sub: 'Link không hợp lệ hoặc đã hết hạn',     accent: '#dc2626' },
  }
  const m = META[status] || META.loading

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --pink: #d81b60; --pink-hover: #c01755; --pink-active: #ad134c;
          --pink-soft: #fce4ec; --pink-border: #f8bbd0;
          --text: #1a0a10; --muted: #b06080;
          --bg: #fff8fb; --surface: #ffffff; --surface2: #fdf0f5;
        }
        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: var(--bg); min-height: 100vh;
          display: flex; align-items: center; justify-content: center; padding: 24px 16px;
        }
        body::before {
          content: '';
          position: fixed; top: 0; left: 0; right: 0; height: 260px;
          background: linear-gradient(180deg, #fce4ec 0%, transparent 100%);
          pointer-events: none; z-index: 0;
        }
        .wrap { width: 100%; max-width: 400px; position: relative; z-index: 1; }

        .card {
          background: var(--surface);
          border: 1.5px solid var(--pink-border);
          border-radius: 20px; padding: 36px 28px;
          box-shadow: 0 8px 32px rgba(216,27,96,.12), 0 2px 8px rgba(216,27,96,.06);
          text-align: center;
        }

        /* status icon */
        .icon-ring {
          width: 76px; height: 76px; border-radius: 50%;
          margin: 0 auto 20px;
          display: flex; align-items: center; justify-content: center;
          font-size: 30px; font-weight: 900;
          animation: popIn .4s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        .spin-ring {
          width: 76px; height: 76px; border-radius: 50%;
          margin: 0 auto 20px;
          border: 4px solid var(--pink-soft);
          border-top-color: var(--pink);
          animation: rot .7s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        .s-title { font-size: 22px; font-weight: 900; margin-bottom: 6px; }
        .s-sub   { font-size: 13px; color: var(--muted); margin-bottom: 26px; line-height: 1.5; }

        /* info box */
        .info-box {
          background: var(--surface2);
          border: 1.5px solid var(--pink-border);
          border-radius: 14px; margin-bottom: 24px;
          overflow: hidden; text-align: left;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 11px 16px; font-size: 13px;
          border-bottom: 1px solid var(--pink-border);
        }
        .info-row:last-child { border-bottom: none; }
        .info-k { color: var(--muted); font-weight: 500; }
        .info-v { font-weight: 700; color: var(--text); font-size: 12px; max-width: 55%; text-align: right; word-break: break-all; }
        .info-v.big { font-size: 20px; color: var(--pink); }

        /* back button */
        .btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px;
          border-radius: 14px; border: none;
          background: var(--pink); color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 15px; font-weight: 800;
          text-decoration: none; cursor: pointer;
          box-shadow: 0 6px 20px rgba(216,27,96,.4);
          transition: background .15s, transform .15s, box-shadow .15s;
          position: relative; overflow: hidden;
        }
        .btn::before {
          content: '';
          position: absolute; top: 0; left: -100%; width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent);
          transition: left .5s;
        }
        .btn:hover::before { left: 150%; }
        .btn:hover {
          background: var(--pink-hover); transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(216,27,96,.45);
        }
        .btn:active { background: var(--pink-active); transform: translateY(0) scale(.99); }

        @media(max-width:480px) { .card { padding: 28px 18px; } }
      `}</style>

      <div className="wrap">
        <div className="card">
          {m.spin
            ? <div className="spin-ring" />
            : (
              <div className="icon-ring" style={{
                background: `${m.accent}15`,
                border: `2px solid ${m.accent}35`,
                color: m.accent,
              }}>
                {m.icon}
              </div>
            )
          }

          <div className="s-title" style={{ color: m.spin ? 'var(--pink)' : m.accent }}>{m.title}</div>
          <div className="s-sub">{m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}</div>

          {status === 'success' && info && (
            <div className="info-box">
              {info.amount > 0 && (
                <div className="info-row">
                  <span className="info-k">Số tiền</span>
                  <span className="info-v big">{fmt(info.amount)} ₫</span>
                </div>
              )}
              <div className="info-row">
                <span className="info-k">Mã đơn hàng</span>
                <span className="info-v">{info.orderId}</span>
              </div>
              {info.transId && (
                <div className="info-row">
                  <span className="info-k">Mã GD MoMo</span>
                  <span className="info-v">{info.transId}</span>
                </div>
              )}
              {info.payType && (
                <div className="info-row">
                  <span className="info-k">Hình thức</span>
                  <span className="info-v">{info.payType}</span>
                </div>
              )}
            </div>
          )}

          {status === 'failed' && info?.resultCode && (
            <div className="info-box">
              <div className="info-row">
                <span className="info-k">Mã lỗi</span>
                <span className="info-v">{info.resultCode}</span>
              </div>
              <div className="info-row">
                <span className="info-k">Đơn hàng</span>
                <span className="info-v">{info.orderId}</span>
              </div>
            </div>
          )}

          {status !== 'loading' && (
            <Link href="/" className="btn">
              ← {status === 'failed' ? 'Thử thanh toán lại' : 'Về trang thanh toán'}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}