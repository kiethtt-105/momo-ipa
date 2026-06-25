// pages/admin/create-transaction.js
import { requireAdmin } from '../../lib/requireAdmin'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
const TX_BASE_URL = 'https://kiehtt.vercel.app'

// ─── BUILD TARGET URL ──────────────────────────────────────
// Đây chính là "API" được gọi khi bấm nút — cùng dạng URL này có thể tái sử dụng trực tiếp trong iPhone Shortcuts 
// (action"Get Contents of URL" / "Open URL") để tạo giao dịch nhanh
function buildTxUrl(method, amount, orderInfo) {
  const amt = parseInt(amount, 10)
  if (!amt || amt <= 0) return null
  const path = method === 'p2p'
    ? '/api/momo/create-p2p'    // gọi API tạo giao dịch P2P (trả JSON có payUrl)
    : '/api/momo/scan'         // gọi API tạo giao dịch Scan QR (trả redirect 302 trực tiếp)
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

// ─── SINH MÃ ĐƠN MẶC ĐỊNH — đồng bộ định dạng iPOS+... trên toàn hệ thống ──
function genOrderId() {
  return `iPOS${Date.now()}`
}

// ─── GỢI Ý SỐ TIỀN NHANH ────────────────────────────────────

// ─── DRAFT KEY ─────────────────────────────────────────────
const DRAFT_KEY = 'momo_create_tx_draft'

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function CreateTransactionPage() {
  const router = useRouter()
  const [method,    setMethod]    = useState('scan') // 'p2p' | 'scan' — mặc định Scan QR 
  const [amount,     setAmount]     = useState('')
  const [orderInfo,  setOrderInfo]  = useState(() => genOrderId())
  const [lastUrl,    setLastUrl]    = useState('')
  const [copied,     setCopied]     = useState(false)
  // URL gọi API ẩn theo mặc định — chỉ hiện khi bấm nút (dùng để debug / lấy mẫu cho iPhone Shortcuts)
  const [showUrl,    setShowUrl]    = useState(false)
  // Các đơn đã bắn đi từ CỬA SỔ NÀY, đang chờ kết quả thanh toán cuối cùng — dùng để khớp với tín hiệu BroadcastChannel bắn về từ result.js.
  const [pendingOrders, setPendingOrders] = useState([])

  const [resultToast,   setResultToast]   = useState(null) // { orderId, status, amount }
  const amountInputRef = useRef(null)

  // Khôi phục draft đã nhập trước đó (nếu lỡ F5)
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
    } catch (e) {
      console.error('Không khôi phục được draft tạo giao dịch:', e)
    }
  }, [])

  // Đọc ?method=&amount=&orderInfo= từ URL — dùng khi quay lại từ nút
  // "Thử thanh toán lại" ở result.js. ƯU TIÊN HƠN draft cũ vì đây là ý định hiện tại của admin (thử lại 1 đơn cụ thể), không phải nháp đang gõ dở.
  useEffect(() => {
    if (!router.isReady) return
    const { method: qMethod, amount: qAmount, orderInfo: qOrderInfo } = router.query
    if (qMethod === 'p2p' || qMethod === 'scan') setMethod(qMethod)
    if (qAmount) setAmount(String(parseInt(qAmount, 10) || ''))
    if (qOrderInfo) setOrderInfo(String(qOrderInfo))
  }, [router.isReady])

  // Tự lưu lại draft mỗi khi admin thay đổi method/amount/orderInfo
  useEffect(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ method, amount, orderInfo }))
  }, [method, amount, orderInfo])

  // Tự focus vào ô Amount khi mở trang trên desktop (không focus trên mobile vì bàn phím ảo sẽ bật lên che mất form)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      amountInputRef.current?.focus()
    }
  }, [])

  // ── NHẬN KẾT QUẢ THANH TOÁN QUA QUERY STRING ──────────────
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

// ── NHẬN KẾT QUẢ THANH TOÁN QUA BROADCAST CHANNEL ─────────
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

  // Tự ẩn popup kết quả sau 6 giây (vẫn có thể bấm ✕ để tắt sớm hơn)
  useEffect(() => {
    if (!resultToast) return
    const t = setTimeout(() => setResultToast(null), 60000)
    return () => clearTimeout(t)
  }, [resultToast])

  const isP2P     = method === 'p2p'
  const canSubmit = parseInt(amount || 0, 10) > 0

// ── XỬ LÝ TẠO GIAO DỊCH ─────────────────────────────────────
  // Bấm nút "Xác nhận tạo giao dịch" — gọi API tạo giao dịch, mở tab mới dẫn tới payUrl (P2P) hoặc redirect trực tiếp (Scan QR)  
  const handleCreate = async () => {
    const finalOrderInfo = (orderInfo || '').trim() || genOrderId()
    const url = buildTxUrl(method, amount, finalOrderInfo)
    if (!url) return
    setLastUrl(url)
    setCopied(false)
    // Ghi nhớ đơn vừa bắn đi — để khi quay lại từ result.js (qua query string
    // hoặc BroadcastChannel nếu có tab khác), trang này khớp được đơn.
    setPendingOrders(prev => [...prev, { orderId: finalOrderInfo, amount: parseInt(amount, 10) || 0 }])
    setOrderInfo(genOrderId()) // sinh mã mới cho lần tạo tiếp theo

    if (!isP2P) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    const win = window.open('', '_blank') 
    try {
      const res = await fetch(url)
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
      console.error('Lỗi gọi create-p2p:', e)
      setPendingOrders(prev => prev.filter(o => o.orderId !== finalOrderInfo))
      win?.close()
      alert('Lỗi server, thử lại sau')
    }
  }

  const copyUrl = () => {
    if (!lastUrl) return
    navigator.clipboard?.writeText(lastUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <Head>
        <title>Tạo Giao Dịch</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&display=swap" />
      </Head>
      <style jsx global>{`
        html, body, #__next {
          margin: 0;
          padding: 0;
          height: 100%;
          overflow: hidden;
        }
      `}
      </style>

      <div className="relative flex h-[100dvh] w-full flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-[#f5edf2] p-5 font-[var(--admin-font)] text-[var(--admin-text)]">
        {resultToast && (
          <div
            className={`fixed inset-x-0 top-4 z-50 mx-auto flex w-[92%] max-w-[400px] items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.14)] ${
              resultToast.status === 'success'
                ? 'border-[#bbf7d0] bg-[#f0fdf4]'
                : 'border-[#fecaca] bg-[#fef2f2]'
            }`}
          >
            <div
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base font-black ${
                resultToast.status === 'success' ? 'bg-[#dcfce7] text-[#16a34a]' : 'bg-[#fee2e2] text-[#dc2626]'
              }`}
            >
              {resultToast.status === 'success' ? '✓' : '✗'}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[13px] font-extrabold ${resultToast.status === 'success' ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {resultToast.status === 'success' ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
              </div>
              <div className="truncate text-[11.5px] text-[var(--admin-muted)]">
                {resultToast.orderId}
                {resultToast.amount ? ` · ${resultToast.amount.toLocaleString('en-US')}đ` : ''}
              </div>
            </div>
            <button
              className="flex-shrink-0 px-1 text-sm text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
              onClick={() => setResultToast(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="max-h-full w-full max-w-[440px] overflow-y-auto rounded-[22px] bg-white/95 shadow-[0_24px_60px_rgba(174,0,112,0.1),0_0_0_1px_rgba(255,255,255,0.8)] backdrop-blur-[30px] sm:max-w-[460px]">
          <div className="h-1 w-full bg-gradient-to-r from-[#ff9cb7] via-[var(--mm)] to-[#dfb2ea]" />
          <div className="flex items-center gap-3 px-6 pb-4 pt-5">
            <img src="/Main.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <div className="flex-1">
              <div className="text-[17px] font-extrabold tracking-[-0.3px] text-[var(--mm)]">TẠO GIAO DỊCH</div>
              <div className="text-[11px] font-medium text-[var(--admin-muted)]">Tạo link / QR thanh toán cho quầy</div>
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="relative mb-2.5 flex rounded-2xl bg-[#f3edf1] p-1">
              <div
                className="absolute inset-y-1 rounded-xl bg-white shadow-[0_2px_10px_rgba(174,0,112,0.18)] transition-[left] duration-300 ease-out"
                style={{ left: isP2P ? '4px' : '50%', width: 'calc(50% - 4px)' }}
              />
              <button
                type="button"
                onClick={() => setMethod('p2p')}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
                  isP2P ? 'text-[var(--mm)]' : 'text-[#9a8a93] hover:text-[#6b5c64]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 17v4h-4M14 21h3"/>
                </svg>
                Giao dịch P2P
              </button>
              <button
                type="button"
                onClick={() => setMethod('scan')}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
                  !isP2P ? 'text-[var(--mm)]' : 'text-[#9a8a93] hover:text-[#6b5c64]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9V5a2 2 0 0 1 2-2h2M21 9V5a2 2 0 0 0-2-2h-2M3 15v4a2 2 0 0 0 2 2h2M21 15v4a2 2 0 0 1-2 2h-2"/>
                  <path d="M12 11v4M9 14h6"/>
                </svg>
                Scan QR
              </button>
            </div>

            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Nhập số tiền thanh toán</label>
            <input
              type="text"
              inputMode="numeric"
              value={formatAmount(amount)}
              onChange={e => setAmount(unformatAmount(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
              className="mb-3 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 font-['Outfit',_sans-serif] text-xl font-extrabold tracking-tight text-[var(--mm)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.1)]"
              ref={amountInputRef}
            />


            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Nhập thông tin đơn hàng</label>
            <input
              type="text"
              value={orderInfo}
              readOnly
              onChange={e => setOrderInfo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
              className="mb-1 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[#fafafa] px-3.5 py-2.5 font-mono text-sm text-[var(--admin-text)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.1)]"
            />

            {/* Submit */}
            <button
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--mm)] py-[13px] font-[var(--admin-font)] text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-px hover:bg-[#91005d] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>
              </svg>
              Xác nhận tạo giao dịch
            </button>

            {lastUrl && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowUrl(v => !v)}
                  className="text-[11px] font-semibold text-[var(--admin-muted)] underline-offset-2 hover:text-[var(--admin-text)] hover:underline"
                >
                  {showUrl ? 'Ẩn URL' : 'Xem URL vừa gọi'}
                </button>
                {showUrl && (
                  <div className="mt-2 rounded-[10px] border border-[var(--border)] bg-[#fafafa] p-3">
                    <div className="break-all font-mono text-[11px] text-[#374151]">{lastUrl}</div>
                    <button
                      className="mt-2 rounded-md bg-black/[0.06] px-2.5 py-1 text-[11px] font-semibold text-[#374151] transition-colors hover:bg-black/[0.1]"
                      onClick={copyUrl}
                    >
                      {copied ? '✓ Đã copy' : 'Copy URL'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}