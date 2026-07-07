// pages/pay/[orderId].js
//
// TRANG THANH TOÁN RIÊNG (public, dành cho khách hàng)
// ───────────────────────────────────────────────────────────────────────
// Đây là trang KHÔNG thuộc khu vực admin — khách hàng mở qua 1 link dạng
// {TX_BASE_URL}/pay/{orderId} (link này được copy ra từ trang tạo giao dịch,
// CHỈ áp dụng cho giao dịch loại P2P). Trang tự poll trạng thái + hiện QR
// có sẵn (dùng lại đúng 2 API cũ: /api/momo/status và /api/momo/qr-extract),
// không đụng vào logic tạo/xử lý giao dịch hiện tại.
//
// Phần "chọn ngân hàng để mở app" dùng dịch vụ deeplink công khai của
// VietQR.io (https://dl.vietqr.io/pay?app=<mã>) — dịch vụ này tự mở đúng
// app ngân hàng nếu đã cài, hoặc đưa về App Store/CH Play nếu chưa cài.
// Lưu ý thật: hiện chưa ngân hàng nào cho phép tự động điền sẵn số tiền/
// nội dung khi mở app theo cách này (kể cả VNPAY cũng chỉ mở app, không tự
// điền) — khách vẫn cần tự quét QR hiển thị ở trên hoặc quét thủ công trong
// app. Không dùng logo thật của ngân hàng (bản quyền/thương hiệu), thay vào
// đó dùng huy hiệu chữ viết tắt tự thiết kế.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const POLL_MS = 2000

function formatAmount(raw) {
  const n = parseInt(raw, 10)
  if (!n) return '0'
  return n.toLocaleString('en-US')
}

// ─── DANH SÁCH NGÂN HÀNG (mã app theo VietQR deeplink) ──────────────
// Đổi/thêm/bớt tùy nhu cầu — mã "code" phải đúng theo api.vietqr.io/v2/*-app-deeplinks
const BANKS = [
  { code: 'vcb',     short: 'VCB',   name: 'Vietcombank',  color: '#00693c' },
  { code: 'vba',     short: 'AGB',   name: 'Agribank',     color: '#7a1f2b' },
  { code: 'bidv',    short: 'BIDV',  name: 'BIDV',         color: '#00558c' },
  { code: 'icb',     short: 'ICB',   name: 'VietinBank',   color: '#0a3a82' },
  { code: 'vpb',     short: 'VPB',   name: 'VPBank',       color: '#1a7a3c' },
  { code: 'scb',     short: 'SCB',   name: 'SCB',          color: '#c0272d' },
  { code: 'vietbank',short: 'VBB',   name: 'VietBank',     color: '#b8860b' },
  { code: 'eib',     short: 'EIB',   name: 'Eximbank',     color: '#f47b20' },
  { code: 'nab',     short: 'NAB',   name: 'Nam A Bank',   color: '#0067ac' },
  { code: 'bvb',     short: 'BVB',   name: 'BaoViet Bank', color: '#b8860b' },
  { code: 'hdb',     short: 'HDB',   name: 'HDBank',       color: '#e2001a' },
  { code: 'sgicb',   short: 'SGB',   name: 'SaigonBank',   color: '#004b93' },
  { code: 'klb',     short: 'KLB',   name: 'KienlongBank', color: '#f47b20' },
  { code: 'vab',     short: 'VAB',   name: 'VietABank',    color: '#c0272d' },
  { code: 'vib-2',   short: 'VIB',   name: 'VIB',          color: '#00539f' },
  { code: 'acb',     short: 'ACB',   name: 'ACB',          color: '#0033a0' },
  { code: 'wvn',     short: 'WOORI', name: 'Woori Bank',   color: '#0057a8' },
  { code: 'shbvn',   short: 'SHB',   name: 'Shinhan Bank', color: '#0033a0' },
]

export default function PayOrderPage() {
  const router = useRouter()
  const { orderId } = router.query

  const [status, setStatus] = useState('PENDING')
  const [amount, setAmount] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const pollRef = useRef(null)
  const qrTick = useRef(0)
  const [qrBust, setQrBust] = useState(0)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/momo/status?orderId=${encodeURIComponent(orderId)}`)
        if (res.status === 404) {
          if (!cancelled) { setNotFound(true); setLoading(false) }
          clearInterval(pollRef.current)
          return
        }
        const data = await res.json()
        if (cancelled) return
        const s = data.status || 'PENDING'
        setStatus(s)
        if (data.amount) setAmount(data.amount)
        setMessage(
          s === 'PAID' ? '✓ Thanh toán thành công!' :
          s === 'EXPIRED' ? '⚠ Mã QR đã hết hạn, vui lòng liên hệ để được tạo lại.' :
          s === 'FAILED' ? `✗ Giao dịch thất bại${data.message ? `: ${data.message}` : ''}` :
          ''
        )
        setLoading(false)
        if (s !== 'PENDING') clearInterval(pollRef.current)
      } catch (e) {
        if (!cancelled) setLoading(false)
      }
    }

    poll()
    pollRef.current = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(pollRef.current) }
  }, [orderId])

  // QR ảnh đôi khi cache cứng ở vài trình duyệt di động — refresh nhẹ mỗi 15s khi còn PENDING
  useEffect(() => {
    if (status !== 'PENDING') return
    const id = setInterval(() => {
      qrTick.current += 1
      setQrBust(qrTick.current)
    }, 15000)
    return () => clearInterval(id)
  }, [status])

  function openBankApp(code) {
    window.location.href = `https://dl.vietqr.io/pay?app=${code}`
  }

  const isPending = status === 'PENDING'
  const isPaid = status === 'PAID'
  const isDone = status === 'PAID' || status === 'FAILED' || status === 'EXPIRED'

  return (
    <>
      <Head>
        <title>Thanh toán {orderId ? `#${orderId}` : ''}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #__next { margin: 0; padding: 0; min-height: 100%; width: 100%; font-family: 'Outfit', -apple-system, sans-serif; background: #f4ede9; }
        :root {
          --mm: #ae0070; --mm-light: rgba(174,0,112,0.08); --mm-mid: rgba(174,0,112,0.15);
          --paper: #fffaf6; --bg: #f4ede9; --border: #ece1e6; --text: #1a0f16; --muted: #9c8094;
          --mono: 'JetBrains Mono', ui-monospace, monospace;
        }

        .pay-shell { min-height: 100dvh; background: var(--bg); display: flex; justify-content: center; padding: 0 0 40px; }
        .pay-page { width: 100%; max-width: 440px; background: var(--bg); }

        .pay-topbar {
          display: flex; align-items: center; gap: 12px; padding: 16px 18px;
          position: sticky; top: 0; background: var(--bg); z-index: 5;
        }
        .pay-back {
          width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border);
          background: var(--paper); display: flex; align-items: center; justify-content: center;
          color: var(--text); cursor: pointer; flex-shrink: 0;
        }
        .pay-topbar-title { font-size: 15px; font-weight: 800; color: var(--text); }

        .pay-card {
          margin: 0 18px 18px; background: var(--paper); border-radius: 18px; border: 1px solid var(--border);
          box-shadow: 0 4px 16px rgba(26,15,22,0.06); overflow: hidden; position: relative;
        }
        .pay-card-notch { position: absolute; top: 96px; width: 18px; height: 18px; border-radius: 50%; background: var(--bg); border: 1px solid var(--border); z-index: 1; }
        .pay-card-notch.left { left: -10px; }
        .pay-card-notch.right { right: -10px; }

        .pay-amount-block { padding: 22px 20px 16px; text-align: center; }
        .pay-eyebrow { font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mm); margin-bottom: 8px; }
        .pay-amount { font-family: var(--mono); font-size: 34px; font-weight: 800; color: var(--text); line-height: 1.1; }
        .pay-order-id { margin-top: 6px; font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--muted); }

        .pay-status-row { display: flex; justify-content: center; margin-top: 12px; }
        .pay-status { font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 999px; }
        .pay-status.pending { background: rgba(214,158,46,0.15); color: #b9770e; }
        .pay-status.paid { background: rgba(39,174,96,0.15); color: #1e8449; }
        .pay-status.failed { background: rgba(192,57,43,0.15); color: #c0392b; }
        .pay-status.expired { background: rgba(120,120,120,0.15); color: #6b6b6b; }

        .pay-perf { height: 0; border-top: 2px dashed var(--border); margin: 4px 20px 0; }

        .pay-qr-wrap { display: flex; justify-content: center; padding: 22px 20px 8px; }
        .pay-qr-wrap img { width: 220px; height: 220px; border-radius: 12px; border: 1px solid var(--border); background: #fff; }

        .pay-msg { margin: 6px 20px 18px; padding: 10px 12px; border-radius: 10px; background: #f2eaf0; color: var(--text); font-size: 12.5px; font-weight: 600; text-align: center; }
        .pay-msg.ok { background: rgba(39,174,96,0.1); color: #1e8449; }
        .pay-msg.err { background: rgba(192,57,43,0.1); color: #c0392b; }

        .pay-success { padding: 40px 24px; text-align: center; }
        .pay-success-icon {
          width: 64px; height: 64px; border-radius: 50%; background: rgba(39,174,96,0.12); color: #1e8449;
          display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
        }
        .pay-success-title { font-size: 17px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
        .pay-success-desc { font-size: 12.5px; color: var(--muted); }

        .pay-hint {
          margin: 0 18px 14px; font-size: 12.5px; color: var(--muted); line-height: 1.6; padding: 0 2px;
        }
        .pay-hint b { color: var(--text); }

        .pay-section-label {
          margin: 4px 18px 10px; font-size: 11px; font-weight: 700; color: var(--muted);
          text-transform: uppercase; letter-spacing: 0.05em;
        }

        .bank-grid {
          margin: 0 18px 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
        }
        .bank-btn {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          background: var(--paper); border: 1px solid var(--border); border-radius: 12px;
          padding: 12px 6px; cursor: pointer; transition: border-color 0.15s, transform 0.1s;
        }
        .bank-btn:active { transform: scale(0.96); }
        .bank-btn:hover { border-color: var(--mm-mid); }
        .bank-badge {
          width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: 10.5px; font-weight: 800; color: #fff; letter-spacing: 0.01em;
        }
        .bank-label { font-size: 10px; font-weight: 700; color: var(--text); text-align: center; line-height: 1.25; }

        .pay-footnote { margin: 6px 18px 0; font-size: 11px; color: var(--muted); text-align: center; line-height: 1.5; }

        .pay-loading, .pay-notfound {
          min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px; color: var(--muted); font-size: 13px; font-weight: 600; text-align: center; padding: 40px 20px;
        }
        .spinner { width: 18px; height: 18px; border: 2.5px solid var(--mm-mid); border-top-color: var(--mm); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="pay-shell">
        <div className="pay-page">
          <div className="pay-topbar">
            <button className="pay-back" onClick={() => router.back()} aria-label="Quay lại">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="pay-topbar-title">Thanh toán</span>
          </div>

          {loading ? (
            <div className="pay-loading"><div className="spinner" /> Đang tải thông tin giao dịch…</div>
          ) : notFound ? (
            <div className="pay-notfound">Không tìm thấy giao dịch này.<br />Liên kết có thể đã hết hạn hoặc sai.</div>
          ) : isPaid ? (
            <div className="pay-card">
              <div className="pay-success">
                <div className="pay-success-icon">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <div className="pay-success-title">Thanh toán thành công</div>
                <div className="pay-success-desc">
                  {amount ? `${formatAmount(amount)}₫ — ` : ''}Đơn <span style={{ fontFamily: 'var(--mono)' }}>{orderId}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="pay-card">
              <div className="pay-card-notch left" />
              <div className="pay-card-notch right" />
              <div className="pay-amount-block">
                <div className="pay-eyebrow">Số tiền cần thanh toán</div>
                <div className="pay-amount">{amount ? `${formatAmount(amount)}₫` : '—'}</div>
                <div className="pay-order-id">Đơn hàng {orderId}</div>
                <div className="pay-status-row">
                  <span className={`pay-status ${status.toLowerCase()}`}>
                    {isPending ? 'Đang chờ thanh toán' : status === 'FAILED' ? 'Thất bại' : 'Hết hạn'}
                  </span>
                </div>
              </div>

              <div className="pay-perf" />

              {isPending && (
                <div className="pay-qr-wrap">
                  <img
                    src={`/api/momo/qr-extract?orderId=${encodeURIComponent(orderId)}${qrBust ? `&t=${qrBust}` : ''}`}
                    alt="QR thanh toán"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                </div>
              )}

              {message && <div className={`pay-msg${isPaid ? ' ok' : isDone ? ' err' : ''}`}>{message}</div>}

              {isPending && (
                <>
                  <div className="pay-hint">
                    Mở <b>App hỗ trợ</b> để quét mã QR ở trên, hoặc bấm vào ngân hàng bạn đang dùng bên dưới để mở nhanh ứng dụng.
                  </div>
                  <div className="pay-section-label">Chọn ngân hàng của bạn</div>
                  <div className="bank-grid">
                    {BANKS.map(b => (
                      <button key={b.code} className="bank-btn" onClick={() => openBankApp(b.code)}>
                        <span className="bank-badge" style={{ background: b.color }}>{b.short}</span>
                        <span className="bank-label">{b.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pay-footnote">
                    Bấm vào ngân hàng sẽ mở app tương ứng nếu đã cài (hoặc đưa tới App Store/CH Play nếu chưa cài).<br />
                    Bạn vẫn cần tự quét mã QR trong app — hệ thống ngân hàng chưa hỗ trợ tự điền số tiền.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}