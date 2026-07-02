// pages/result.js
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const AUTO_CLOSE_SEC = 15

// ─── Helpers ────────────────────────────────────────────────────────────────

function notifyOtherTabs(orderId, status) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return
  try {
    const ch = new BroadcastChannel('momo-result')
    ch.postMessage({ type: 'momo-result-done', orderId, status })
    ch.close()
  } catch (e) {
    console.error('BroadcastChannel error:', e)
  }
}

async function fetchFullInfo(orderId) {
  const [momoFull, ourRecord] = await Promise.all([
    fetch('/api/momo/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).then(r => r.json()).catch(() => null),
    fetch(`/api/momo/status?orderId=${encodeURIComponent(orderId)}`)
      .then(r => r.json()).catch(() => null),
  ])
  if (!momoFull && !ourRecord) return null
  return { ...(ourRecord || {}), ...(momoFull || {}) }
}

const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

const fmtTime = val => {
  if (!val) return null
  const d = new Date(typeof val === 'number' || /^\d+$/.test(val) ? parseInt(val) : val)
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString('vi-VN')
}

const PAY_TYPE_LABEL = { wallet: 'Ví MoMo', napas: 'Thẻ ATM / Napas', credit: 'Thẻ tín dụng', pos: 'POS Scan' }

// ─── Component ──────────────────────────────────────────────────────────────

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading') // loading | success | failed | pending | error
  const [info, setInfo]     = useState(null)
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SEC)
  const resolvedRef = useRef(false)
  const countdownRef = useRef(null)

  // ── Auto-close countdown cho mọi trạng thái đã xử lý xong (trừ loading) ──
  // Đây là trang dành cho KHÁCH (không phải admin), nên không cần CTA dẫn về
  // các trang quản trị — chỉ cần tự đóng tab sau khi hiển thị kết quả.
  useEffect(() => {
    if (status === 'loading') return
    setCountdown(AUTO_CLOSE_SEC)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          if (typeof window !== 'undefined') window.close()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [status])

  // ── Main logic: đọc query / poll ──
  useEffect(() => {
    if (!router.isReady) return
    if (resolvedRef.current) return

    const fullQuery = { ...router.query }
    let { orderId, resultCode, transId, amount, payType, message } = fullQuery
    const code = parseInt(resultCode)

    if (!orderId && typeof window !== 'undefined') {
      orderId = sessionStorage.getItem('momo_current_order_id')
    }
    if (!orderId) { setStatus('error'); resolvedRef.current = true; return }

    const cleanUrl = () => setTimeout(() => router.replace('/result', undefined, { shallow: true }), 500)

    const resolve = (st, infoData) => {
      resolvedRef.current = true
      setStatus(st)
      setInfo(infoData)
      notifyOtherTabs(orderId, st === 'success' ? 'success' : 'failed')
      fetchFullInfo(orderId).then(full => { if (full) setInfo(prev => ({ ...prev, ...full })) })
    }

    if (resultCode !== undefined) {
      if (typeof window !== 'undefined') sessionStorage.setItem('momo_current_order_id', orderId)
      const infoData = { orderId, transId, amount: parseInt(amount), payType, message, resultCode: code }
      resolve(code === 0 ? 'success' : 'failed', infoData)
      fetch('/api/momo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fullQuery, resultCode: code === 0 ? 0 : code }),
      }).finally(cleanUrl)
    } else {
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res  = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID') {
            resolve('success', data); clearInterval(poll); cleanUrl()
          } else if (data.status === 'FAILED') {
            resolve('failed', data); clearInterval(poll); cleanUrl()
          } else if (data.status === 'EXPIRED') {
            resolvedRef.current = true; setStatus('expired'); setInfo(data); clearInterval(poll); cleanUrl()
          } else if (++attempts >= 10) {
            resolvedRef.current = true; setStatus('pending'); clearInterval(poll); cleanUrl()
          }
        } catch {
          resolvedRef.current = true; clearInterval(poll); cleanUrl()
        }
      }, 1500)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  // ─── Render ───────────────────────────────────────────────────────────────

  const isSuccess = status === 'success'
  const isFailed  = status === 'failed'

  const accentColor = isSuccess ? '#16a34a' : isFailed ? '#dc2626' : status === 'pending' ? '#d97706' : '#ae0070'

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/result.png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Be Vietnam Pro', sans-serif; }
          html, body { height: 100%; background: #f4edf1; }

          @keyframes rot    { to { transform: rotate(360deg); } }
          @keyframes pop    { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes slideup{ from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
          @keyframes om1    { 0%{transform:translate(0,0)scale(1)}50%{transform:translate(8vw,4vh)scale(1.15)}100%{transform:translate(-4vw,7vh)scale(.9)} }
          @keyframes om2    { 0%{transform:translate(0,0)scale(1.1)}50%{transform:translate(-10vw,-6vh)scale(.9)}100%{transform:translate(6vw,4vh)scale(1.1)} }
          @keyframes om3    { 0%{transform:translate(0,0)scale(.9)}50%{transform:translate(-5vw,7vh)scale(1.2)}100%{transform:translate(7vw,-4vh)scale(1)} }
          @keyframes shrink { from { width: 100%; } to { width: 0%; } }

          .page   { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow: hidden; }
          .blob   { position: absolute; border-radius: 50%; filter: blur(55px); pointer-events: none; z-index: 0; }
          .card   { position: relative; z-index: 1; width: 100%; max-width: 420px; background: #fff; border-radius: 24px; box-shadow: 0 20px 60px rgba(174,0,112,.18); overflow: hidden; animation: pop .35s ease both; }
          .topbar { height: 4px; background: linear-gradient(90deg, #ae0070, #d6409f); }
          .body   { padding: 28px 24px 24px; }

          .spin-ring { width: 44px; height: 44px; border: 4px solid #f0d6e8; border-top-color: #ae0070; border-radius: 50%; margin: 0 auto 16px; animation: rot .8s linear infinite; }

          .icon-wrap { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }

          .amount-box { background: #faf4f8; border-radius: 16px; padding: 16px; text-align: center; margin: 16px 0; }
          .amount-box .label { font-size: 12px; color: #9b4470; font-weight: 600; margin-bottom: 4px; }
          .amount-box .value { font-size: 28px; font-weight: 900; color: #1a0413; }
          .amount-box .value span { font-size: 16px; font-weight: 700; margin-left: 2px; }

          .info-list { margin: 16px 0; }
          .info-row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f4e6ee; font-size: 13px; }
          .info-row:last-child { border-bottom: none; }
          .info-row .k { color: #9b4470; flex-shrink: 0; padding-top: 6px; }
          .info-row .v { color: #1a0413; font-weight: 600; text-align: right; word-break: break-all; min-width: 0; }
          .info-row .v.mono { font-family: monospace; font-size: 12px; }

          .v-wrap { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; min-width: 0; }

          .copy-btn {
            flex-shrink: 0; width: 32px; height: 32px;
            display: inline-flex; align-items: center; justify-content: center;
            border: none; border-radius: 9px; background: #faf0f6; color: #ae0070;
            cursor: pointer; transition: background .15s ease, color .15s ease, transform .1s ease;
          }
          .copy-btn:hover  { background: #f4d9ec; }
          .copy-btn:active { transform: scale(.88); }
          .copy-btn.copied { background: #dcfce7; color: #16a34a; }
          .copy-btn:focus-visible { outline: 2px solid #ae0070; outline-offset: 2px; }

          .reveal { animation: slideup .35s ease both; }

          /* ── Small phones (≤360px) — tighten spacing so nothing feels cramped ── */
          @media (max-width: 360px) {
            .page { padding: 14px; }
            .body { padding: 24px 18px 20px; }
            .amount-box .value { font-size: 25px; }
          }

          /* ── Tablet / desktop — a little more breathing room, same identity ── */
          @media (min-width: 640px) {
            .card { max-width: 460px; }
            .body { padding: 34px 32px 28px; }
            .amount-box .value { font-size: 30px; }
            .copy-btn:hover { background: #efc9e4; }
          }

          @media (prefers-reduced-motion: reduce) {
            .blob, .card, .reveal { animation: none !important; }
          }

          .err-box { background: #fef2f2; border-radius: 14px; padding: 14px; margin: 16px 0; }
          .err-box .err-code { font-size: 12px; font-weight: 700; color: #dc2626; margin-bottom: 4px; }
          .err-box .err-msg  { font-size: 13px; color: #7f1d1d; line-height: 1.5; }

          /* countdown bar */
          .cdown-wrap { margin-bottom: 16px; }
          .cdown-text { font-size: 12px; color: #9b4470; text-align: center; margin-bottom: 6px; font-weight: 600; }
          .cdown-bar  { height: 3px; border-radius: 2px; background: #f0d6e8; overflow: hidden; }
          .cdown-fill { height: 100%; background: #ae0070; border-radius: 2px; }

          /* pending/error/loading */
          .center-msg { text-align: center; padding: 24px 0 8px; }
          .center-msg .icon { font-size: 40px; margin-bottom: 12px; }
          .center-msg h2  { font-size: 20px; font-weight: 800; color: #1a0413; margin-bottom: 8px; }
          .center-msg p   { font-size: 13px; color: #614655; line-height: 1.6; }

          /* logo row */
          .logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
          .logo-row img { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; }
          .logo-row span { font-size: 14px; font-weight: 800; color: #1a0413; letter-spacing: -.2px; }
        `}</style>
      </Head>

      <div className="page">
        {/* Blobs */}
        <div className="blob" style={{ width:'50vw', height:'50vw', top:'-8%', left:'-8%', background:'#ff9cb7', opacity:.55, animation:'om1 5s infinite alternate ease-in-out' }} />
        <div className="blob" style={{ width:'55vw', height:'55vw', bottom:'-8%', right:'-8%', background:'#b0bec5', opacity:.5, animation:'om2 7s infinite alternate ease-in-out' }} />
        <div className="blob" style={{ width:'40vw', height:'40vw', top:'25%', right:'-5%', background:'#dfb2ea', opacity:.55, animation:'om3 6s infinite alternate ease-in-out' }} />

        <div className="card">
          <div className="topbar" />
          <div className="body">

            {/* Logo */}
            <div className="logo-row">
              <img src="/Main.png" alt="Logo" />
              <span>IPA · Kết quả giao dịch</span>
            </div>

            {/* ── LOADING ── */}
            {status === 'loading' && (
              <div className="center-msg">
                <div className="spin-ring" />
                <h2 style={{ color: '#ae0070' }}>Đang xác nhận…</h2>
                <p style={{ marginTop: 8 }}>Vui lòng không đóng trang này</p>
              </div>
            )}

            {/* ── SUCCESS ── */}
            {isSuccess && (
              <div className="reveal">
                <div className="icon-wrap" style={{ background: 'rgba(220,252,231,.7)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#16a34a" opacity=".12"/>
                    <path d="M6 12.5l4 4 8-8" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ textAlign:'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>Thanh toán thành công!</div>
                  <div style={{ fontSize: 13, color: '#614655', marginTop: 4 }}>Giao dịch đã được MoMo xác nhận</div>
                </div>

                {info?.amount > 0 && (
                  <div className="amount-box">
                    <div className="label">Số tiền thanh toán</div>
                    <div className="value">{fmt(info.amount)}<span>₫</span></div>
                  </div>
                )}

                <div className="info-list">
                  {info?.orderId && <InfoRow k="Mã đơn hàng" v={info.orderId} mono copyable />}
                  {info?.orderInfo && <InfoRow k="Nội dung" v={info.orderInfo} />}
                  {info?.transId && <InfoRow k="Mã giao dịch MoMo" v={String(info.transId)} mono copyable />}
                  {info?.payType && <InfoRow k="Hình thức" v={PAY_TYPE_LABEL[info.payType] || info.payType} />}
                  {info?.paidAt && <InfoRow k="Thời gian" v={fmtTime(info.paidAt)} />}
                </div>

                <Countdown sec={countdown} total={AUTO_CLOSE_SEC} />
              </div>
            )}

            {/* ── FAILED ── */}
            {isFailed && (
              <div className="reveal">
                <div className="icon-wrap" style={{ background: 'rgba(254,226,226,.7)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#dc2626" opacity=".12"/>
                    <path d="M8 8l8 8M16 8l-8 8" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{ textAlign:'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>Giao dịch thất bại</div>
                </div>

                <div className="err-box">
                  {info?.resultCode && <div className="err-code">#{info.resultCode}</div>}
                  <div className="err-msg">{info?.message || 'Giao dịch không thành công'}</div>
                </div>

                <div className="info-list">
                  {info?.orderId && <InfoRow k="Mã đơn hàng" v={info.orderId} mono copyable />}
                  {info?.orderInfo && <InfoRow k="Nội dung" v={info.orderInfo} />}
                  {info?.amount > 0 && <InfoRow k="Số tiền" v={`${fmt(info.amount)} ₫`} />}
                </div>

                <Countdown sec={countdown} total={AUTO_CLOSE_SEC} />
              </div>
            )}

            {/* ── EXPIRED ── */}
            {status === 'expired' && (
              <div className="center-msg">
                <div className="icon">⏰</div>
                <h2 style={{ color: '#d97706' }}>Giao dịch đã hết hạn</h2>
                <p>Link/QR thanh toán này không còn hiệu lực.<br />Vui lòng tạo đơn hàng mới.</p>
                <Countdown sec={countdown} total={AUTO_CLOSE_SEC} />
              </div>
            )}

            {/* ── PENDING ── */}
            {status === 'pending' && (
              <div className="center-msg">
                <div className="icon">⏳</div>
                <h2>Đang chờ xác nhận</h2>
                <p>MoMo chưa phản hồi.<br />Vui lòng kiểm tra lại sau.</p>
                <Countdown sec={countdown} total={AUTO_CLOSE_SEC} />
              </div>
            )}

            {/* ── ERROR ── */}
            {status === 'error' && (
              <div className="center-msg">
                <div className="icon">❗</div>
                <h2>Không tìm thấy đơn hàng</h2>
                <p>Link không hợp lệ hoặc đã hết hạn.</p>
                <Countdown sec={countdown} total={AUTO_CLOSE_SEC} />
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function InfoRow({ k, v, mono, copyable }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleCopy = async () => {
    if (!v) return
    try {
      await navigator.clipboard.writeText(String(v))
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1400)
    } catch (e) {
      console.error('Không sao chép được:', e)
    }
  }

  return (
    <div className="info-row">
      <span className="k">{k}</span>
      <span className="v-wrap">
        <span className={`v${mono ? ' mono' : ''}`}>{v}</span>
        {copyable && (
          <button
            type="button"
            className={`copy-btn${copied ? ' copied' : ''}`}
            onClick={handleCopy}
            aria-label={copied ? `Đã sao chép ${k}` : `Sao chép ${k}`}
            title={copied ? 'Đã sao chép' : 'Sao chép'}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </button>
        )}
      </span>
    </div>
  )
}

function Countdown({ sec, total }) {
  const pct = (sec / total) * 100
  return (
    <div className="cdown-wrap" aria-live="polite">
      <div className="cdown-text">Tự động đóng sau {sec}s</div>
      <div className="cdown-bar">
        <div
          className="cdown-fill"
          style={{
            width: `${pct}%`,
            transition: 'width 1s linear',
          }}
        />
      </div>
    </div>
  )
}