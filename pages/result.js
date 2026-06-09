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
          else if (data.status === 'FAILED') { setStatus('failed');  setInfo(data); clearInterval(poll) }
          else if (++attempts >= 10)     { setStatus('pending'); clearInterval(poll) }
        } catch { clearInterval(poll) }
      }, 2000)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const META = {
    loading: { spin: true,  title: 'Đang xác nhận giao dịch…',  sub: 'Vui lòng không đóng trang',          accent: '#a50064' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',     sub: 'Giao dịch đã được MoMo xác nhận',    accent: '#16a34a' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',         sub: null,                                  accent: '#dc2626' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',          sub: 'MoMo chưa phản hồi. Kiểm tra lại sau', accent: '#d97706' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng',    sub: 'Link không hợp lệ hoặc đã hết hạn',  accent: '#dc2626' },
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
          --mm: #a50064; --mm-d: #8a0054;
          --mm-soft: #f9eaf4; --mm-border: #e8c4d8;
          --text: #1a0a10; --muted: #7a4060;
          --bg: #f5f0f3; --surface: #ffffff; --surface2: #fdf0f8;
        }
        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: var(--bg); min-height: 100vh;
          display: flex; align-items: center; justify-content: center; padding: 32px 16px;
        }
        .wrap { width: 100%; max-width: 400px; }

        .card {
          background: var(--surface);
          border-radius: 16px;
          box-shadow: 0 2px 16px rgba(165,0,100,.10);
          overflow: hidden;
        }

        /* MoMo header bar */
        .card-header {
          background: var(--mm);
          padding: 20px 24px;
          display: flex; align-items: center; gap: 10px;
        }
        .card-header svg { width: 28px; height: 28px; flex-shrink: 0; }
        .card-header .ch-name { font-size: 15px; font-weight: 800; color: #fff; }
        .card-header .ch-sub  { font-size: 11px; color: rgba(255,255,255,.7); margin-top: 1px; }

        .card-body { padding: 32px 24px 28px; text-align: center; }

        /* Status icon */
        .icon-ring {
          width: 72px; height: 72px; border-radius: 50%;
          margin: 0 auto 18px;
          display: flex; align-items: center; justify-content: center;
          font-size: 28px; font-weight: 900;
          animation: popIn .35s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes popIn { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }

        .spin-ring {
          width: 72px; height: 72px; border-radius: 50%;
          margin: 0 auto 18px;
          border: 4px solid var(--mm-soft);
          border-top-color: var(--mm);
          animation: rot .7s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        .s-title { font-size: 21px; font-weight: 900; margin-bottom: 6px; }
        .s-sub   { font-size: 13px; color: var(--muted); margin-bottom: 24px; line-height: 1.55; }

        /* Info rows */
        .info-box {
          background: var(--surface2);
          border: 1.5px solid var(--mm-border);
          border-radius: 12px; margin-bottom: 22px;
          overflow: hidden; text-align: left;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 11px 16px; font-size: 13px;
          border-bottom: 1px solid var(--mm-border);
        }
        .info-row:last-child { border-bottom: none; }
        .info-k { color: var(--muted); font-weight: 500; }
        .info-v { font-weight: 700; color: var(--text); font-size: 12px; max-width: 55%; text-align: right; word-break: break-all; }
        .info-v.big { font-size: 20px; color: var(--mm); }

        /* Back button */
        .btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px;
          border-radius: 10px; border: none;
          background: var(--mm); color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 15px; font-weight: 800;
          text-decoration: none; cursor: pointer;
          box-shadow: 0 4px 14px rgba(165,0,100,.32);
          transition: background .14s, transform .14s, box-shadow .14s;
        }
        .btn:hover { background: var(--mm-d); transform: translateY(-1px); box-shadow: 0 7px 20px rgba(165,0,100,.38); }
        .btn:active { transform: scale(.99); }

        @media(max-width:480px) { .card-body { padding: 24px 18px 22px; } }
      `}</style>

      <div className="wrap">
        <div className="card">
          <div className="card-header">
            <svg viewBox="0 0 28 28" fill="none">
              <circle cx="9" cy="14" r="5.5" fill="white" />
              <circle cx="19" cy="14" r="5.5" fill="white" />
              <circle cx="9" cy="14" r="2.8" fill="#a50064" />
              <circle cx="19" cy="14" r="2.8" fill="#a50064" />
            </svg>
            <div>
              <div className="ch-name">Cổng thanh toán MoMo</div>
              <div className="ch-sub">Kết quả giao dịch</div>
            </div>
          </div>

          <div className="card-body">
            {m.spin
              ? <div className="spin-ring" />
              : (
                <div className="icon-ring" style={{
                  background: `${m.accent}18`,
                  border: `2px solid ${m.accent}30`,
                  color: m.accent,
                }}>
                  {m.icon}
                </div>
              )
            }

            <div className="s-title" style={{ color: m.spin ? 'var(--mm)' : m.accent }}>
              {m.title}
            </div>
            <div className="s-sub">
              {m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}
            </div>

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
      </div>
    </>
  )
}