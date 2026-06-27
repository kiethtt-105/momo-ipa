// pages/admin/create-transaction.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
const TX_BASE_URL = 'https://kiehtt.vercel.app'

function buildTxUrl(method, amount, orderInfo) {
  const amt = parseInt(amount, 10)
  if (!amt || amt <= 0) return null
  const path =
    method === 'p2p' ? '/api/momo/create-p2p'
    : method === 'atm' ? '/api/momo/create-atm'
    : '/api/momo/scan'
  return `${TX_BASE_URL}${path}?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}`
}

function formatAmount(raw) {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('en-US')
}

function unformatAmount(formatted) {
  return (formatted || '').replace(/\D/g, '')
}

function genOrderId() {
  return `iPOS${Date.now()}`
}

const DRAFT_KEY = 'momo_create_tx_draft'

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000]

// ─── ICONS ─────────────────────────────────────────────────
const IconP2P = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <path d="M14 14h3v3h-3zM21 17v4h-4M14 21h3"/>
  </svg>
)
const IconScan = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M3 9V5a2 2 0 0 1 2-2h2M21 9V5a2 2 0 0 0-2-2h-2M3 15v4a2 2 0 0 0 2 2h2M21 15v4a2 2 0 0 1-2 2h-2"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)
const IconATM = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path d="M2 9h20M6 14h2M10 14h4"/>
  </svg>
)
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <path d="M15 3h6v6"/>
    <path d="M10 14 21 3"/>
  </svg>
)
const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
)

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function CreateTransactionPage() {
  const router = useRouter()
  const [method,       setMethod]       = useState('scan')
  const [amount,       setAmount]       = useState('')
  const [orderInfo,    setOrderInfo]    = useState(() => genOrderId())

  const [copied,       setCopied]       = useState(false)

  const [pendingOrders, setPendingOrders] = useState([])
  const [resultToast,  setResultToast]  = useState(null)
  const [loading,      setLoading]      = useState(false)
  const amountInputRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.method) setMethod(d.method)
        if (d.amount) setAmount(d.amount)
        if (d.orderInfo) setOrderInfo(d.orderInfo)
      }
    } catch (e) {}
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const { method: qMethod, amount: qAmount, orderInfo: qOrderInfo } = router.query
    if (qMethod === 'p2p' || qMethod === 'scan' || qMethod === 'atm') setMethod(qMethod)
    if (qAmount) setAmount(String(parseInt(qAmount, 10) || ''))
    if (qOrderInfo) setOrderInfo(String(qOrderInfo))
  }, [router.isReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ method, amount, orderInfo }))
  }, [method, amount, orderInfo])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      amountInputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const { resultOrderId, resultStatus, resultAmount, resultMessage } = router.query
    if (!resultOrderId || !resultStatus) return
    setResultToast({
      orderId: resultOrderId,
      status: resultStatus,
      amount: resultAmount ? parseInt(resultAmount, 10) : null,
      message: resultMessage || null,
    })
    setPendingOrders(prev => prev.filter(o => o.orderId !== resultOrderId))
    router.replace('/admin/create-transaction', undefined, { shallow: true })
  }, [router.isReady])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return
    const ch = new BroadcastChannel('momo-result')
    ch.onmessage = (e) => {
      const { orderId, status } = e.data || {}
      if (!orderId) return
      setPendingOrders(prev => {
        const match = prev.find(o => o.orderId === orderId)
        setResultToast({ orderId, status, amount: match?.amount ?? null })
        return prev.filter(o => o.orderId !== orderId)
      })
    }
    return () => ch.close()
  }, [])

  useEffect(() => {
    if (!resultToast) return
    const t = setTimeout(() => setResultToast(null), 60000)
    return () => clearTimeout(t)
  }, [resultToast])

  const isP2P     = method === 'p2p'
  const isATM     = method === 'atm'
  const canSubmit  = parseInt(amount || 0, 10) > 0
  // URL preview — realtime theo method/amount/orderInfo
  const previewUrl = buildTxUrl(method, amount, orderInfo) || ''

  const handleCreate = async () => {
    const finalOrderInfo = (orderInfo || '').trim() || genOrderId()
    const url = buildTxUrl(method, amount, finalOrderInfo)
    if (!url) return


    setLoading(true)
    setPendingOrders(prev => [...prev, { orderId: finalOrderInfo, amount: parseInt(amount, 10) || 0 }])
    setOrderInfo(genOrderId())

    if (!isP2P && !isATM) {
      window.open(url, '_blank', 'noopener,noreferrer')
      setLoading(false)
      return
    }

    const win = window.open('', '_blank')
    try {
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok || !data.payUrl) {
        setPendingOrders(prev => prev.filter(o => o.orderId !== finalOrderInfo))
        win?.close()
        alert(data.error || 'Tạo giao dịch thất bại, thử lại sau')
        return
      }
      if (win) {
        win.location.href = data.payUrl
      } else {
        window.open(data.payUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      setPendingOrders(prev => prev.filter(o => o.orderId !== finalOrderInfo))
      win?.close()
      alert('Lỗi server, thử lại sau')
    } finally {
      setLoading(false)
    }
  }

  const copyUrl = () => {
    if (!previewUrl) return
    navigator.clipboard?.writeText(previewUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const methodConfig = [
    { key: 'p2p',  label: 'P2P',     icon: <IconP2P />,  desc: 'QR chuyển tiền' },
    { key: 'scan', label: 'Scan QR', icon: <IconScan />, desc: 'Quét mã nhanh'   },
    { key: 'atm',  label: 'Thẻ ATM', icon: <IconATM />,  desc: 'Nhập thẻ nội địa' },
  ]

  return (
    <>
      <Head>
        <title>Tạo Giao Dịch</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #__next {
          margin: 0; padding: 0;
          height: 100%; width: 100%;
          overflow: hidden;
          font-family: 'Outfit', -apple-system, sans-serif;
        }
        :root {
          --mm: #ae0070;
          --mm-light: rgba(174,0,112,0.08);
          --mm-mid: rgba(174,0,112,0.15);
          --mm-glow: rgba(174,0,112,0.22);
          --surface: #ffffff;
          --bg: #f7eff5;
          --border: #ede0e9;
          --text: #1a0f16;
          --muted: #9c8094;
          --subtle: #f2eaf0;
        }

        /* ── LAYOUT ROOT ── */
        .page-root {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100dvh;
          background: var(--bg);
          padding: 0;
        }

        /* ── CARD ── */
        .card {
          position: relative;
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          background: var(--surface);
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Tablet+ → centered card with border-radius */
        @media (min-width: 600px) {
          .page-root { padding: 24px; }
          .card {
            max-width: 480px;
            max-height: calc(100dvh - 48px);
            border-radius: 24px;
            box-shadow: 0 32px 80px rgba(174,0,112,0.12), 0 0 0 1px rgba(174,0,112,0.06);
          }
        }
        @media (min-width: 900px) {
          .page-root { padding: 32px; }
          .card {
            max-width: 500px;
            max-height: calc(100dvh - 64px);
          }
        }

        /* ── TOP STRIPE ── */
        .top-stripe {
          flex-shrink: 0;
          height: 3px;
          background: linear-gradient(90deg, #f9a8c9 0%, var(--mm) 50%, #c084d4 100%);
        }

        /* ── HEADER ── */
        .card-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px 0;
        }
        .header-logo {
          width: 40px; height: 40px;
          border-radius: 12px;
          object-fit: contain;
          background: var(--subtle);
          flex-shrink: 0;
        }
        .header-text-title {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.5px;
          color: var(--mm);
          line-height: 1.1;
        }
        .header-text-sub {
          font-size: 11.5px;
          font-weight: 500;
          color: var(--muted);
          margin-top: 1px;
        }

        /* ── BODY ── */
        .card-body {
          flex: 1;
          padding: 16px 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* ── SECTION LABEL ── */
        .field-label {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }

        /* ── METHOD TABS ── */
        .method-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 20px;
        }
        .method-tab {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 11px 4px 10px;
          border-radius: 12px;
          border: 1.5px solid var(--border);
          background: var(--subtle);
          cursor: pointer;
          transition: all 0.18s ease;
          font-family: inherit;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }
        .method-tab:hover {
          border-color: rgba(174,0,112,0.3);
          background: var(--mm-light);
        }
        .method-tab.active {
          border-color: var(--mm);
          background: var(--mm-light);
          box-shadow: 0 0 0 3px var(--mm-mid);
        }
        .method-tab-icon {
          color: var(--muted);
          transition: color 0.18s;
          line-height: 0;
        }
        .method-tab.active .method-tab-icon { color: var(--mm); }
        .method-tab-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          transition: color 0.18s;
        }
        .method-tab.active .method-tab-label { color: var(--mm); }
        .method-tab-desc {
          font-size: 9.5px;
          font-weight: 500;
          color: var(--muted);
          transition: color 0.18s;
          text-align: center;
          line-height: 1.3;
        }
        .method-tab.active .method-tab-desc { color: rgba(174,0,112,0.7); }

        /* ── AMOUNT SECTION ── */
        .amount-section { margin-bottom: 18px; }
        .amount-input-wrap {
          position: relative;
          margin-bottom: 10px;
        }
        .amount-input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 14px;
          background: var(--subtle);
          padding: 12px 14px 12px 42px;
          font-family: 'Outfit', sans-serif;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text);
          outline: none;
          transition: all 0.18s ease;
          -webkit-appearance: none;
        }
        .amount-input::placeholder { color: #d0b8c8; font-weight: 600; font-size: 20px; }
        .amount-input:focus {
          border-color: var(--mm);
          background: #fff;
          box-shadow: 0 0 0 3px var(--mm-mid);
        }
        .amount-input.has-value { color: var(--mm); }
        .amount-prefix {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 18px;
          font-weight: 700;
          color: var(--muted);
          pointer-events: none;
        }
        .amount-input.has-value + .amount-prefix,
        .amount-input:focus + .amount-prefix {
          color: var(--mm);
        }
        /* ── Fix: prefix before input in DOM, use sibling trick ── */
        .amount-input-wrap .prefix-label {
          position: absolute;
          left: 16px;
          top: 50%; transform: translateY(-50%);
          font-size: 16px;
          font-weight: 800;
          color: var(--muted);
          pointer-events: none;
          transition: color 0.18s;
        }

        /* ── QUICK AMOUNTS ── */
        .quick-amounts {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .quick-btn {
          flex: 1;
          min-width: 0;
          padding: 7px 4px;
          border-radius: 10px;
          border: 1.5px solid var(--border);
          background: transparent;
          font-family: inherit;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          text-align: center;
          -webkit-tap-highlight-color: transparent;
        }
        .quick-btn:hover, .quick-btn:active {
          border-color: var(--mm);
          color: var(--mm);
          background: var(--mm-light);
        }

        /* ── ORDER INFO ── */
        .order-section { margin-bottom: 20px; }
        .order-input-wrap {
          display: flex;
          gap: 8px;
          align-items: stretch;
        }
        .order-input {
          flex: 1;
          min-width: 0;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          background: var(--subtle);
          padding: 11px 13px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text);
          outline: none;
          transition: all 0.18s ease;
        }
        .order-input:focus {
          border-color: var(--mm);
          background: #fff;
          box-shadow: 0 0 0 3px var(--mm-mid);
        }
        .refresh-btn {
          flex-shrink: 0;
          width: 42px;
          border-radius: 12px;
          border: 1.5px solid var(--border);
          background: var(--subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--muted);
          transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .refresh-btn:hover { border-color: var(--mm); color: var(--mm); background: var(--mm-light); }

        /* ── ATM NOTICE ── */
        .atm-notice {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff8f0;
          border: 1px solid #fde8c8;
          margin-bottom: 16px;
        }
        .atm-notice-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
        .atm-notice-text { font-size: 11px; line-height: 1.5; color: #9a6a2a; font-weight: 500; }

        /* ── SUBMIT BTN ── */
        .submit-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 15px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, var(--mm) 0%, #c0006a 100%);
          color: #fff;
          font-family: inherit;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.1px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 8px 24px rgba(174,0,112,0.28);
          position: relative;
          overflow: hidden;
          -webkit-tap-highlight-color: transparent;
        }
        .submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%);
          pointer-events: none;
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 30px rgba(174,0,112,0.35);
        }
        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 4px 12px rgba(174,0,112,0.25);
        }
        .submit-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }
        .submit-btn.loading { opacity: 0.8; }

        /* ── SPINNER ── */
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── URL PREVIEW ROW ── */
        .url-preview-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 9px 12px;
          border-radius: 11px;
          border: 1px solid var(--border);
          background: var(--subtle);
        }
        .url-preview-text {
          flex: 1;
          min-width: 0;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 10px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.4;
        }
        .url-copy-btn {
          flex-shrink: 0;
          width: 28px; height: 28px;
          border-radius: 7px;
          border: 1px solid var(--border);
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: var(--muted);
          font-size: 11px; font-weight: 800;
          transition: all 0.15s;
          font-family: inherit;
        }
        .url-copy-btn:hover { border-color: var(--mm); color: var(--mm); background: var(--mm-light); }
        .url-copy-btn.done { background: #dcfce7; border-color: #86efac; color: #16a34a; }

        /* ── RESULT TOAST ── */
        .toast {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          width: calc(100% - 32px);
          max-width: 400px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          border-radius: 18px;
          border: 1px solid;
          box-shadow: 0 16px 40px rgba(0,0,0,0.15);
          animation: toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        .toast.success { background: #f0fdf4; border-color: #bbf7d0; }
        .toast.fail    { background: #fef2f2; border-color: #fecaca; }
        .toast-icon {
          width: 34px; height: 34px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 900;
          flex-shrink: 0;
        }
        .toast.success .toast-icon { background: #dcfce7; color: #16a34a; }
        .toast.fail    .toast-icon { background: #fee2e2; color: #dc2626; }
        .toast-body { flex: 1; min-width: 0; }
        .toast-title {
          font-size: 13px; font-weight: 800;
          line-height: 1.2;
        }
        .toast.success .toast-title { color: #16a34a; }
        .toast.fail    .toast-title { color: #dc2626; }
        .toast-sub { font-size: 11px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .toast-close {
          flex-shrink: 0;
          width: 26px; height: 26px;
          border-radius: 50%;
          background: none; border: none;
          font-size: 13px; cursor: pointer;
          color: var(--muted);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .toast-close:hover { background: rgba(0,0,0,0.07); color: var(--text); }

        /* ── DIVIDER ── */
        .divider {
          height: 1px;
          background: var(--border);
          margin: 0 0 18px;
        }

        /* ── PENDING BADGE ── */
        .pending-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px 3px 7px;
          border-radius: 20px;
          background: var(--mm-light);
          border: 1px solid rgba(174,0,112,0.18);
          font-size: 10.5px;
          font-weight: 700;
          color: var(--mm);
          margin-bottom: 14px;
        }
        .pending-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--mm);
          animation: pulse 1.2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>

      {/* RESULT TOAST */}
      {resultToast && (
        <div className={`toast ${resultToast.status === 'success' ? 'success' : 'fail'}`}>
          <div className="toast-icon">
            {resultToast.status === 'success' ? '✓' : '✗'}
          </div>
          <div className="toast-body">
            <div className="toast-title">
              {resultToast.status === 'success' ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
            </div>
            <div className="toast-sub">
              {resultToast.orderId}
              {resultToast.amount ? ` · ${resultToast.amount.toLocaleString('en-US')}đ` : ''}
            </div>
          </div>
          <button className="toast-close" onClick={() => setResultToast(null)}>✕</button>
        </div>
      )}

      <div className="page-root">
        <div className="card">
          {/* TOP STRIPE */}
          <div className="top-stripe" />

          {/* HEADER */}
          <div className="card-header">
            <img src="/Main.png" alt="" className="header-logo" />
            <div>
              <div className="header-text-title">Tạo Giao Dịch</div>
              <div className="header-text-sub">Tạo link &amp; QR thanh toán MoMo</div>
            </div>
          </div>

          {/* BODY */}
          <div className="card-body">



            {/* METHOD */}
            <div className="field-label">Phương thức</div>
            <div className="method-tabs">
              {methodConfig.map(m => (
                <button
                  key={m.key}
                  type="button"
                  className={`method-tab${method === m.key ? ' active' : ''}`}
                  onClick={() => setMethod(m.key)}
                >
                  <span className="method-tab-icon">{m.icon}</span>
                  <span className="method-tab-label">{m.label}</span>
                  <span className="method-tab-desc">{m.desc}</span>
                </button>
              ))}
            </div>

            {/* AMOUNT */}
            <div className="amount-section">
              <div className="field-label">Số tiền thanh toán</div>
              <div className="amount-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  ref={amountInputRef}
                  value={formatAmount(amount)}
                  onChange={e => setAmount(unformatAmount(e.target.value))}
                  onKeyDown={e => e.key === 'Enter' && canSubmit && !loading && handleCreate()}
                  className={`amount-input${amount ? ' has-value' : ''}`}
                  style={{ paddingLeft: '44px' }}
                />
                <span className="prefix-label" style={{
                  color: amount ? 'var(--mm)' : 'var(--muted)'
                }}>₫</span>
              </div>

              {/* Quick amounts */}
              <div className="quick-amounts">
                {QUICK_AMOUNTS.map(v => (
                  <button
                    key={v}
                    type="button"
                    className="quick-btn"
                    onClick={() => setAmount(String(v))}
                  >
                    {v >= 1000 ? `${v / 1000}K` : v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* ORDER INFO */}
            <div className="order-section">
              <div className="field-label">Mã đơn hàng</div>
              <div className="order-input-wrap">
                <input
                  type="text"
                  value={orderInfo}
                  onChange={e => setOrderInfo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && canSubmit && !loading && handleCreate()}
                  className="order-input"
                />
                <button
                  type="button"
                  className="refresh-btn"
                  title="Tạo mã mới"
                  onClick={() => setOrderInfo(genOrderId())}
                >
                  <IconRefresh />
                </button>
              </div>
            </div>

            {/* ATM NOTICE */}
            {isATM && (
              <div className="atm-notice">
                <span className="atm-notice-icon">ℹ</span>
                <p className="atm-notice-text">
                  Khi tạo giao dịch thẻ ATM, khách hàng sẽ được chuyển hướng sang trang thanh toán của MoMo. Sau khi thanh toán xong, MoMo sẽ gửi kết quả về server của bạn (callback) và hiển thị thông báo thành công/thất bại cho khách hàng.
                </p>
              </div>
            )}

            {/* SUBMIT */}
            <button
              className={`submit-btn${loading ? ' loading' : ''}`}
              onClick={handleCreate}
              disabled={!canSubmit || loading}
            >
              {loading
                ? <><div className="spinner" /> Đang tạo…</>
                : <><IconSend /> Xác nhận tạo giao dịch</>
              }
            </button>

            {/* URL PREVIEW — realtime */}
            {previewUrl && (
              <div className="url-preview-row">
                <div className="url-preview-text">{previewUrl}</div>
                <button
                  className={`url-copy-btn${copied ? ' done' : ''}`}
                  onClick={copyUrl}
                  title="Copy URL"
                >
                  {copied ? '✓' : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
            )}

          </div>{/* /card-body */}
        </div>{/* /card */}
      </div>{/* /page-root */}
    </>
  )
}