// pages/admin/create-transaction.js
//
// PHIÊN BẢN MULTI-TRANSACTION (v2)
// ───────────────────────────────────────────────────────────────────────
// Khác biệt lớn nhất so với bản cũ: thay vì chỉ xử lý ĐÚNG 1 giao dịch tại
// một thời điểm (state phẳng kiểu p2pOrderId/scanOrderId...), toàn bộ giao
// dịch giờ nằm trong một mảng `txs`, mỗi giao dịch là một "cửa sổ" nổi
// (floating modal) có thể kéo/đóng độc lập — giống hệt phong cách trang
// Admin (Lịch sử giao dịch).
//
// Giới hạn: tối đa 5 giao dịch P2P + 5 giao dịch Scan đang chờ đồng thời
// (10 cửa sổ tối đa). Camera quét mã CHỈ chạy ngầm cho ĐÚNG 1 đơn Scan
// đang được chọn (activeCamId) — bấm vào thẻ Scan nào thì camera chuyển
// sang đơn đó, các đơn Scan còn lại tạm dừng quét cho tới khi được chọn.
//
// Đánh đổi so với bản cũ (để giữ file trong tầm kiểm soát khi tái cấu trúc
// toàn bộ kiến trúc state): đã bỏ AI Amount Widget, bỏ lưu nháp
// (sessionStorage) và bỏ khôi phục đơn qua URL khi F5. Có thể bổ sung lại
// sau nếu cần — kiến trúc mới (mảng txs) vẫn hỗ trợ tốt các tính năng này.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
const TX_BASE_URL   = 'https://kiehtt.vercel.app'
const MAX_PER_TYPE   = 5
const P2P_DURATION_MS = 10 * 60 * 1000
const POLL_MS         = 1000
const LIVE_VERIFY_EVERY_TICKS = 10 // ~10s — gọi /api/momo/query verify thật cho P2P

function genOrderId() {
  return `iPOS${Date.now()}`
}
function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
function cleanCode(raw) {
  return (raw || '').trim()
}
function formatAmount(raw) {
  const digits = (raw || '').toString().replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('en-US')
}
function unformatAmount(formatted) {
  return (formatted || '').replace(/\D/g, '')
}
function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const r = (s % 60).toString().padStart(2, '0')
  return `${m}:${r}`
}
function buildP2pUrl(amount, orderInfo, storeId) {
  const amt = parseInt(amount, 10)
  if (!amt || amt <= 0) return null
  const base = `${TX_BASE_URL}/api/momo/create-p2p?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}`
  return storeId ? `${base}&storeId=${encodeURIComponent(storeId)}` : base
}

// ─── ICONS ─────────────────────────────────────────────────
const IconP2P = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM21 17v4h-4M14 21h3"/>
  </svg>
)
const IconScan = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M3 9V5a2 2 0 0 1 2-2h2M21 9V5a2 2 0 0 0-2-2h-2M3 15v4a2 2 0 0 0 2 2h2M21 15v4a2 2 0 0 1-2 2h-2"/>
    <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)
const IconClose = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)
const IconStore = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M3 9.5 4.5 4h15L21 9.5"/>
    <path d="M3 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"/>
    <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5h4v5"/>
  </svg>
)
const IconCam = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

// ─── GENERIC DRAGGABLE FLOATING MODAL SHELL ─────────────────
function FloatingModal({ tx, isTop, onFocus, children, headerRight, headerLeft, onDrag }) {
  const dragInfo = useRef(null)

  function onPointerDown(e) {
    onFocus()
    const startX = e.clientX, startY = e.clientY
    dragInfo.current = { startX, startY, ox: tx.x, oy: tx.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e) {
    if (!dragInfo.current) return
    const { startX, startY, ox, oy } = dragInfo.current
    onDrag(ox + (e.clientX - startX), oy + (e.clientY - startY))
  }
  function onPointerUp() {
    dragInfo.current = null
  }

  return (
    <div
      className={`float-modal${isTop ? ' top' : ''}`}
      style={{ left: tx.x, top: tx.y, zIndex: tx.z }}
      onMouseDown={onFocus}
    >
      <div
        className="float-modal-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="float-modal-head-left">{headerLeft}</div>
        <div className="float-modal-head-right">{headerRight}</div>
      </div>
      <div className="float-modal-body">{children}</div>
    </div>
  )
}

// ─── STATUS BADGE ────────────────────────────────────────────
function StatusBadge({ status }) {
  const label = status === 'PAID' ? 'Đã thanh toán'
    : status === 'EXPIRED' ? 'Hết hạn'
    : status === 'FAILED' ? 'Thất bại'
    : 'Đang chờ'
  return <span className={`status-badge status-${status.toLowerCase()}`}>{label}</span>
}

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function CreateTransactionPage() {
  const router = useRouter()

  // ─── FORM (tạo giao dịch mới) ───────────────────────────
  const [method,    setMethod]    = useState('scan')
  const [amount,    setAmount]    = useState('')
  const [orderInfo, setOrderInfo] = useState(() => genOrderId())
  const [stores,    setStores]    = useState([])
  const [storeId,   setStoreId]   = useState('')
  const [storesLoading, setStoresLoading] = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [formErr,   setFormErr]   = useState('')
  const amountInputRef = useRef(null)

  // ─── DANH SÁCH GIAO DỊCH ĐANG MỞ (mỗi cái = 1 cửa sổ nổi) ─
  const [txs, setTxs] = useState([])
  const txsRef = useRef([])
  useEffect(() => { txsRef.current = txs }, [txs])

  const [activeCamId, setActiveCamId] = useState(null) // id đơn Scan đang giữ camera
  const [now, setNow] = useState(Date.now())            // tick 1s cho đếm ngược P2P
  const [confirmCancel, setConfirmCancel] = useState(null) // { id } đang chờ xác nhận hủy
  const [resultToast, setResultToast] = useState(null)
  const zCounter = useRef(10)

  // ─── CAMERA (jsQR) — DÙNG CHUNG, CHỈ GẮN VÀO 1 ĐƠN SCAN ───
  const [jsQrReady, setJsQrReady] = useState(false)
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const submittingRef = useRef({}) // { [txId]: bool } — chặn double-submit theo từng đơn

  function updateTx(id, patch) {
    setTxs(prev => prev.map(t => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)))
  }
  function removeTx(id) {
    setTxs(prev => prev.filter(t => t.id !== id))
  }
  function bringToFront(id) {
    zCounter.current += 1
    const z = zCounter.current
    updateTx(id, { z })
    const tx = txsRef.current.find(t => t.id === id)
    if (tx && tx.type === 'scan') setActiveCamId(id)
  }

  // ─── TẢI DANH SÁCH CỬA HÀNG ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/momo/stores')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const list = Array.isArray(d.stores) ? d.stores : []
        setStores(list)
        setStoreId(prev => prev || (list.find(s => s.default) || list[0])?.id || '')
      })
      .catch(e => console.error('Không tải được danh sách cửa hàng:', e))
      .finally(() => { if (!cancelled) setStoresLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ─── TẢI THƯ VIỆN jsQR ───────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.jsQR) { setJsQrReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload = () => setJsQrReady(true)
    document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 768) amountInputRef.current?.focus()
  }, [])

  // ─── TICK 1s: đếm ngược P2P + tự chuyển EXPIRED ─────────
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
      setTxs(prev => prev.map(t => {
        if (t.type === 'p2p' && t.status === 'PENDING' && t.expiresAt && Date.now() >= t.expiresAt) {
          return { ...t, status: 'EXPIRED', checkMsg: '⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.' }
        }
        return t
      }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ─── POLL TRẠNG THÁI CHUNG CHO MỌI ĐƠN PENDING ──────────
  const pollTicksRef = useRef({}) // { [txId]: tickCount } — để verify thật P2P mỗi ~10s
  const pollingLockRef = useRef({})
  useEffect(() => {
    const id = setInterval(async () => {
      const list = txsRef.current
      for (const t of list) {
        const eligible = t.status === 'PENDING' && (t.type === 'p2p' || (t.type === 'scan' && t.submittedCode))
        if (!eligible) continue
        if (pollingLockRef.current[t.id]) continue
        pollingLockRef.current[t.id] = true
        try {
          if (t.type === 'p2p') {
            pollTicksRef.current[t.id] = (pollTicksRef.current[t.id] || 0) + 1
            if (pollTicksRef.current[t.id] % LIVE_VERIFY_EVERY_TICKS === 0) {
              await fetch('/api/momo/query', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: t.orderId }),
              }).catch(() => {})
            }
          }
          const res = await fetch(`/api/momo/status?orderId=${encodeURIComponent(t.orderId)}`)
          const data = await res.json()
          const status = data.status || 'PENDING'
          if (status !== 'PENDING') {
            updateTx(t.id, {
              status,
              checkMsg: status === 'PAID' ? '✓ Thanh toán thành công!'
                : status === 'FAILED' ? `✗ Giao dịch thất bại${data.message ? `: ${data.message}` : ''}`
                : '⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.',
            })
            if (status === 'PAID') {
              setResultToast({ orderId: t.orderId, status: 'success', amount: data.amount || t.amount })
              setTimeout(() => removeTx(t.id), 1500)
            }
          }
        } catch (e) {
          // lỗi mạng tạm thời — bỏ qua, vòng poll sau tự thử lại
        } finally {
          pollingLockRef.current[t.id] = false
        }
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!resultToast) return
    const t = setTimeout(() => setResultToast(null), 6000)
    return () => clearTimeout(t)
  }, [resultToast])

  // ─── CAMERA: chỉ chạy cho đúng 1 đơn Scan đang active ───
  const activeTx = txs.find(t => t.id === activeCamId)
  const cameraKey = activeTx && activeTx.type === 'scan'
    ? `${activeTx.id}|${activeTx.status}|${activeTx.submittedCode || ''}`
    : null

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function tick(txId) {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (video.readyState < 2) { rafRef.current = requestAnimationFrame(() => tick(txId)); return }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = window.jsQR?.(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
    if (code?.data && !submittingRef.current[txId]) {
      submitScanCode(txId, code.data)
      return
    }
    rafRef.current = requestAnimationFrame(() => tick(txId))
  }

  async function startCameraFor(txId, videoEl) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      videoEl.srcObject = stream
      videoEl.setAttribute('playsinline', true)
      await videoEl.play()
      rafRef.current = requestAnimationFrame(() => tick(txId))
    } catch (err) {
      const msg = err.name === 'NotAllowedError' ? 'Bị từ chối quyền camera.'
        : err.name === 'NotFoundError' ? 'Không tìm thấy camera.'
        : `Lỗi camera: ${err.message}`
      updateTx(txId, { camError: msg })
    }
  }

  useEffect(() => {
    stopCamera()
    if (!cameraKey || !jsQrReady) return
    const [txId, status, submitted] = cameraKey.split('|')
    if (status !== 'PENDING' || submitted) return
    const videoEl = videoRef.current
    if (videoEl) startCameraFor(txId, videoEl)
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, jsQrReady])

  useEffect(() => () => stopCamera(), [])

  // Nếu đơn Scan đang giữ camera bị đóng/PAID → tự chuyển camera sang đơn
  // Scan PENDING kế tiếp (nếu có), giống hành vi "bấm vào thẻ nào thì
  // camera chuyển sang đơn đó" nhưng tự động khi đơn hiện tại kết thúc.
  useEffect(() => {
    if (activeCamId && txs.some(t => t.id === activeCamId)) return
    const next = txs.find(t => t.type === 'scan' && t.status === 'PENDING' && !t.submittedCode)
    setActiveCamId(next ? next.id : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs.map(t => t.id).join(',')])

  // ─── TẠO GIAO DỊCH MỚI ───────────────────────────────────
  function nextPosition() {
    const n = txs.length
    const col = n % 4, row = Math.floor(n / 4)
    return { x: 40 + col * 60, y: 30 + row * 40 }
  }

  async function createTransaction() {
    const amt = parseInt(amount, 10)
    if (!amt || amt <= 0) { setFormErr('Nhập số tiền hợp lệ.'); return }
    const countOfType = txs.filter(t => t.type === method).length
    if (countOfType >= MAX_PER_TYPE) {
      setFormErr(`Đã đạt tối đa ${MAX_PER_TYPE} giao dịch ${method === 'p2p' ? 'P2P' : 'Scan'} đang chờ. Đóng bớt cửa sổ để tạo thêm.`)
      return
    }
    setFormErr('')
    setCreating(true)
    const finalOrderInfo = (orderInfo || '').trim() || genOrderId()
    const id = uid()
    const pos = nextPosition()
    zCounter.current += 1

    if (method === 'p2p') {
      const url = buildP2pUrl(amt, finalOrderInfo, storeId)
      try {
        const res = await fetch(url)
        const data = await res.json()
        if (!res.ok || !data.payUrl) {
          setFormErr(data.error || 'Tạo giao dịch thất bại, thử lại sau.')
          setCreating(false)
          return
        }
        const finalStoreId = data.storeId || storeId
        setTxs(prev => [...prev, {
          id, type: 'p2p',
          orderId: data.orderId || finalOrderInfo,
          amount: amt, orderInfo: finalOrderInfo,
          storeId: finalStoreId,
          storeName: stores.find(s => s.id === finalStoreId)?.name || '',
          status: 'PENDING', checkMsg: '', checking: false, cancelling: false,
          x: pos.x, y: pos.y, z: zCounter.current,
          payUrl: data.payUrl, deeplink: data.deeplink || '',
          expiresAt: Date.now() + P2P_DURATION_MS, copied: false,
        }])
      } catch (e) {
        setFormErr('Lỗi server, thử lại sau.')
        setCreating(false)
        return
      }
    } else {
      const generatedId = `POS${Date.now()}${countOfType}`
      try {
        await fetch('/api/momo/save-pending', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: generatedId, amount: amt, orderInfo: finalOrderInfo, ...(storeId ? { storeId } : {}) }),
        })
      } catch (e) { console.error('Lỗi lưu đơn hàng nháp:', e) }
      setTxs(prev => [...prev, {
        id, type: 'scan',
        orderId: generatedId,
        amount: amt, orderInfo: finalOrderInfo,
        storeId, storeName: stores.find(s => s.id === storeId)?.name || '',
        status: 'PENDING', checkMsg: '', checking: false, cancelling: false,
        x: pos.x, y: pos.y, z: zCounter.current,
        manualCode: '', manualErr: '', submittedCode: '', isSubmittingCode: false, camError: '',
      }])
      setActiveCamId(id) // đơn mới tạo tự giữ camera
    }

    setAmount('')
    setOrderInfo(genOrderId())
    setCreating(false)
  }

  // ─── SCAN: GỬI MÃ THANH TOÁN ─────────────────────────────
  async function submitScanCode(txId, rawCode) {
    if (submittingRef.current[txId]) return
    submittingRef.current[txId] = true
    updateTx(txId, { isSubmittingCode: true, manualErr: '' })
    stopCamera()

    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx) { submittingRef.current[txId] = false; return }
    const code = cleanCode(rawCode)
    let orderId = tx.orderId
    const amt = tx.amount
    const baseOrderInfo = tx.orderInfo

    const MAX_RETRY = 5
    let attempt = 0, data = null
    try {
      while (attempt < MAX_RETRY) {
        const res = await fetch('/api/momo/scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: amt, orderInfo: baseOrderInfo, paymentCode: code, ...(tx.storeId ? { storeId: tx.storeId } : {}) }),
        })
        data = await res.json()
        if (data.resultCode === 41) {
          const match = orderId.match(/^(.+)_(\d+)$/)
          orderId = match ? `${match[1]}_${parseInt(match[2]) + 1}` : `${orderId}_2`
          updateTx(txId, { orderId })
          attempt++
          try {
            await fetch('/api/momo/save-pending', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId, amount: amt, orderInfo: baseOrderInfo }),
            })
          } catch (e) { console.error('Lỗi lưu đơn nháp khi bump:', e) }
          continue
        }
        break
      }

      submittingRef.current[txId] = false
      const success = data?.resultCode === 0
      updateTx(txId, {
        isSubmittingCode: false,
        manualCode: code,
        submittedCode: code,
        status: success ? 'PENDING' : 'FAILED',
        checkMsg: success ? '⏳ Đã gửi mã, đang xác nhận giao dịch…' : `✗ Giao dịch thất bại${data?.message ? `: ${data.message}` : ''}`,
      })
    } catch (e) {
      submittingRef.current[txId] = false
      updateTx(txId, { isSubmittingCode: false, manualErr: 'Mất kết nối hoặc cổng thanh toán phản hồi chậm!' })
    }
  }

  function onManualCodeChange(txId, value) {
    updateTx(txId, { manualCode: value, manualErr: '' })
    const code = cleanCode(value)
    if ((code.length === 18 || code.length === 20) && !submittingRef.current[txId] && /^(MM|mm)?\d{18}$/.test(code)) {
      submitScanCode(txId, code)
    }
  }

  function submitManualCode(txId) {
    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx) return
    const code = cleanCode(tx.manualCode)
    if (!/^(MM|mm)?\d{18}$/.test(code)) {
      updateTx(txId, { manualErr: 'Mã không hợp lệ. Vui lòng kiểm tra lại (18 chữ số, có thể có MM).' })
      return
    }
    submitScanCode(txId, code)
  }

  function retryScanCode(txId) {
    updateTx(txId, { status: 'PENDING', checkMsg: '', submittedCode: '', manualCode: '', manualErr: '', camError: '' })
    submittingRef.current[txId] = false
    setActiveCamId(txId)
  }

  // ─── P2P: KIỂM TRA / HỦY ──────────────────────────────────
  async function checkP2pNow(txId) {
    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx || tx.checking) return
    updateTx(txId, { checking: true, checkMsg: '' })
    await fetch('/api/momo/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: tx.orderId }),
    }).catch(() => {})
    try {
      const res = await fetch(`/api/momo/status?orderId=${encodeURIComponent(tx.orderId)}`)
      const data = await res.json()
      const status = data.status || 'PENDING'
      updateTx(txId, {
        checking: false, status,
        checkMsg: status === 'PAID' ? '✓ Thanh toán thành công!'
          : status === 'EXPIRED' ? '⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.'
          : status === 'FAILED' ? `✗ Giao dịch thất bại${data.message ? `: ${data.message}` : ''}`
          : '⏳ Chưa nhận được thanh toán, khách vui lòng quét mã QR.',
      })
      if (status === 'PAID') {
        setResultToast({ orderId: tx.orderId, status: 'success', amount: data.amount || tx.amount })
        setTimeout(() => removeTx(txId), 1500)
      }
    } catch (e) {
      updateTx(txId, { checking: false, checkMsg: '⚠ Lỗi kết nối, thử kiểm tra lại.' })
    }
  }

  async function cancelTx(txId) {
    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx) return
    updateTx(txId, { cancelling: true })
    try {
      if (tx.type === 'p2p') {
        const res = await fetch('/api/momo/cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: tx.orderId }),
        })
        const data = await res.json()
        if (data.alreadyFinal && data.status === 'PAID') {
          updateTx(txId, { status: 'PAID', checkMsg: '✓ Đơn đã được thanh toán, không thể hủy.', cancelling: false })
          return
        }
      } else {
        await fetch('/api/momo/scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: tx.orderId, amount: tx.amount, orderInfo: tx.orderInfo || tx.orderId,
            paymentCode: '000000000000000000', ...(tx.storeId ? { storeId: tx.storeId } : {}),
          }),
        })
      }
    } catch (e) {
      console.error('Lỗi hủy đơn:', e)
    }
    removeTx(txId)
  }

  async function copyPayUrl(txId) {
    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx?.payUrl) return
    try {
      await navigator.clipboard.writeText(tx.payUrl)
    } catch (e) {
      try {
        const ta = document.createElement('textarea')
        ta.value = tx.payUrl; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      } catch { return }
    }
    updateTx(txId, { copied: true })
    setTimeout(() => updateTx(txId, { copied: false }), 2000)
  }

  const currentStoreName = stores.find(s => s.id === storeId)?.name || ''
  const canSubmit = parseInt(amount || 0, 10) > 0
  const methodConfig = [
    { key: 'p2p', label: 'P2P', icon: <IconP2P />, desc: 'QR chuyển tiền' },
    { key: 'scan', label: 'Scan QR', icon: <IconScan />, desc: 'Quét mã nhanh' },
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
        html, body, #__next { margin: 0; padding: 0; height: 100%; width: 100%; font-family: 'Outfit', -apple-system, sans-serif; }
        :root {
          --mm: #ae0070; --mm-light: rgba(174,0,112,0.08); --mm-mid: rgba(174,0,112,0.15);
          --surface: #ffffff; --bg: #f7eff5; --border: #ede0e9; --text: #1a0f16;
          --muted: #9c8094; --subtle: #f2eaf0;
        }
        .desk { position: relative; width: 100%; height: 100vh; background: var(--bg); overflow: hidden; }

        /* ── LEFT DOCK: form tạo giao dịch ── */
        .dock {
          position: absolute; top: 0; left: 0; bottom: 0; width: 300px;
          background: var(--surface); border-right: 1px solid var(--border);
          padding: 22px 18px; overflow-y: auto; z-index: 1;
        }
        .dock-title { font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
        .dock-sub { font-size: 12px; color: var(--muted); margin-bottom: 18px; }
        .field-label { font-size: 11.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px; }
        .field-block { margin-bottom: 18px; }

        .method-tabs { display: flex; gap: 8px; }
        .method-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 10px 6px; border: 1.5px solid var(--border); border-radius: 12px;
          background: var(--surface); cursor: pointer; transition: all 0.15s;
        }
        .method-tab:hover { border-color: rgba(174,0,112,0.3); background: var(--mm-light); }
        .method-tab.active { border-color: var(--mm); background: var(--mm-light); }
        .method-tab-icon { color: var(--muted); line-height: 0; }
        .method-tab.active .method-tab-icon { color: var(--mm); }
        .method-tab-label { font-size: 11.5px; font-weight: 700; color: var(--muted); }
        .method-tab.active .method-tab-label { color: var(--mm); }
        .method-tab-desc { font-size: 9px; font-weight: 500; color: var(--muted); text-align: center; }

        .amount-input, .info-input, .store-select {
          width: 100%; padding: 11px 12px; border: 1.5px solid var(--border); border-radius: 10px;
          font-family: inherit; font-size: 14px; font-weight: 600; color: var(--text); background: var(--surface);
          outline: none; transition: border-color 0.15s;
        }
        .amount-input { font-size: 20px; font-weight: 800; text-align: right; }
        .amount-input:focus, .info-input:focus, .store-select:focus { border-color: var(--mm); }
        .amount-suffix-row { position: relative; }
        .amount-suffix { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--muted); pointer-events: none; }
        .quick-amounts { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .quick-amt-chip {
          padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--subtle);
          font-size: 11.5px; font-weight: 700; color: var(--muted); cursor: pointer;
        }
        .quick-amt-chip:hover { border-color: var(--mm); color: var(--mm); }

        .count-badge { font-size: 10.5px; font-weight: 700; color: var(--muted); margin-top: 6px; }
        .count-badge.full { color: #c0392b; }

        .form-err { font-size: 12px; font-weight: 600; color: #c0392b; background: rgba(192,57,43,0.08); border-radius: 8px; padding: 8px 10px; margin-bottom: 14px; }

        .confirm-btn {
          width: 100%; padding: 13px; border: none; border-radius: 12px; background: var(--mm); color: #fff;
          font-size: 14px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 8px 20px rgba(174,0,112,0.25);
        }
        .confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── FLOATING DESK AREA ── */
        .desk-area { position: absolute; top: 0; left: 300px; right: 0; bottom: 0; overflow: auto; }
        .desk-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13.5px; font-weight: 600; text-align: center; padding: 20px; }

        /* ── FLOATING MODAL ── */
        .float-modal {
          position: absolute; width: 320px; background: var(--surface); border-radius: 16px;
          box-shadow: 0 12px 34px rgba(26,15,22,0.18); border: 1px solid var(--border); overflow: hidden;
        }
        .float-modal.top { box-shadow: 0 16px 44px rgba(174,0,112,0.28); }
        .float-modal-head {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 10px 12px; background: var(--mm-light); border-bottom: 1px solid var(--border); cursor: grab; touch-action: none;
        }
        .float-modal-head:active { cursor: grabbing; }
        .float-modal-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .float-modal-head-right { display: flex; align-items: center; gap: 6px; }
        .modal-type-icon { color: var(--mm); line-height: 0; flex-shrink: 0; }
        .modal-amount { font-size: 15px; font-weight: 800; color: var(--text); white-space: nowrap; }
        .modal-close-btn {
          width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent; color: var(--muted);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .modal-close-btn:hover { background: rgba(192,57,43,0.12); color: #c0392b; }
        .cam-active-pill {
          display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 800; color: var(--mm);
          background: rgba(174,0,112,0.12); padding: 3px 7px; border-radius: 999px;
        }
        .float-modal-body { padding: 14px; }

        .status-badge { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
        .status-pending { background: rgba(214,158,46,0.15); color: #b9770e; }
        .status-paid { background: rgba(39,174,96,0.15); color: #1e8449; }
        .status-failed { background: rgba(192,57,43,0.15); color: #c0392b; }
        .status-expired { background: rgba(120,120,120,0.15); color: #6b6b6b; }

        .info-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; padding: 5px 0; }
        .info-row span:first-child { color: var(--muted); font-weight: 600; }
        .info-row span:last-child { color: var(--text); font-weight: 700; text-align: right; word-break: break-all; }
        .info-divider { height: 1px; background: var(--border); margin: 6px 0; }

        .qr-wrap { display: flex; justify-content: center; padding: 10px 0; }
        .qr-wrap img { width: 170px; height: 170px; border-radius: 10px; border: 1px solid var(--border); }
        .qr-loading { width: 170px; height: 170px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: 11.5px; }

        .countdown { font-size: 13px; font-weight: 800; color: var(--text); }
        .countdown.warn { color: #c0392b; }

        .check-msg { font-size: 12px; font-weight: 600; padding: 8px 10px; border-radius: 8px; background: var(--subtle); color: var(--text); margin: 8px 0; }
        .check-msg.ok { background: rgba(39,174,96,0.1); color: #1e8449; }
        .check-msg.err { background: rgba(192,57,43,0.1); color: #c0392b; }

        .btn-row { display: flex; gap: 8px; margin-top: 10px; }
        .btn-primary, .btn-secondary {
          flex: 1; padding: 9px; border-radius: 9px; font-size: 12.5px; font-weight: 800; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px; border: none;
        }
        .btn-primary { background: var(--mm); color: #fff; }
        .btn-secondary { background: var(--subtle); color: var(--text); border: 1px solid var(--border); }
        .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .copy-link-btn {
          width: 100%; margin-top: 8px; padding: 8px; border-radius: 9px; border: 1px dashed var(--border);
          background: transparent; font-size: 11.5px; font-weight: 700; color: var(--muted); cursor: pointer;
        }
        .copy-link-btn.copied { color: #1e8449; border-color: #1e8449; }

        .code-input {
          width: 100%; padding: 10px; border: 1.5px solid var(--border); border-radius: 9px;
          font-size: 13.5px; font-weight: 700; letter-spacing: 0.02em; text-align: center;
        }
        .code-input:focus { outline: none; border-color: var(--mm); }
        .code-err { font-size: 11px; font-weight: 600; color: #c0392b; margin-top: 6px; }
        .cam-hint { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; color: var(--mm); margin-top: 10px; justify-content: center; }
        .cam-hint-off { color: var(--muted); }
        .cam-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
        .select-cam-btn {
          width: 100%; margin-top: 10px; padding: 9px; border-radius: 9px; border: 1.5px dashed var(--mm);
          background: var(--mm-light); color: var(--mm); font-size: 12px; font-weight: 800; cursor: pointer;
        }

        /* ── TOAST ── */
        .toast {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: var(--text); color: #fff; padding: 12px 20px; border-radius: 12px;
          font-size: 13px; font-weight: 700; z-index: 999; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        }

        /* ── CONFIRM CANCEL MODAL ── */
        .cancel-modal-backdrop { position: fixed; inset: 0; background: rgba(26,15,22,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .cancel-modal-box { background: var(--surface); border-radius: 16px; padding: 22px; width: 320px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
        .cancel-modal-title { font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .cancel-modal-desc { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin-bottom: 16px; }
        .cancel-modal-actions { display: flex; gap: 8px; }
        .cancel-modal-keep, .cancel-modal-confirm { flex: 1; padding: 10px; border-radius: 9px; font-size: 12.5px; font-weight: 800; border: none; cursor: pointer; }
        .cancel-modal-keep { background: var(--subtle); color: var(--text); }
        .cancel-modal-confirm { background: #c0392b; color: #fff; }

        @media (max-width: 768px) {
          .dock { width: 100%; height: auto; position: relative; border-right: none; border-bottom: 1px solid var(--border); }
          .desk { height: auto; overflow: visible; }
          .desk-area { position: relative; left: 0; height: 60vh; }
          .float-modal { width: 92vw; max-width: 340px; }
        }
      `}</style>

      <div className="desk">
        {/* ── DOCK: form tạo giao dịch ── */}
        <div className="dock">
          <div className="dock-title">Tạo giao dịch</div>
          <div className="dock-sub">Tối đa {MAX_PER_TYPE} P2P + {MAX_PER_TYPE} Scan đang chờ cùng lúc</div>

          {stores.length > 1 && (
            <div className="field-block">
              <div className="field-label"><IconStore /> Cửa hàng</div>
              <select className="store-select" value={storeId} onChange={e => setStoreId(e.target.value)} disabled={storesLoading}>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="field-block">
            <div className="field-label">Phương thức</div>
            <div className="method-tabs">
              {methodConfig.map(m => (
                <div key={m.key} className={`method-tab${method === m.key ? ' active' : ''}`} onClick={() => setMethod(m.key)}>
                  <span className="method-tab-icon">{m.icon}</span>
                  <span className="method-tab-label">{m.label}</span>
                  <span className="method-tab-desc">{m.desc}</span>
                </div>
              ))}
            </div>
            <div className={`count-badge${txs.filter(t => t.type === method).length >= MAX_PER_TYPE ? ' full' : ''}`}>
              Đang mở: {txs.filter(t => t.type === method).length}/{MAX_PER_TYPE}
            </div>
          </div>

          <div className="field-block">
            <div className="field-label">Số tiền thanh toán</div>
            <div className="amount-suffix-row">
              <input
                ref={amountInputRef}
                className="amount-input"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatAmount(amount)}
                onChange={e => setAmount(unformatAmount(e.target.value))}
                onKeyDown={e => { if (e.key === 'Enter' && canSubmit) createTransaction() }}
              />
              <span className="amount-suffix">₫</span>
            </div>
            <div className="quick-amounts">
              {[50000, 100000, 200000, 500000].map(a => (
                <button key={a} className="quick-amt-chip" onClick={() => setAmount(String(a))}>
                  {a >= 1000000 ? `${a / 1000000}tr` : `${a / 1000}k`}
                </button>
              ))}
            </div>
          </div>

          <div className="field-block">
            <div className="field-label">Mã đơn hàng</div>
            <input
              className="info-input"
              type="text"
              value={orderInfo}
              onChange={e => setOrderInfo(e.target.value)}
            />
          </div>

          {formErr && <div className="form-err">⚠ {formErr}</div>}

          <button className="confirm-btn" onClick={createTransaction} disabled={!canSubmit || creating}>
            {creating ? <><div className="spinner" /> Đang tạo…</> : <>+ Tạo giao dịch</>}
          </button>

          {currentStoreName && stores.length <= 1 && (
            <div className="count-badge" style={{ marginTop: 10 }}>Cửa hàng: {currentStoreName}</div>
          )}
        </div>

        {/* ── VÙNG NỔI: các cửa sổ giao dịch ── */}
        <div className="desk-area">
          {txs.length === 0 && (
            <div className="desk-empty">Chưa có giao dịch nào đang mở.<br />Tạo giao dịch mới từ bảng bên trái.</div>
          )}

          {txs.map(tx => {
            const isTop = tx.z === Math.max(...txs.map(t => t.z))
            const isCamOwner = tx.type === 'scan' && activeCamId === tx.id
            return (
              <FloatingModal
                key={tx.id}
                tx={tx}
                isTop={isTop}
                onFocus={() => bringToFront(tx.id)}
                onDrag={(x, y) => updateTx(tx.id, { x, y })}
                headerLeft={
                  <>
                    <span className="modal-type-icon">{tx.type === 'p2p' ? <IconP2P /> : <IconScan />}</span>
                    <span className="modal-amount">{formatAmount(String(tx.amount))}₫</span>
                  </>
                }
                headerRight={
                  <>
                    {isCamOwner && <span className="cam-active-pill"><IconCam /> Camera</span>}
                    <StatusBadge status={tx.status} />
                    <button className="modal-close-btn" onClick={() => {
                      if (tx.status === 'PAID') { removeTx(tx.id); return }
                      setConfirmCancel({ id: tx.id })
                    }}><IconClose /></button>
                  </>
                }
              >
                <div className="info-row"><span>Mã đơn hàng</span><span>{tx.orderId}</span></div>
                <div className="info-row"><span>Nội dung</span><span>{tx.orderInfo}</span></div>
                {tx.storeName && <div className="info-row"><span>Cửa hàng</span><span>{tx.storeName}</span></div>}
                <div className="info-divider" />

                {tx.type === 'p2p' ? (
                  <>
                    <div className="qr-wrap">
                      {tx.status === 'PAID' ? null : (
                        <img
                          src={`/api/momo/qr-extract?orderId=${encodeURIComponent(tx.orderId)}`}
                          alt="QR MoMo"
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                      )}
                    </div>
                    {tx.status === 'PENDING' && (
                      <div className="info-row"><span>Còn lại</span>
                        <span className={`countdown${Math.ceil((tx.expiresAt - now) / 1000) <= 60 ? ' warn' : ''}`}>
                          {formatCountdown(Math.ceil((tx.expiresAt - now) / 1000))}
                        </span>
                      </div>
                    )}
                    {tx.checkMsg && (
                      <div className={`check-msg${tx.status === 'PAID' ? ' ok' : (tx.status === 'FAILED' || tx.status === 'EXPIRED') ? ' err' : ''}`}>{tx.checkMsg}</div>
                    )}
                    {tx.payUrl && tx.status !== 'PAID' && (
                      <button className={`copy-link-btn${tx.copied ? ' copied' : ''}`} onClick={() => copyPayUrl(tx.id)}>
                        {tx.copied ? '✓ Đã copy link thanh toán' : '📋 Copy link thanh toán'}
                      </button>
                    )}
                    <div className="btn-row">
                      <button className="btn-primary" disabled={tx.checking || tx.status === 'PAID'} onClick={() => checkP2pNow(tx.id)}>
                        {tx.checking ? <div className="spinner" /> : '✓ Kiểm tra'}
                      </button>
                      <button className="btn-secondary" disabled={tx.cancelling || tx.status === 'PAID'} onClick={() => setConfirmCancel({ id: tx.id })}>
                        ✕ Hủy
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {!tx.submittedCode ? (
                      <>
                        <input
                          className="code-input"
                          type="text"
                          inputMode="numeric"
                          placeholder="Scan QR hoặc gõ mã 18 số"
                          value={tx.manualCode}
                          onChange={e => onManualCodeChange(tx.id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') submitManualCode(tx.id) }}
                          disabled={tx.isSubmittingCode}
                        />
                        {tx.manualErr && <div className="code-err">⚠ {tx.manualErr}</div>}
                        {tx.camError && <div className="code-err">⚠ {tx.camError}</div>}

                        <div className="btn-row">
                          <button className="btn-primary" disabled={!tx.manualCode?.trim() || tx.isSubmittingCode} onClick={() => submitManualCode(tx.id)}>
                            {tx.isSubmittingCode ? <div className="spinner" /> : '✓ Xác nhận'}
                          </button>
                          <button className="btn-secondary" disabled={tx.cancelling} onClick={() => setConfirmCancel({ id: tx.id })}>
                            ✕ Hủy
                          </button>
                        </div>

                        {isCamOwner ? (
                          <div className="cam-hint"><IconCam /> Camera đang quét cho đơn này…</div>
                        ) : (
                          <button className="select-cam-btn" onClick={() => bringToFront(tx.id)}>
                            <IconCam /> Bấm để dùng camera cho đơn này
                          </button>
                        )}

                        {isCamOwner && (
                          <div className="cam-hidden">
                            <video ref={videoRef} playsInline muted />
                            <canvas ref={canvasRef} />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="info-row"><span>Mã đã gửi</span><span>{tx.submittedCode}</span></div>
                        {tx.checkMsg && (
                          <div className={`check-msg${tx.status === 'PAID' ? ' ok' : tx.status === 'FAILED' ? ' err' : ''}`}>{tx.checkMsg}</div>
                        )}
                        <div className="btn-row">
                          {tx.status === 'FAILED' ? (
                            <button className="btn-primary" onClick={() => retryScanCode(tx.id)}>⟲ Thử mã khác</button>
                          ) : (
                            <button className="btn-primary" disabled>⏳ Đang xác nhận…</button>
                          )}
                          <button className="btn-secondary" disabled={tx.status === 'PAID'} onClick={() => setConfirmCancel({ id: tx.id })}>
                            ✕ Hủy
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </FloatingModal>
            )
          })}
        </div>
      </div>

      {/* ── XÁC NHẬN HỦY ── */}
      {confirmCancel && (
        <div className="cancel-modal-backdrop">
          <div className="cancel-modal-box">
            <div className="cancel-modal-title">Xác nhận hủy giao dịch?</div>
            <p className="cancel-modal-desc">
              Hành động này sẽ hủy bỏ và đánh dấu thất bại cho đơn hàng{' '}
              <strong>{txs.find(t => t.id === confirmCancel.id)?.orderId}</strong>.
              Nếu khách vừa thanh toán xong, đơn sẽ không bị hủy.
            </p>
            <div className="cancel-modal-actions">
              <button className="cancel-modal-keep" onClick={() => setConfirmCancel(null)}>Tiếp tục chờ</button>
              <button className="cancel-modal-confirm" onClick={async () => {
                const id = confirmCancel.id
                setConfirmCancel(null)
                await cancelTx(id)
              }}>Đồng ý hủy đơn</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST KẾT QUẢ ── */}
      {resultToast && (
        <div className="toast">
          ✓ Giao dịch {resultToast.orderId} thành công{resultToast.amount ? ` — ${formatAmount(String(resultToast.amount))}₫` : ''}
        </div>
      )}
    </>
  )
}