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
          if (data.status === 'PAID') { setStatus('success'); setInfo(data); clearInterval(poll) }
          else if (data.status === 'FAILED') { setStatus('failed'); setInfo(data); clearInterval(poll) }
          else if (++attempts >= 10) { setStatus('pending'); clearInterval(poll) }
        } catch { clearInterval(poll) }
      }, 2000)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const states = {
    loading: { icon: null, spin: true,  title: 'Đang xác nhận…',       sub: 'Vui lòng chờ trong giây lát',           color: '#d81b60' },
    success: { icon: '✓',  spin: false, title: 'Thanh toán thành công', sub: 'Giao dịch đã được xác nhận bởi MoMo',   color: '#4ade80' },
    failed:  { icon: '✕',  spin: false, title: 'Giao dịch thất bại',    sub: info?.message || 'Giao dịch không thành công', color: '#f87171' },
    pending: { icon: '⏳', spin: false, title: 'Đang chờ xác nhận',     sub: 'MoMo chưa phản hồi. Kiểm tra lại sau', color: '#fbbf24' },
    error:   { icon: '!',  spin: false, title: 'Không tìm thấy đơn',    sub: 'Link không hợp lệ hoặc đã hết hạn',    color: '#f87171' },
  }

  const s = states[status] || states.loading

  return (
    <>
      <Head>
        <title>Kết quả giao dịch</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --pink: #d81b60;
          --bg: #0f0a0d;
          --surface: #1a1117;
          --surface2: #221520;
          --border: rgba(216,27,96,.2);
          --border2: rgba(255,255,255,.06);
          --text: #f5eef2;
          --muted: #9e7a8e;
        }

        body {
          font-family: 'Inter', sans-serif;
          background: var(--bg);
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 20px; color: var(--text);
        }
        body::before {
          content: '';
          position: fixed; top: -200px; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(216,27,96,.12) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }

        .wrap {
          width: 100%; max-width: 400px;
          position: relative; z-index: 1;
        }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px; padding: 36px 28px;
          box-shadow: 0 0 0 1px rgba(255,255,255,.03), 0 24px 48px rgba(0,0,0,.4);
          text-align: center;
        }

        /* ── Status icon ── */
        .icon-wrap {
          width: 72px; height: 72px;
          border-radius: 50%; margin: 0 auto 20px;
          display: flex; align-items: center; justify-content: center;
          font-size: 28px; font-weight: 900;
          animation: pop .4s cubic-bezier(.34,1.56,.64,1) both;
          font-family: 'Space Grotesk', sans-serif;
        }
        @keyframes pop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }

        .spin-wrap {
          width: 72px; height: 72px; margin: 0 auto 20px;
          border: 3px solid rgba(216,27,96,.2);
          border-top-color: var(--pink);
          border-radius: 50%;
          animation: rot .7s linear infinite;
        }
        @keyframes rot { to { transform: rotate(360deg) } }

        .status-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 22px; font-weight: 700;
          margin-bottom: 6px;
        }
        .status-sub {
          font-size: 13px; color: var(--muted);
          margin-bottom: 28px; line-height: 1.5;
        }

        /* ── Info table ── */
        .info-table {
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 14px; padding: 4px 0;
          margin-bottom: 24px; text-align: left;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 11px 16px;
          border-bottom: 1px solid var(--border2);
          font-size: 13px;
        }
        .info-row:last-child { border-bottom: none; }
        .info-k { color: var(--muted); font-weight: 500; }
        .info-v { font-weight: 600; color: var(--text); max-width: 55%; text-align: right; word-break: break-all; font-size: 12px; }
        .info-v.big { font-size: 18px; color: var(--pink); font-family: 'Space Grotesk', sans-serif; }

        /* ── Action btn ── */
        .btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; padding: 14px;
          border-radius: 14px; border: none;
          background: var(--pink); color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 15px; font-weight: 700;
          text-decoration: none; cursor: pointer;
          transition: all .2s;
          box-shadow: 0 8px 24px rgba(216,27,96,.35);
          position: relative; overflow: hidden;
        }
        .btn::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.12) 0%, transparent 50%);
          pointer-events: none;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(216,27,96,.45); }

        @media(max-width:480px) { .card { padding: 28px 20px; } }
      `}</style>

      <div className="wrap">
        <div className="card">
          {s.spin
            ? <div className="spin-wrap" />
            : (
              <div className="icon-wrap" style={{
                background: `${s.color}18`,
                border: `1.5px solid ${s.color}40`,
                color: s.color,
              }}>
                {s.icon}
              </div>
            )
          }

          <div className="status-title" style={{ color: s.spin ? 'var(--text)' : s.color }}>
            {s.title}
          </div>
          <div className="status-sub">{s.sub}</div>

          {status === 'success' && info && (
            <div className="info-table">
              {info.amount && (
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
            <div className="info-table">
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
              {status === 'failed' ? '← Thử lại' : '← Về trang thanh toán'}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}