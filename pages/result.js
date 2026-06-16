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
    loading: { spin: true,  title: 'Đang xác nhận…',          sub: 'Vui lòng không đóng trang',              accent: '#ae0070', bg: '#ae0070' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',   sub: 'Giao dịch đã được MoMo xác nhận',        accent: '#16a34a', bg: '#16a34a' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',       sub: null,                                      accent: '#dc2626', bg: '#dc2626' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',        sub: 'MoMo chưa phản hồi, kiểm tra lại sau',   accent: '#d97706', bg: '#d97706' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng',  sub: 'Link không hợp lệ hoặc đã hết hạn',      accent: '#dc2626', bg: '#dc2626' },
  }
  const m = META[status] || META.loading

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" /> 
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --mm: #ae0070;
          --mm-border: #e8c4d8;
          --text: #180a12;
          --muted: #7a4060;
          --surface: #ffffff;
          --surface2: #fdf5f9;
          --bg: #f7f0f4;
        }

        html, body { height: 100%; }

        body {
          font-family: 'Be Vietnam Pro', sans-serif;
          background: var(--bg);
          min-height: 100vh;
        }

        /* Full-screen two-column: left = status panel, right = detail */
        .layout {
          display: grid;
          grid-template-columns: 1fr 420px;
          min-height: 100vh;
        }

        /* LEFT status panel */
        .status-panel {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 48px 56px;
          position: relative;
          overflow: hidden;
          transition: background .4s;
        }

        .status-panel .sp-bg {
          position: absolute; inset: 0;
          transition: background .4s;
        }

        .status-inner {
          position: relative; z-index: 1;
          text-align: center; max-width: 360px;
        }

        /* icon ring */
        .icon-ring {
          width: 96px; height: 96px; border-radius: 50%;
          margin: 0 auto 24px;
          display: flex; align-items: center; justify-content: center;
          font-size: 38px; font-weight: 900;
          background: rgba(255,255,255,.15);
          border: 2px solid rgba(255,255,255,.25);
          animation: popIn .4s cubic-bezier(.34,1.56,.64,1) both;
          color: #fff;
        }
        @keyframes popIn { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }

        .spin-ring {
          width: 96px; height: 96px; border-radius: 50%;
          margin: 0 auto 24px;
          border: 4px solid rgba(255,255,255,.2);
          border-top-color: rgba(255,255,255,.85);
          animation: rot .7s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        .s-title {
          font-size: 34px; font-weight: 900; color: #fff;
          line-height: 1.2; margin-bottom: 10px;
        }
        .s-sub {
          font-size: 14px; color: rgba(255,255,255,.7);
          line-height: 1.65;
        }

        /* MoMo brand badge at top */
        .brand-badge {
          position: absolute; top: 28px; left: 32px;
          display: flex; align-items: center; gap: 10px;
          z-index: 1;
        }
        .bb-mark {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,255,255,.15);
          border: 1px solid rgba(255,255,255,.2);
          display: flex; align-items: center; justify-content: center;
        }
        .bb-name { font-size: 13px; font-weight: 800; color: #fff; }
        .bb-sub  { font-size: 10px; color: rgba(255,255,255,.55); margin-top: 1px; }

        /* RIGHT detail panel */
        .detail-panel {
          background: var(--surface);
          border-left: 1px solid var(--mm-border);
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 48px 40px;
        }

        .detail-title {
          font-size: 16px; font-weight: 900; color: var(--text);
          margin-bottom: 20px;
        }

        /* Info rows */
        .info-box {
          background: var(--surface2);
          border: 1.5px solid var(--mm-border);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 13px 18px; font-size: 13px;
          border-bottom: 1px solid var(--mm-border);
        }
        .info-row:last-child { border-bottom: none; }
        .info-k { color: var(--muted); font-weight: 500; }
        .info-v { font-weight: 700; color: var(--text); max-width: 55%; text-align: right; word-break: break-all; font-size: 13px; }
        .info-v.big { font-size: 22px; color: var(--mm); }

        /* Back button */
        .btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 15px;
          border-radius: 12px; border: none;
          background: linear-gradient(135deg, #ae0070, #c4007e);
          color: #fff;
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 15px; font-weight: 800;
          text-decoration: none; cursor: pointer;
          box-shadow: 0 6px 20px rgba(174,0,112,.32);
          transition: opacity .14s, transform .14s;
        }
        .btn:hover { opacity: .9; transform: translateY(-1px); }
        .btn:active { transform: scale(.99); }

        .detail-empty {
          text-align: center; padding: 32px 0;
        }
        .detail-empty p { font-size: 13px; color: var(--muted); margin-bottom: 24px; }

        /* Mobile: stack */
        @media (max-width: 780px) {
          .layout { grid-template-columns: 1fr; min-height: unset; }
          .status-panel {
            min-height: 44vh;
            padding: 40px 28px 44px;
          }
          .brand-badge { top: 20px; left: 20px; }
          .detail-panel {
            border-left: none;
            border-top: 1px solid var(--mm-border);
            padding: 32px 24px;
            justify-content: flex-start;
          }
        }
      `}</style>

      <div className="layout">
        {/* Left: status */}
        <div className="status-panel" style={{ background: `linear-gradient(160deg, ${m.bg}dd 0%, ${m.bg}aa 100%)` }}>
          {/* fallback: behind gradient the status color */}
          <div className="sp-bg" style={{ background: m.spin
            ? 'linear-gradient(160deg, #ae0070 0%, #7a0052 100%)'
            : `linear-gradient(160deg, ${m.bg} 0%, ${m.bg}bb 100%)` }} />

          {/* Brand */}
          <div className="brand-badge">
            <div className="bb-mark">
              <svg viewBox="0 0 30 30" fill="none" width="22" height="22">
                <circle cx="9.5" cy="15" r="6" fill="white" />
                <circle cx="20.5" cy="15" r="6" fill="white" />
                <circle cx="9.5" cy="15" r="3" fill="#ae0070" />
                <circle cx="20.5" cy="15" r="3" fill="#ae0070" />
              </svg>
            </div>
            <div>
              <div className="bb-name">MoMo</div>
              <div className="bb-sub">Kết quả giao dịch</div>
            </div>
          </div>

          <div className="status-inner">
            {m.spin
              ? <div className="spin-ring" />
              : <div className="icon-ring">{m.icon}</div>
            }
            <div className="s-title">{m.title}</div>
            <div className="s-sub">
              {m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}
            </div>
          </div>
        </div>

        {/* Right: details */}
        <div className="detail-panel">
          {(status === 'success' || status === 'failed') && (
            <div className="detail-title">Chi tiết giao dịch</div>
          )}

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
              {info.message && (
                <div className="info-row">
                  <span className="info-k">Lý do</span>
                  <span className="info-v">{info.message}</span>
                </div>
              )}
            </div>
          )}

          {status === 'loading' && (
            <div className="detail-empty">
              <p>Đang tải thông tin giao dịch…</p>
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
