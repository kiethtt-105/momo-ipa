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
// ─── LƯU/KHÔI PHỤC DANH SÁCH GIAO DỊCH QUA URL (?txs=...) ──────────
// Chỉ lưu các field cần thiết để hiển thị lại + tiếp tục poll đúng đơn
// (không lưu state tạm thời như checkMsg/checking/manualCode...).
function serializeTxs(list) {
  return list.map(t => ({
    id: t.id, type: t.type, orderId: t.orderId, amount: t.amount, orderInfo: t.orderInfo,
    storeId: t.storeId || '', storeName: t.storeName || '', status: t.status,
    payUrl: t.payUrl || '', deeplink: t.deeplink || '', expiresAt: t.expiresAt || null,
    submittedCode: t.submittedCode || '',
    pos: t.pos || { x: 24, y: 24 }, zIndex: t.zIndex || 10, minimized: !!t.minimized, userPositioned: !!t.userPositioned,
  }))
}
function deserializeTxs(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(t => ({
    ...t,
    checkMsg: '', checking: false, cancelling: false, copied: false,
    manualCode: t.submittedCode || '', manualErr: '', isSubmittingCode: false, camError: '',
    pos: t.pos || { x: 24, y: 24 }, zIndex: t.zIndex || 10, minimized: !!t.minimized, userPositioned: !!t.userPositioned,
  }))
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

const IconNewTab = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <path d="M15 3h6v6"/><path d="M10 14 21 3"/>
  </svg>
)
const IconChevronDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
    <path d="m6 9 6 6 6-6"/>
  </svg>
)
const IconSync = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16M3 12a9 9 0 0 1 15.3-6.4L21 8"/>
    <path d="M3 16v4h4M21 8V4h-4"/>
  </svg>
)
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
  </svg>
)
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
)

// ─── DROPDOWN CHỌN CỬA HÀNG (thay cho <select> mặc định xấu, viền
// xanh, không theo được theme hồng của app — không style được list) ──
function StoreDropdown({ stores, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = stores.find(s => s.id === value)

  return (
    <div className={`store-dd${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="store-dd-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <span className="store-dd-value">{current?.name || 'Chọn cửa hàng'}</span>
        <span className="store-dd-chevron"><IconChevronDown /></span>
      </button>
      {open && (
        <div className="store-dd-list">
          {stores.map(s => (
            <div
              key={s.id}
              className={`store-dd-item${s.id === value ? ' active' : ''}`}
              onClick={() => { onChange(s.id); setOpen(false) }}
            >
              <span>{s.name}</span>
              {s.id === value && <span className="store-dd-check"><IconCheck /></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TICKET CARD (cửa sổ nổi kéo-thả tự do, kiểu vé/hóa đơn POS) ──
function TicketCard({ tx, isFocused, onFocus, onHeaderDown, children, headerRight, headerLeft }) {
  return (
    <div
      className={`ticket${isFocused ? ' focused' : ''}${tx.status === 'PAID' ? ' is-paid' : ''}${tx.status === 'EXPIRED' ? ' is-expired' : ''}`}
      onMouseDown={onFocus}
    >
      {tx.status === 'PAID' && <div className="ticket-stamp">Đã TT</div>}
      <div className="ticket-notch left" />
      <div className="ticket-notch right" />
      <div className="ticket-head" onMouseDown={onHeaderDown} onTouchStart={onHeaderDown}>
        <div className="ticket-head-left">{headerLeft}</div>
        <div className="ticket-head-right">{headerRight}</div>
      </div>
      <div className="ticket-perf" />
      <div className="ticket-body">{children}</div>
    </div>
  )
}

// ─── QR IMAGE: tự thử lại nếu route qr-extract lỗi/timeout tạm thời ──
// Trước đây <img onError> chỉ set display:none MỘT LẦN rồi thôi — nếu
// Puppeteer/Chromium cold-start chậm hơn timeout hoặc lỗi mạng thoáng qua,
// mã QR biến mất vĩnh viễn khỏi thẻ, không có cách nào tự hồi phục ngoài
// việc đóng vé và tạo lại từ đầu. Giờ tự retry với backoff tăng dần
// (1.2s, 2.4s, 3.6s, 4.8s), có cache-busting bằng query `r`, và sau khi
// hết lượt tự retry thì hiện nút "Thử lại" thủ công thay vì im lặng ẩn.
function QrImage({ orderId }) {
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const retryTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(retryTimerRef.current), [])

  function handleLoad() {
    setLoading(false)
    setFailed(false)
  }
  function handleError() {
    if (attempt < 4) {
      const delay = 1200 * (attempt + 1)
      retryTimerRef.current = setTimeout(() => {
        setLoading(true)
        setAttempt(a => a + 1)
      }, delay)
    } else {
      setLoading(false)
      setFailed(true)
    }
  }
  function manualRetry() {
    clearTimeout(retryTimerRef.current)
    setFailed(false)
    setLoading(true)
    setAttempt(a => a + 1)
  }

  return (
    <div className="qr-wrap">
      {loading && (
        <div className="qr-loading">
          <div className="spinner qr-spinner" />
          Đang tải mã QR…
        </div>
      )}
      {!failed && (
        <img
          key={attempt}
          src={`/api/momo/qr-extract?orderId=${encodeURIComponent(orderId)}&r=${attempt}`}
          alt="QR MoMo"
          style={{ display: loading ? 'none' : 'block' }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {failed && (
        <div className="qr-loading">
          ⚠ Không tải được mã QR
          <button className="btn-secondary qr-retry-btn" onClick={manualRetry}>⟲ Thử lại</button>
        </div>
      )}
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
  const [method,    setMethod]    = useState('p2p')
  const [amount,    setAmount]    = useState('')
  const [orderInfo, setOrderInfo] = useState(() => genOrderId())
  const [stores,    setStores]    = useState([])
  const [storeId,   setStoreId]   = useState('')
  const [storesLoading, setStoresLoading] = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [justCreated, setJustCreated] = useState(false) // giữ ô nhập bị khóa 1 nhịp ngắn sau khi tạo xong, để người dùng thấy rõ đã khóa trước khi form tự reset cho giao dịch kế tiếp
  const [formErr,   setFormErr]   = useState('')
  const amountInputRef = useRef(null)

  // ─── DANH SÁCH GIAO DỊCH ĐANG MỞ (mỗi cái = 1 cửa sổ nổi) ─
  const [txs, setTxs] = useState([])
  const txsRef = useRef([])
  useEffect(() => { txsRef.current = txs }, [txs])
  const hydratedFromStorageRef = useRef(false)

  const [activeCamId, setActiveCamId] = useState(null) // id đơn Scan đang giữ camera
  const [now, setNow] = useState(Date.now())            // tick 1s cho đếm ngược P2P
  const [confirmCancel, setConfirmCancel] = useState(null) // { id } đang chờ xác nhận hủy
  const [resultToast, setResultToast] = useState(null)
  const [toasts, setToasts] = useState([]) // thông báo trạng thái khi bấm "Kiểm tra" — nổi ngoài cửa sổ, tự đóng
  const [lastFocusedId, setLastFocusedId] = useState(null) // vé nào vừa được bấm/chọn

  function pushToast(text, type = 'info', duration = 5500) {
    const id = uid()
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }
  function dismissToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

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

  // ─── CỬA SỔ NỔI: mặc định tự xếp lưới lấp đầy màn hình, nhưng vé
  // nào bị NGƯỜI DÙNG chủ động kéo (userPositioned=true) thì thoát khỏi
  // lưới tự động, giữ nguyên vị trí đã thả cho tới khi đóng/tạo lại ──
  const zCounterRef = useRef(10)
  const dragStateRef = useRef(null) // { id, startX, startY, origX, origY, moved }
  const windowLayerRef = useRef(null)
  const TICKET_W = 300, TICKET_HEAD_H = 44, GRID_GAP = 20, GRID_ROW_H = 452
  const [layoutW, setLayoutW] = useState(0)
  const [layoutH, setLayoutH] = useState(0)
  const [boardMinHeight, setBoardMinHeight] = useState(0)

  // ─── CỬA SỔ ĐĂNG KÝ (form tạo giao dịch) — giờ cũng là một cửa sổ
  // nổi kéo-thả được như vé giao dịch, nhưng "đặc biệt" hơn: mặc định
  // luôn xuất hiện chính giữa màn hình, viền/đổ bóng nổi bật hơn, và có
  // dải ruy-băng "Quầy chính" ghim ở góc để phân biệt với các vé thường.
  const REGISTER_W = 340
  const [regPos, setRegPos] = useState({ x: 24, y: 24 })
  const [regZIndex, setRegZIndex] = useState(9000)
  const [regUserPositioned, setRegUserPositioned] = useState(false)
  const regDragRef = useRef(null)
  const regElRef = useRef(null)

  function bringToFront(id) {
    setLastFocusedId(id)
    zCounterRef.current += 1
    updateTx(id, { zIndex: zCounterRef.current })
    const tx = txsRef.current.find(t => t.id === id)
    if (tx && tx.type === 'scan') setActiveCamId(id)
  }

  function toggleMinimize(id) {
    updateTx(id, t => ({ minimized: !t.minimized }))
    bringToFront(id)
  }

  function clampPos(x, y) {
    const layer = windowLayerRef.current
    const maxX = layer ? Math.max(8, layer.clientWidth - TICKET_W) : x
    const maxY = layer ? Math.max(8, layer.clientHeight - TICKET_HEAD_H) : y
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
  }

  // Theo dõi bề rộng khu vực bảng để tính số cột lưới, tự chạy lại khi
  // co giãn cửa sổ trình duyệt (resize) hoặc mở/đóng sidebar.
  useEffect(() => {
    const layer = windowLayerRef.current
    if (!layer) return
    const update = () => { setLayoutW(layer.clientWidth); setLayoutH(layer.clientHeight) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(layer)
    return () => ro.disconnect()
  }, [])

  // Đưa cửa sổ đăng ký về CHÍNH GIỮA màn hình khi CHƯA có giao dịch nào
  // (trạng thái quầy trống, muốn nổi bật, mời tạo giao dịch đầu tiên).
  // Nhưng NGAY KHI đã có ít nhất 1 giao dịch mở, tự động neo quầy gọn vào
  // GÓC TRÊN-TRÁI thay vì tiếp tục chiếm giữa màn hình — trước đây quầy
  // luôn nằm giữa khiến các vé mới bị buộc phải xếp bắt đầu từ NGAY DƯỚI
  // quầy, tức là luôn rơi vào nửa dưới màn hình ("bị đẩy xuống dưới").
  // Neo góc giúp bảng vé được rảnh toàn bộ phần trên để xếp lưới ngay.
  useEffect(() => {
    if (regUserPositioned || !layoutW || !layoutH) return
    if (txs.length > 0) {
      setRegPos({ x: GRID_GAP, y: GRID_GAP })
      return
    }
    const h = regElRef.current?.offsetHeight || 560
    setRegPos({
      x: Math.max(16, (layoutW - REGISTER_W) / 2),
      y: Math.max(16, (layoutH - h) / 2),
    })
  }, [layoutW, layoutH, regUserPositioned, txs.length])

  // Tự xếp lại vị trí cho MỌI vé chưa bị kéo tay (userPositioned=false)
  // và chưa thu nhỏ, thành lưới đều lấp đầy chiều rộng khả dụng. Các vé
  // đã bị kéo tay được giữ nguyên, không bị "hút" lại vào lưới.
  const autoLayoutKey = txs.filter(t => !t.minimized).map(t => `${t.id}:${t.userPositioned ? 1 : 0}`).join(',')
  useEffect(() => {
    if (!layoutW) return
    const cols = Math.max(1, Math.floor((layoutW - GRID_GAP) / (TICKET_W + GRID_GAP)))
    const autoCount = txsRef.current.filter(t => !t.minimized && !t.userPositioned).length
    // Khi số vé ít hơn số cột tối đa, đừng dồn hết vào góc trái — canh cả
    // khối vé vào giữa chiều rộng khả dụng, giống một bảng vé thật được
    // bày ra giữa quầy chứ không dính sát vào một mép.
    const effectiveCols = Math.min(cols, Math.max(1, autoCount))
    const gridContentWidth = effectiveCols * (TICKET_W + GRID_GAP) - GRID_GAP
    // Quầy đăng ký giờ neo góc trên-trái (khi đã có giao dịch mở) thay vì
    // giữa màn hình, nên chỉ cần chừa khoảng trống NGANG đủ để không đè
    // lên quầy — KHÔNG còn cần chừa khoảng trống DỌC bên dưới quầy nữa,
    // vé luôn bắt đầu ngay từ đầu bảng (topOffset cố định = GRID_GAP).
    const reserveForReg = !regUserPositioned && autoCount > 0 ? REGISTER_W + GRID_GAP * 2 : 0
    const offsetX = Math.max(GRID_GAP + reserveForReg, (layoutW - gridContentWidth) / 2)
    const topOffset = GRID_GAP
    let autoIdx = 0
    const next = txsRef.current.map(t => {
      if (t.minimized || t.userPositioned) return t
      const col = autoIdx % effectiveCols
      const row = Math.floor(autoIdx / effectiveCols)
      autoIdx++
      return { ...t, pos: { x: offsetX + col * (TICKET_W + GRID_GAP), y: topOffset + row * GRID_ROW_H } }
    })
    const maxBottom = next.reduce((m, t) => (t.minimized ? m : Math.max(m, (t.pos?.y || 0) + GRID_ROW_H)), 0)
    setTxs(next)
    setBoardMinHeight(maxBottom + GRID_GAP)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutW, autoLayoutKey, regUserPositioned])

  function onDragStart(e, tx) {
    if (e.target.closest('button')) return
    bringToFront(tx.id)
    const point = e.touches ? e.touches[0] : e
    dragStateRef.current = {
      id: tx.id, startX: point.clientX, startY: point.clientY,
      origX: tx.pos?.x ?? 24, origY: tx.pos?.y ?? 24, moved: false,
    }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive: false })
    window.addEventListener('touchend', onDragEnd)
  }

  function onDragMove(e) {
    const st = dragStateRef.current
    if (!st) return
    if (e.cancelable) e.preventDefault()
    const point = e.touches ? e.touches[0] : e
    const dx = point.clientX - st.startX
    const dy = point.clientY - st.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) st.moved = true
    const { x, y } = clampPos(st.origX + dx, st.origY + dy)
    updateTx(st.id, { pos: { x, y } })
  }

  function onDragEnd() {
    const st = dragStateRef.current
    // Chỉ "thoát lưới tự động" nếu người dùng thật sự kéo di chuyển —
    // một cú bấm đơn thuần (để focus) không nên khiến vé bị khóa vị trí.
    if (st?.moved) updateTx(st.id, { userPositioned: true })
    dragStateRef.current = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    window.removeEventListener('touchmove', onDragMove)
    window.removeEventListener('touchend', onDragEnd)
  }

  function bringRegToFront() {
    zCounterRef.current += 1
    setRegZIndex(zCounterRef.current)
  }

  function onRegDragStart(e) {
    if (e.target.closest('button, input, .store-dd, textarea')) return
    bringRegToFront()
    const point = e.touches ? e.touches[0] : e
    regDragRef.current = { startX: point.clientX, startY: point.clientY, origX: regPos.x, origY: regPos.y, moved: false }
    window.addEventListener('mousemove', onRegDragMove)
    window.addEventListener('mouseup', onRegDragEnd)
    window.addEventListener('touchmove', onRegDragMove, { passive: false })
    window.addEventListener('touchend', onRegDragEnd)
  }

  function onRegDragMove(e) {
    const st = regDragRef.current
    if (!st) return
    if (e.cancelable) e.preventDefault()
    const point = e.touches ? e.touches[0] : e
    const dx = point.clientX - st.startX
    const dy = point.clientY - st.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) st.moved = true
    const layer = windowLayerRef.current
    const h = regElRef.current?.offsetHeight || 560
    const maxX = layer ? Math.max(8, layer.clientWidth - REGISTER_W) : st.origX + dx
    const maxY = layer ? Math.max(8, layer.clientHeight - 60) : st.origY + dy
    const x = Math.min(Math.max(0, st.origX + dx), maxX)
    const y = Math.min(Math.max(0, st.origY + dy), Math.max(maxY, layer ? layer.clientHeight - h : maxY))
    setRegPos({ x, y })
  }

  function onRegDragEnd() {
    const st = regDragRef.current
    if (st?.moved) setRegUserPositioned(true)
    regDragRef.current = null
    window.removeEventListener('mousemove', onRegDragMove)
    window.removeEventListener('mouseup', onRegDragEnd)
    window.removeEventListener('touchmove', onRegDragMove)
    window.removeEventListener('touchend', onRegDragEnd)
  }

  // ─── KHÔI PHỤC GIAO DỊCH TỪ sessionStorage LÚC MỞ TRANG ──
  // Chỉ chạy 1 lần lúc mount. Khác URL: mất khi đóng hẳn tab (chấp nhận
  // được — coi như hết ca), nhưng F5 vẫn còn nguyên, và không giới hạn
  // độ dài như query string.
  const TXS_STORAGE_KEY = 'momo-pos-open-txs'
  useEffect(() => {
    if (hydratedFromStorageRef.current) return
    hydratedFromStorageRef.current = true
    try {
      const raw = sessionStorage.getItem(TXS_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        const restored = deserializeTxs(arr)
        if (restored.length) {
          setTxs(restored)
          const nextScan = restored.find(t => t.type === 'scan' && t.status === 'PENDING' && !t.submittedCode)
          if (nextScan) setActiveCamId(nextScan.id)
        }
      }
    } catch (e) {
      console.error('Không khôi phục được giao dịch từ sessionStorage:', e)
    }
  }, [])

  // ─── GHI DANH SÁCH GIAO DỊCH VÀO sessionStorage MỖI KHI ĐỔI ──
  useEffect(() => {
    if (!hydratedFromStorageRef.current) return
    try {
      if (txs.length) sessionStorage.setItem(TXS_STORAGE_KEY, JSON.stringify(serializeTxs(txs)))
      else sessionStorage.removeItem(TXS_STORAGE_KEY)
    } catch (e) {
      console.error('Không lưu được giao dịch vào sessionStorage:', e)
    }
  }, [txs])

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

  // ─── ĐỒNG BỘ GIAO DỊCH GIỮA CÁC TAB/THIẾT BỊ ─────────────
  // sessionStorage chỉ sống trong 1 tab, nên trước đây tab/thiết bị khác
  // không hề biết quầy này đang mở gì. Giờ poll /api/momo/list-open định
  // kỳ để phát hiện đơn được TẠO Ở NƠI KHÁC (tab khác, máy khác) và tự
  // thêm vé tương ứng vào bảng — biến bảng vé từ "việc của riêng tab này"
  // thành 1 view chung của TẤT CẢ giao dịch đang mở trên toàn hệ thống.
  //
  // Cố tình chỉ THÊM vé còn thiếu, không đụng vào vé đã có sẵn cục bộ: vé
  // đã có tự cập nhật trạng thái qua vòng poll trạng thái riêng (bên dưới)
  // rồi, đụng vào đây dễ đè mất các state tạm thời như đang kiểm tra/đang
  // hủy/đã copy link... Khi 1 vé đạt trạng thái cuối (PAID/FAILED/EXPIRED)
  // ở NƠI KHÁC, nó sẽ tự biến mất khỏi list-open — nhưng thiết bị đang mở
  // vé cứ giữ nguyên tới khi người dùng chủ động đóng, không có gì phá vỡ.
  const SYNC_POLL_MS = 3000
  const [manualSyncing, setManualSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState(null)

  // syncOpenOrders được tách thành hàm dùng chung cho CẢ vòng poll tự
  // động (chạy ngầm mỗi 3s, silent) LẪN nút "Đồng bộ" bấm tay (silent:
  // false → có toast báo kết quả) — dùng khi nghi ngờ rớt mạng/bỏ lỡ
  // vòng poll tự động và muốn ép đồng bộ lại ngay lập tức.
  //
  // Ngoài việc THÊM vé còn thiếu (đơn mở ở thiết bị khác), giờ còn ĐỐI
  // CHIẾU NGƯỢC: nếu 1 vé đang PENDING cục bộ nhưng KHÔNG còn nằm trong
  // list-open trả về (nghĩa là đã chuyển sang trạng thái cuối — thành
  // công/thất bại/hết hạn — ở nơi khác rồi bị gỡ khỏi "đang mở" phía
  // server), hỏi lại /api/momo/status ngay lập tức thay vì chờ vòng poll
  // riêng của từng vé, để trạng thái final luôn được kéo về đúng lúc.
  const syncOpenOrders = useCallback(async ({ silent = true } = {}) => {
    try {
      const res = await fetch('/api/momo/list-open')
      if (!res.ok) {
        if (!silent) pushToast('⚠ Đồng bộ thất bại — lỗi mạng hoặc server, thử lại sau', 'err')
        return
      }
      const data = await res.json()
      const orders = Array.isArray(data.orders) ? data.orders : []
      setLastSyncAt(Date.now())

      const known = new Set(txsRef.current.map(t => t.orderId))
      const missing = orders.filter(o => !known.has(o.orderId))

      if (missing.length) {
        const startZ = zCounterRef.current
        const newTxs = missing.map((o, i) => {
          // Record cũ (tạo trước khi thêm field "type") có thể chưa có
          // type → suy luận qua payUrl/deeplink giống cách FE vẫn phân biệt.
          const type = o.type || (o.payUrl || o.deeplink ? 'p2p' : 'scan')
          const base = {
            id: uid(), type, orderId: o.orderId, amount: o.amount, orderInfo: o.orderInfo,
            storeId: o.storeId || '', storeName: o.storeName || '',
            status: o.status || 'PENDING',
            pos: { x: 24, y: 24 }, zIndex: startZ + i + 1,
            minimized: false, userPositioned: false,
          }
          if (type === 'p2p') {
            return {
              ...base,
              checkMsg: '', checking: false, cancelling: false, copied: false,
              payUrl: o.payUrl || '', deeplink: o.deeplink || '',
              expiresAt: o.createdAt ? new Date(o.createdAt).getTime() + P2P_DURATION_MS : Date.now() + P2P_DURATION_MS,
            }
          }
          return {
            ...base,
            checkMsg: o.submittedCode ? '⏳ Đã gửi mã, đang xác nhận giao dịch…' : '',
            checking: false, cancelling: false,
            manualCode: o.submittedCode || '', manualErr: '', submittedCode: o.submittedCode || '',
            isSubmittingCode: false, camError: '',
          }
        })
        zCounterRef.current = startZ + newTxs.length

        setTxs(prev => {
          // Lọc lại lần nữa theo state MỚI NHẤT (không dùng txsRef cũ ở
          // trên) để tránh thêm trùng nếu chính tab này vừa tạo đúng đơn
          // đó ngay trong lúc request list-open đang bay.
          const stillMissing = newTxs.filter(t => !prev.some(p => p.orderId === t.orderId))
          return stillMissing.length ? [...prev, ...stillMissing] : prev
        })

        // Nếu tab này chưa giữ camera nào (VD vừa mở trang, đồng bộ về 1
        // đơn Scan đang chờ quét từ thiết bị khác) → nhận nốt, để không bỏ
        // sót đơn cần quét chỉ vì đơn đó được tạo từ nơi khác.
        setActiveCamId(prevCam => {
          if (prevCam && txsRef.current.some(t => t.id === prevCam)) return prevCam
          const next = newTxs.find(t => t.type === 'scan' && t.status === 'PENDING' && !t.submittedCode)
          return next ? next.id : prevCam
        })
      }

      // Đối chiếu ngược — xem chi tiết ở comment phía trên.
      const openIds = new Set(orders.map(o => o.orderId))
      const staleLocal = txsRef.current.filter(t => t.status === 'PENDING' && !openIds.has(t.orderId))
      staleLocal.forEach(t => {
        fetch(`/api/momo/status?orderId=${encodeURIComponent(t.orderId)}`)
          .then(r => r.json())
          .then(d => {
            const status = d.status || 'PENDING'
            if (status === 'PENDING') return
            updateTx(t.id, {
              status,
              checkMsg: status === 'PAID' ? '✓ Thanh toán thành công!'
                : status === 'FAILED' ? `✗ Giao dịch thất bại${d.message ? `: ${d.message}` : ''}`
                : '⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.',
            })
            if (status === 'PAID') {
              setResultToast({ orderId: t.orderId, status: 'success', amount: d.amount || t.amount })
              setTimeout(() => removeTx(t.id), 1500)
            }
          })
          .catch(() => {})
      })

      if (!silent) {
        if (missing.length) pushToast(`✓ Đã đồng bộ — tìm thấy ${missing.length} giao dịch mới từ thiết bị khác`, 'ok')
        else pushToast('✓ Đã đồng bộ — không có giao dịch mới, mọi thứ đã cập nhật', 'info')
      }
    } catch (e) {
      console.error('Lỗi đồng bộ giao dịch giữa các thiết bị:', e)
      if (!silent) pushToast('⚠ Đồng bộ thất bại — kiểm tra kết nối mạng và thử lại', 'err')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    syncOpenOrders({ silent: true }) // chạy ngay lúc mount, không đợi tick 3s đầu tiên
    const id = setInterval(() => { if (!cancelled) syncOpenOrders({ silent: true }) }, SYNC_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [syncOpenOrders])

  async function handleManualSync() {
    if (manualSyncing) return
    setManualSyncing(true)
    await syncOpenOrders({ silent: false })
    setManualSyncing(false)
  }

  // ─── DỌN CÁC GIAO DỊCH ĐÃ HẾT HẠN KHỎI BẢNG (dọn dẹp hàng loạt,
  // tránh phải bấm "Đóng vé này" từng cái một khi có nhiều vé hết hạn) ──
  const expiredCount = txs.filter(t => t.status === 'EXPIRED').length
  function clearExpiredTxs() {
    const count = txsRef.current.filter(t => t.status === 'EXPIRED').length
    if (!count) return
    setTxs(prev => prev.filter(t => t.status !== 'EXPIRED'))
    pushToast(`🗑 Đã dọn ${count} giao dịch hết hạn khỏi bảng`, 'info')
  }

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
  async function createTransaction() {
    const amt = parseInt(amount, 10)
    if (!amt || amt <= 0) { setFormErr('Nhập số tiền hợp lệ.'); return }
    setFormErr('')
    setCreating(true)
    const finalOrderInfo = (orderInfo || '').trim() || genOrderId()
    const id = uid()

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
        zCounterRef.current += 1
        setTxs(prev => [...prev, {
          id, type: 'p2p',
          orderId: data.orderId || finalOrderInfo,
          amount: amt, orderInfo: finalOrderInfo,
          storeId: finalStoreId,
          storeName: stores.find(s => s.id === finalStoreId)?.name || '',
          status: 'PENDING', checkMsg: '', checking: false, cancelling: false,
          payUrl: data.payUrl, deeplink: data.deeplink || '',
          expiresAt: Date.now() + P2P_DURATION_MS, copied: false,
          pos: { x: 24, y: 24 }, zIndex: zCounterRef.current, minimized: false, userPositioned: false,
        }])
        setLastFocusedId(id)
        scrollNewTicketIntoView(id)
      } catch (e) {
        setFormErr('Lỗi server, thử lại sau.')
        setCreating(false)
        return
      }
    } else {
      const generatedId = `POS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
      try {
        await fetch('/api/momo/save-pending', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: generatedId, amount: amt, orderInfo: finalOrderInfo, ...(storeId ? { storeId } : {}) }),
        })
      } catch (e) { console.error('Lỗi lưu đơn hàng nháp:', e) }
      zCounterRef.current += 1
      setTxs(prev => [...prev, {
        id, type: 'scan',
        orderId: generatedId,
        amount: amt, orderInfo: finalOrderInfo,
        storeId, storeName: stores.find(s => s.id === storeId)?.name || '',
        status: 'PENDING', checkMsg: '', checking: false, cancelling: false,
        manualCode: '', manualErr: '', submittedCode: '', isSubmittingCode: false, camError: '',
        pos: { x: 24, y: 24 }, zIndex: zCounterRef.current, minimized: false, userPositioned: false,
      }])
      setActiveCamId(id) // đơn mới tạo tự giữ camera
      setLastFocusedId(id)
      scrollNewTicketIntoView(id)
    }

    // Khóa các ô nhập số tiền / mã đơn 1 nhịp ngắn để xác nhận rõ ràng với
    // người thu ngân rằng giao dịch đã được ghi nhận, trước khi mở lại
    // form trống cho giao dịch kế tiếp.
    setCreating(false)
    setJustCreated(true)
    setTimeout(() => {
      setAmount('')
      setOrderInfo(genOrderId())
      setJustCreated(false)
    }, 650)
  }

  // Cuộn nhẹ khu vực bảng để vé vừa tạo luôn nằm trong tầm nhìn, tránh
  // trường hợp vé mới bị "lạc" phía dưới nếu đã có nhiều vé khác ở trên.
  function scrollNewTicketIntoView(id) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = windowLayerRef.current?.querySelector(`[data-tx-id="${id}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      })
    })
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
    updateTx(txId, { checking: true })
    await fetch('/api/momo/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: tx.orderId }),
    }).catch(() => {})
    try {
      const res = await fetch(`/api/momo/status?orderId=${encodeURIComponent(tx.orderId)}`)
      const data = await res.json()
      const status = data.status || 'PENDING'
      updateTx(txId, { checking: false, status })
      const msg = status === 'PAID' ? `✓ ${tx.orderId}: Thanh toán thành công!`
        : status === 'EXPIRED' ? `⚠ ${tx.orderId}: Mã QR đã hết hạn, vui lòng tạo đơn mới.`
        : status === 'FAILED' ? `✗ ${tx.orderId}: Giao dịch thất bại${data.message ? `: ${data.message}` : ''}`
        : `⏳ ${tx.orderId}: Chưa nhận được thanh toán, khách vui lòng quét mã QR.`
      pushToast(msg, status === 'PAID' ? 'ok' : status === 'FAILED' || status === 'EXPIRED' ? 'err' : 'info')
      if (status === 'PAID') {
        setResultToast({ orderId: tx.orderId, status: 'success', amount: data.amount || tx.amount })
        setTimeout(() => removeTx(txId), 1500)
      }
    } catch (e) {
      updateTx(txId, { checking: false })
      pushToast(`⚠ ${tx.orderId}: Lỗi kết nối, thử kiểm tra lại.`, 'err')
    }
  }

  // Thanh toán lại (P2P hết hạn / thất bại): PHẢI hủy đơn cũ trên server
  // trước rồi mới tạo đơn mới — nếu tạo mới trước (hoặc không hủy), MoMo
  // vẫn còn thấy orderId cũ đang tồn tại → báo trùng orderId, sinh ra 2
  // giao dịch treo cùng lúc. Nội dung thanh toán (orderInfo) giữ nguyên
  // để khách vẫn thấy đúng nội dung ban đầu; chỉ orderId đổi mới.
  async function retryP2pOrder(txId) {
    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx || tx.type !== 'p2p' || tx.retrying) return
    updateTx(txId, { retrying: true, checkMsg: '⏳ Đang tạo lại đơn…' })

    // 1) Xóa/hủy đơn cũ trước
    try {
      await fetch('/api/momo/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: tx.orderId }),
      })
    } catch (e) { console.error('Lỗi hủy đơn cũ khi thanh toán lại:', e) }

    // 2) Tạo đơn mới — giữ nguyên orderInfo hiển thị, nhưng nếu vẫn bị báo
    // trùng (đơn cũ chưa kịp giải phóng khỏi Redis/MoMo) thì bump nhẹ nội
    // dung gửi lên server (không đổi orderInfo hiển thị trên vé) để đảm
    // bảo orderId mới luôn khác đơn cũ.
    const amt = tx.amount
    const displayOrderInfo = tx.orderInfo
    let sendOrderInfo = displayOrderInfo
    const MAX_RETRY = 5
    let attempt = 0, data = null, ok = false

    try {
      while (attempt < MAX_RETRY) {
        const url = buildP2pUrl(amt, sendOrderInfo, tx.storeId)
        const res = await fetch(url)
        data = await res.json()
        if (res.ok && data.payUrl) { ok = true; break }
        const dup = data?.resultCode === 41 || /trùng|duplicate|exist/i.test(data?.error || '')
        if (dup) {
          const match = sendOrderInfo.match(/^(.+)_(\d+)$/)
          sendOrderInfo = match ? `${match[1]}_${parseInt(match[2]) + 1}` : `${sendOrderInfo}_2`
          attempt++
          continue
        }
        break
      }
    } catch (e) {
      updateTx(txId, { retrying: false, checkMsg: '⚠ Lỗi kết nối, thử lại sau.' })
      return
    }

    if (!ok) {
      updateTx(txId, { retrying: false, checkMsg: `✗ Tạo đơn mới thất bại${data?.error ? `: ${data.error}` : ''}` })
      return
    }

    zCounterRef.current += 1
    updateTx(txId, {
      orderId: data.orderId || sendOrderInfo,
      orderInfo: displayOrderInfo,
      status: 'PENDING', checkMsg: '', checking: false, cancelling: false, retrying: false,
      payUrl: data.payUrl, deeplink: data.deeplink || '',
      expiresAt: Date.now() + P2P_DURATION_MS, copied: false,
      zIndex: zCounterRef.current,
    })
    bringToFront(txId)
  }

  // Đóng vé: nếu còn PENDING (đang chờ thật sự) mới cần hỏi xác nhận vì
  // hủy lúc này = gọi API hủy/đánh dấu thất bại thật trên server. Nếu vé
  // đã ở trạng thái kết thúc rồi (PAID/EXPIRED/FAILED) thì không còn gì
  // để "hủy" nữa — đóng thẳng khỏi danh sách, không hỏi lại.
  function closeTicket(txId) {
    const tx = txsRef.current.find(t => t.id === txId)
    if (!tx) return
    if (tx.status === 'PENDING') {
      setConfirmCancel({ id: txId })
    } else {
      removeTx(txId)
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
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #__next { margin: 0; padding: 0; height: 100%; width: 100%; font-family: 'Outfit', -apple-system, sans-serif; }
        :root {
          --mm: #ae0070; --mm-light: rgba(174,0,112,0.08); --mm-mid: rgba(174,0,112,0.15);
          --surface: #ffffff; --paper: #fffaf6; --bg: #f4ede9; --border: #ece1e6; --text: #1a0f16;
          --muted: #9c8094; --subtle: #f2eaf0;
          --mono: 'JetBrains Mono', ui-monospace, monospace;
        }
        html, body, #__next { background: var(--bg); }
        .app-shell { display: flex; flex-direction: column; width: 100%; height: 100dvh; overflow: hidden; background: var(--bg); }

        /* ── CỬA SỔ ĐĂNG KÝ (quầy thu ngân): giờ là 1 cửa sổ nổi kéo-thả
           được như vé giao dịch, mặc định nằm CHÍNH GIỮA màn hình, nhưng
           được làm NỔI BẬT hơn hẳn các vé thường: viền đậm màu thương
           hiệu, đổ bóng hồng sâu hơn, và dải ruy-băng "Quầy chính" ghim
           ở góc để không ai nhầm nó với một vé giao dịch bình thường ── */
        .register-float { position: absolute; }
        .register-window {
          position: relative; width: 100%; background: var(--surface);
          border: 2px solid var(--mm); border-radius: 20px; overflow: hidden;
          box-shadow: 0 26px 60px rgba(174,0,112,0.30), 0 0 0 6px rgba(174,0,112,0.07);
        }
        .register-ribbon {
          position: absolute; top: 17px; right: -38px; z-index: 3; pointer-events: none;
          background: var(--mm); color: #fff; font-size: 10px; font-weight: 800;
          letter-spacing: 0.08em; text-transform: uppercase; padding: 5px 42px;
          transform: rotate(45deg); box-shadow: 0 2px 8px rgba(0,0,0,0.22);
        }
        .register-head {
          display: flex; flex-direction: column; gap: 2px; padding: 20px 22px 4px;
          cursor: grab; user-select: none; touch-action: none;
        }
        .register-head:active { cursor: grabbing; }
        .register-body { padding: 12px 22px 22px; max-height: 82vh; overflow-y: auto; }
        .dock-eyebrow {
          display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono);
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--mm); margin-bottom: 8px;
        }
        .dock-eyebrow::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--mm); display: inline-block; }
        .dock-title { font-size: 21px; font-weight: 800; color: var(--text); margin-bottom: 2px; letter-spacing: -0.01em; }
        .field-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px;
        }
        .field-label svg { flex-shrink: 0; display: block; }
        .field-block { margin-bottom: 18px; }

        .method-tabs { display: flex; gap: 8px; }
        .method-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 10px 6px; border: 1.5px solid var(--border); border-radius: 12px;
          background: var(--surface); cursor: pointer; transition: all 0.15s;
        }
        .method-tab:hover { border-color: rgba(174,0,112,0.3); background: var(--mm-light); }
        .method-tab.active { border-color: var(--mm); background: var(--mm-light); }
        .method-tab.locked { opacity: 0.6; cursor: not-allowed; pointer-events: none; }
        .method-tab-icon { color: var(--muted); line-height: 0; }
        .method-tab.active .method-tab-icon { color: var(--mm); }
        .method-tab-label { font-size: 11.5px; font-weight: 700; color: var(--muted); }
        .method-tab.active .method-tab-label { color: var(--mm); }
        .method-tab-desc { font-size: 9px; font-weight: 500; color: var(--muted); text-align: center; }

        .info-input {
          width: 100%; padding: 11px 12px; border: 1.5px solid var(--border); border-radius: 10px;
          font-family: inherit; font-size: 14px; font-weight: 600; color: var(--text); background: var(--surface);
          outline: none; transition: border-color 0.15s;
        }
        .info-input:disabled { opacity: 0.6; cursor: not-allowed; background: var(--subtle); }
        .info-input:focus { border-color: var(--mm); }

        /* ── Ô SỐ TIỀN: input và ký hiệu ₫ là 2 khối flex TÁCH BIỆT (không
           còn đè lớp tuyệt đối lên nhau) → dù số dài cỡ nào, ₫ luôn đứng
           yên trong khối riêng của nó, không bao giờ dính/che vào chữ số ── */
        .amount-suffix-row {
          display: flex; align-items: stretch; width: 100%;
          border: 1.5px solid var(--border); border-radius: 10px; background: var(--surface);
          overflow: hidden; transition: border-color 0.15s;
        }
        .amount-suffix-row:focus-within { border-color: var(--mm); }
        .amount-suffix-row.locked { opacity: 0.6; background: var(--subtle); }
        .amount-input {
          flex: 1 1 auto; min-width: 0; width: auto; padding: 11px 12px;
          border: none; border-radius: 0; outline: none; background: transparent;
          font-size: 26px; font-weight: 800; text-align: right; color: var(--text);
          font-family: var(--mono);
        }
        .amount-input:disabled { cursor: not-allowed; }
        .amount-suffix {
          flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
          padding: 0 14px; font-size: 15px; font-weight: 800; color: var(--mm);
          background: var(--mm-light); border-left: 1.5px solid var(--border); pointer-events: none;
        }

        /* ── STORE DROPDOWN: thay <select> mặc định của trình duyệt ── */
        .store-dd { position: relative; }
        .store-dd-trigger {
          width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 12px 14px; border: 1.5px solid var(--border); border-radius: 14px;
          font-family: inherit; font-size: 14px; font-weight: 600; color: var(--text); background: var(--surface);
          cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s; text-align: left;
        }
        .store-dd-trigger:hover { border-color: var(--mm); background: var(--mm-light); box-shadow: 0 4px 14px rgba(174,0,112,0.14); }
        .store-dd.open .store-dd-trigger { border-color: var(--mm); box-shadow: 0 0 0 3px rgba(174,0,112,0.14); }
        .store-dd.disabled .store-dd-trigger { opacity: 0.6; cursor: not-allowed; }
        .store-dd-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .store-dd-chevron { color: var(--muted); flex-shrink: 0; display: flex; transition: transform 0.15s; }
        .store-dd.open .store-dd-chevron { transform: rotate(180deg); color: var(--mm); }
        .store-dd-list {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 40;
          background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px;
          box-shadow: 0 14px 34px rgba(26,15,22,0.16); padding: 6px; max-height: 240px; overflow-y: auto;
        }
        .store-dd-item {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 9px 10px; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: var(--text);
          cursor: pointer;
        }
        .store-dd-item:hover { background: var(--mm-light); }
        .store-dd-item.active { background: var(--mm-light); color: var(--mm); font-weight: 800; }
        .store-dd-check { color: var(--mm); display: flex; flex-shrink: 0; }
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

        /* ── BOARD: bảng vé giao dịch, lấp đầy toàn bộ phần còn lại, nền
           luôn có hiệu ứng gradient trôi nhẹ (không chỉ lúc trống) ── */
        .board-bar {
          flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
          padding: 16px 28px; border-bottom: 1px solid var(--border); background: var(--surface);
        }
        .board-bar-title { font-size: 14px; font-weight: 800; color: var(--text); }
        .board-bar-count { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--muted); }
        .board-bar-count b { color: var(--mm); }
        .board-bar-right { display: flex; align-items: center; gap: 12px; }
        .new-tab-btn {
          display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9px;
          border: 1.5px solid var(--border); background: var(--surface); color: var(--text);
          font-size: 11.5px; font-weight: 700; cursor: pointer; transition: border-color 0.15s, color 0.15s;
        }
        .new-tab-btn:hover { border-color: var(--mm); color: var(--mm); }
        .board-bar-synced { font-family: var(--mono); font-size: 10.5px; color: var(--muted); white-space: nowrap; }
        .sync-btn {
          display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9px;
          border: 1.5px solid var(--border); background: var(--surface); color: var(--text);
          font-size: 11.5px; font-weight: 700; cursor: pointer; transition: border-color 0.15s, color 0.15s, opacity 0.15s;
        }
        .sync-btn:hover:not(:disabled) { border-color: var(--mm); color: var(--mm); }
        .sync-btn:disabled { opacity: 0.7; cursor: default; }
        .sync-btn.syncing { border-color: var(--mm); color: var(--mm); }
        .sync-icon { display: inline-flex; }
        .sync-icon.spin { animation: sync-spin 0.9s linear infinite; }
        @keyframes sync-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .clear-expired-btn {
          display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9px;
          border: 1.5px solid #f3c1c1; background: #fdf0f0; color: #c0392b;
          font-size: 11.5px; font-weight: 700; cursor: pointer; transition: background 0.15s, border-color 0.15s;
        }
        .clear-expired-btn:hover { background: #fbe0e0; border-color: #c0392b; }
        .board {
          flex: 1; position: relative; overflow: auto; padding: 24px 28px 40px;
          background: linear-gradient(120deg, var(--bg) 0%, var(--mm-light) 30%, #fdf2f8 50%, var(--mm-light) 70%, var(--bg) 100%);
          background-size: 300% 300%;
          animation: driftGradient 16s ease-in-out infinite;
          /* Ẩn tạm cho tới khi đã đo được kích thước khung để canh giữa —
             tránh hiện tượng vé/quầy bị dồn vào góc trên-trái rồi mới
             "nhảy" ra giữa màn hình ngay trước mắt người dùng */
          opacity: 0; transition: opacity 0.2s ease;
        }
        .board.ready { opacity: 1; }
        .board.is-empty {
          display: flex; align-items: center; justify-content: center;
        }
        @keyframes driftGradient {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        /* ── MÀN HÌNH CHỜ (loading toàn màn hình khi đang tải dữ liệu quầy) ── */
        .page-loader {
          position: fixed; inset: 0; z-index: 5000; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 16px;
          background: linear-gradient(120deg, var(--bg) 0%, var(--mm-light) 30%, #fdf2f8 50%, var(--mm-light) 70%, var(--bg) 100%);
          background-size: 300% 300%; animation: driftGradient 6s ease-in-out infinite;
        }
        .page-loader-spin {
          width: 42px; height: 42px; border: 3px solid rgba(174,0,112,0.15); border-top-color: var(--mm);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        .page-loader-text { font-size: 13px; font-weight: 700; color: var(--muted); letter-spacing: 0.02em; }
        .ticket-float { position: absolute; }
        .board-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 8px; color: var(--muted); font-size: 13.5px; font-weight: 600; text-align: center;
          padding: 60px 20px;
        }
        .board-empty-icon {
          width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
          color: var(--mm); margin-bottom: 10px; border-radius: 50%;
          background: radial-gradient(circle, rgba(174,0,112,0.14) 0%, rgba(174,0,112,0.03) 70%);
          animation: pulseGlow 2.4s ease-in-out infinite;
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(174,0,112,0.12); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(174,0,112,0); }
        }

        /* ── TICKET (vé giao dịch, kiểu hóa đơn POS) ── */
        .ticket {
          position: relative; width: 300px; max-width: 100%; background: var(--paper); border-radius: 14px;
          box-shadow: 0 2px 10px rgba(26,15,22,0.06); border: 1px solid var(--border);
          overflow: hidden; transition: box-shadow 0.15s, border-color 0.15s; align-self: start;
        }
        .ticket.focused { border-color: var(--mm); box-shadow: 0 10px 28px rgba(174,0,112,0.16); }
        .ticket.is-paid { opacity: 0.88; }
        .ticket.is-expired { opacity: 0.7; }
        .ticket-ended-msg {
          font-size: 12.5px; font-weight: 700; color: var(--muted); text-align: center;
          padding: 14px 8px; background: var(--subtle); border-radius: 9px;
        }
        .ticket-close-btn { width: 100%; margin-top: 10px; }
        .ticket-notch {
          position: absolute; top: 44px; width: 16px; height: 16px; border-radius: 50%;
          background: var(--bg); border: 1px solid var(--border); z-index: 1;
        }
        .ticket-notch.left { left: -9px; }
        .ticket-notch.right { right: -9px; }
        .ticket-stamp {
          position: absolute; top: 54px; right: 22px; z-index: 2; pointer-events: none;
          font-family: var(--mono); font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
          color: #1e8449; border: 2px solid #1e8449; border-radius: 6px; padding: 3px 8px;
          transform: rotate(-9deg); opacity: 0.75;
        }
        .ticket-head {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 12px 16px; background: var(--mm-light);
          cursor: grab; user-select: none; touch-action: none;
        }
        .ticket-head:active { cursor: grabbing; }
        .ticket-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .ticket-head-right { display: flex; align-items: center; gap: 6px; }
        .ticket-perf {
          height: 0; border-top: 2px dashed var(--border); margin: 0 16px;
        }
        .ticket-body { padding: 14px 16px 16px; }
        .modal-type-icon { color: var(--mm); line-height: 0; flex-shrink: 0; }
        .modal-amount { font-family: var(--mono); font-size: 16px; font-weight: 800; color: var(--text); white-space: nowrap; }
        .modal-close-btn {
          width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent; color: var(--muted);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .modal-close-btn:hover { background: rgba(192,57,43,0.12); color: #c0392b; }
        .modal-min-btn {
          width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent; color: var(--muted);
          display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; font-weight: 800; line-height: 1; padding-bottom: 3px;
        }
        .modal-min-btn:hover { background: rgba(0,0,0,0.08); color: var(--text); }

        /* ── TASKBAR: các vé đã thu nhỏ ── */
        .taskbar {
          flex: 0 0 auto; flex-shrink: 0; min-height: 44px; position: relative; z-index: 60;
          display: flex; align-items: center; gap: 8px; padding: 10px 20px;
          border-top: 1px solid var(--border); background: var(--surface); overflow-x: auto;
        }
        .taskbar-item {
          display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9px;
          border: 1.5px solid var(--border); background: var(--subtle); color: var(--text);
          font-family: var(--mono); font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer;
        }
        .taskbar-item:hover { border-color: var(--mm); color: var(--mm); }
        .cam-active-pill {
          display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 800; color: var(--mm);
          background: rgba(174,0,112,0.12); padding: 3px 7px; border-radius: 999px;
        }
        .status-badge { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
        .status-pending { background: rgba(214,158,46,0.15); color: #b9770e; }
        .status-paid { background: rgba(39,174,96,0.15); color: #1e8449; }
        .status-failed { background: rgba(192,57,43,0.15); color: #c0392b; }
        .status-expired { background: rgba(120,120,120,0.15); color: #6b6b6b; }

        .info-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; padding: 5px 0; }
        .info-row span:first-child { color: var(--muted); font-weight: 600; }
        .info-row span:last-child { font-family: var(--mono); color: var(--text); font-weight: 700; text-align: right; word-break: break-all; }
        .info-row span.store-name-val { font-family: inherit; color: var(--mm); font-weight: 800; letter-spacing: -0.01em; }
        .info-divider { height: 0; border-top: 2px dashed var(--border); margin: 8px 0; }

        .qr-wrap { display: flex; justify-content: center; padding: 10px 0; }
        .qr-wrap img { width: 170px; height: 170px; border-radius: 10px; border: 1px solid var(--border); }
        .qr-loading { width: 170px; height: 170px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: 11.5px; text-align: center; }
        .qr-spinner { border-color: rgba(174,0,112,0.2); border-top-color: var(--mm); }
        .qr-retry-btn { width: auto; flex: none; margin-top: 4px; padding: 6px 14px; }

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
          font-family: var(--mono); font-size: 13.5px; font-weight: 700; letter-spacing: 0.02em; text-align: center;
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
          padding: 12px 20px; border-radius: 12px; color: #fff; font-size: 13px; font-weight: 700;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25); max-width: 340px; animation: toast-in 0.2s ease-out; cursor: pointer;
        }
        .toast.toast-ok { background: #1e8449; }
        .toast.toast-err { background: #c0392b; }
        .toast.toast-info { background: var(--text); }
        .toast-center { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 999; cursor: default; }
        .toast-stack {
          position: fixed; bottom: 20px; right: 20px; z-index: 998;
          display: flex; flex-direction: column-reverse; gap: 10px; align-items: flex-end;
          pointer-events: none;
        }
        .toast-stack .toast { pointer-events: auto; }
        @keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* ── CONFIRM CANCEL MODAL ── */
        .cancel-modal-backdrop { position: fixed; inset: 0; background: rgba(26,15,22,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .cancel-modal-box { background: var(--surface); border-radius: 16px; padding: 22px; width: 320px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
        .cancel-modal-title { font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .cancel-modal-desc { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin-bottom: 16px; }
        .cancel-modal-actions { display: flex; gap: 8px; }
        .cancel-modal-keep, .cancel-modal-confirm { flex: 1; padding: 10px; border-radius: 9px; font-size: 12.5px; font-weight: 800; border: none; cursor: pointer; }
        .cancel-modal-keep { background: var(--subtle); color: var(--text); }
        .cancel-modal-confirm { background: #c0392b; color: #fff; }

        @media (max-width: 860px) {
          .app-shell { height: auto; min-height: 100dvh; }
          .board {
            padding: 18px 16px 32px; display: flex; flex-direction: column; align-items: center; gap: 16px;
            overflow: visible;
          }
          /* Màn hình nhỏ: bỏ kéo-thả tự do, xếp cửa sổ theo cột như danh sách bình thường */
          .ticket-float, .register-float { position: static !important; left: auto !important; top: auto !important; width: 100% !important; max-width: 340px; }
          .ticket { width: 100%; }
          .register-window { width: 100%; }
          .ticket-head, .register-head { cursor: default; }
          .board-bar { padding: 12px 16px; flex-wrap: wrap; gap: 8px; }
          .board-bar-right { flex-wrap: wrap; gap: 8px; }
          .board-bar-synced { width: 100%; order: 10; }
        }
      `}</style>

      <div className="app-shell">
        {storesLoading && (
          <div className="page-loader">
            <div className="page-loader-spin" />
            <div className="page-loader-text">Đang tải dữ liệu quầy…</div>
          </div>
        )}
        <div className="board-bar">
          <span className="board-bar-title">Giao dịch đang mở</span>
          <div className="board-bar-right">
            {txs.length > 0 && <span className="board-bar-count"><b>{txs.length}</b> đang mở</span>}
            {lastSyncAt && (
              <span className="board-bar-synced" title="Lần đồng bộ gần nhất với server">
                Đồng bộ lúc {new Date(lastSyncAt).toLocaleTimeString('vi-VN')}
              </span>
            )}
            {expiredCount > 0 && (
              <button
                className="clear-expired-btn"
                onClick={clearExpiredTxs}
                title="Xoá tất cả giao dịch đã hết hạn khỏi bảng, dọn dẹp một lần thay vì đóng từng vé"
              >
                <IconTrash /> Dọn hết hạn ({expiredCount})
              </button>
            )}
            <button
              className={`sync-btn${manualSyncing ? ' syncing' : ''}`}
              onClick={handleManualSync}
              disabled={manualSyncing}
              title="Ép đồng bộ ngay với server — dùng khi nghi ngờ mất mạng hoặc bỏ lỡ vòng tự động, sẽ lấy giao dịch từ tab/thiết bị khác và cập nhật lại trạng thái mọi vé"
            >
              <span className={`sync-icon${manualSyncing ? ' spin' : ''}`}><IconSync /></span>
              {manualSyncing ? 'Đang đồng bộ…' : 'Đồng bộ'}
            </button>
            <button
              className="new-tab-btn"
              onClick={() => window.open(window.location.pathname, '_blank')}
              title="Mở tab mới — tab mới sẽ có danh sách giao dịch riêng, độc lập với tab này"
            >
              <IconNewTab /> Mở tab mới
            </button>
          </div>
        </div>

        {/* ── BOARD: nền chuyển động gradient + toàn bộ cửa sổ nổi ── */}
        <div
          className={`board${txs.length === 0 ? ' is-empty' : ''}${layoutW ? ' ready' : ''}`}
          ref={windowLayerRef}
          style={boardMinHeight ? { minHeight: boardMinHeight } : undefined}
        >
          {txs.length === 0 && (
            <div className="board-empty">
              <span className="board-empty-icon"><IconScan /></span>
              Chưa có giao dịch nào đang mở.<br />Tạo giao dịch mới từ quầy thu ngân ở giữa màn hình.
            </div>
          )}

          {/* ── CỬA SỔ ĐĂNG KÝ (quầy thu ngân): là 1 cửa sổ nổi kéo-thả được
              như vé giao dịch. Khi CHƯA có giao dịch nào mở, nằm CHÍNH GIỮA
              màn hình cho nổi bật, mời tạo giao dịch đầu tiên. Ngay khi có
              ≥1 giao dịch mở, tự động NEO GỌN vào góc trên-trái để nhường
              toàn bộ phần trên của bảng cho vé mới xếp lưới (không còn bị
              đẩy xuống dưới quầy như trước). Luôn được "đóng dấu" đặc biệt
              hơn vé thường (viền đậm, đổ bóng hồng, dải ruy-băng "Quầy
              chính") để dễ phân biệt ── */}
          <div
            className="ticket-float register-float"
            ref={regElRef}
            style={{ left: regPos.x, top: regPos.y, width: REGISTER_W, zIndex: regZIndex }}
            onMouseDown={bringRegToFront}
          >
            <div className="register-window">
              <div className="register-ribbon">Quầy chính</div>
              <div className="register-head" onMouseDown={onRegDragStart} onTouchStart={onRegDragStart}>
                <div className="dock-eyebrow">Quầy thu ngân</div>
                <div className="dock-title">Tạo giao dịch</div>
              </div>

              <div className="register-body">
                {stores.length > 1 && (
                  <div className="field-block">
                    <div className="field-label"><IconStore /> Cửa hàng</div>
                    <StoreDropdown stores={stores} value={storeId} onChange={setStoreId} disabled={storesLoading} />
                  </div>
                )}

                <div className="field-block">
                  <div className="field-label">Phương thức</div>
                  <div className="method-tabs">
                    {methodConfig.map(m => (
                      <div
                        key={m.key}
                        className={`method-tab${method === m.key ? ' active' : ''}${creating ? ' locked' : ''}`}
                        onClick={() => !creating && setMethod(m.key)}
                      >
                        <span className="method-tab-icon">{m.icon}</span>
                        <span className="method-tab-label">{m.label}</span>
                        <span className="method-tab-desc">{m.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="field-block">
                  <div className="field-label">Số tiền thanh toán</div>
                  <div className={`amount-suffix-row${creating || justCreated ? ' locked' : ''}`}>
                    <input
                      ref={amountInputRef}
                      className="amount-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatAmount(amount)}
                      onChange={e => setAmount(unformatAmount(e.target.value))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && canSubmit && !creating && !justCreated) createTransaction()
                      }}
                      disabled={creating || justCreated}
                    />
                    <span className="amount-suffix">₫</span>
                  </div>
                </div>

                <div className="field-block">
                  <div className="field-label">Mã đơn hàng</div>
                  <input
                    className="info-input"
                    type="text"
                    value={orderInfo}
                    onChange={e => setOrderInfo(e.target.value)}
                    disabled={creating || justCreated}
                  />
                </div>

                {formErr && <div className="form-err">⚠ {formErr}</div>}

                <button className="confirm-btn" onClick={createTransaction} disabled={!canSubmit || creating || justCreated}>
                  {creating
                    ? <><div className="spinner" /> Đang tạo…</>
                    : justCreated ? <>✓ Đã tạo giao dịch</> : <>+ Tạo giao dịch</>}
                </button>

                {currentStoreName && stores.length <= 1 && (
                  <div className="count-badge" style={{ marginTop: 10 }}>Cửa hàng: {currentStoreName}</div>
                )}
              </div>
            </div>
          </div>

          {txs.filter(tx => !tx.minimized).map(tx => {
              const isCamOwner = tx.type === 'scan' && activeCamId === tx.id
              const pos = tx.pos || { x: 24, y: 24 }
              return (
                <div
                  key={tx.id}
                  data-tx-id={tx.id}
                  className="ticket-float"
                  style={{ left: pos.x, top: pos.y, zIndex: tx.zIndex || 10 }}
                >
                <TicketCard
                  tx={tx}
                  isFocused={lastFocusedId === tx.id}
                  onFocus={() => bringToFront(tx.id)}
                  onHeaderDown={e => onDragStart(e, tx)}
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
                    <button className="modal-min-btn" title="Thu nhỏ" onClick={() => toggleMinimize(tx.id)}>–</button>
                    <button className="modal-close-btn" onClick={() => closeTicket(tx.id)}><IconClose /></button>
                  </>
                }
              >
                <div className="info-row"><span>Mã đơn hàng</span><span>{tx.orderId}</span></div>
                <div className="info-row"><span>Nội dung</span><span>{tx.orderInfo}</span></div>
                {tx.storeName && <div className="info-row"><span>Cửa hàng</span><span className="store-name-val">{tx.storeName}</span></div>}
                <div className="info-divider" />

                {tx.type === 'p2p' ? (
                  tx.status === 'EXPIRED' ? (
                    <>
                      <div className="ticket-ended-msg">⚠ Mã QR đã hết hạn</div>
                      {tx.checkMsg && <div className="check-msg err">{tx.checkMsg}</div>}
                      <div className="btn-row">
                        <button className="btn-primary" disabled={tx.retrying} onClick={() => retryP2pOrder(tx.id)}>
                          {tx.retrying ? <div className="spinner" /> : '⟲ Thanh toán lại'}
                        </button>
                        <button className="btn-secondary ticket-close-btn" disabled={tx.retrying} onClick={() => removeTx(tx.id)}>Đóng vé này</button>
                      </div>
                    </>
                  ) : (
                  <>
                    {tx.status !== 'PAID' && <QrImage orderId={tx.orderId} />}
                    {tx.status === 'PENDING' && (
                      <div className="info-row"><span>Còn lại</span>
                        <span className={`countdown${Math.ceil((tx.expiresAt - now) / 1000) <= 60 ? ' warn' : ''}`}>
                          {formatCountdown(Math.ceil((tx.expiresAt - now) / 1000))}
                        </span>
                      </div>
                    )}
                    {tx.checkMsg && (
                      <div className={`check-msg${tx.status === 'PAID' ? ' ok' : tx.status === 'FAILED' ? ' err' : ''}`}>{tx.checkMsg}</div>
                    )}
                    {tx.payUrl && tx.status !== 'PAID' && (
                      <button className={`copy-link-btn${tx.copied ? ' copied' : ''}`} onClick={() => copyPayUrl(tx.id)}>
                        {tx.copied ? '✓ Đã copy link thanh toán' : '📋 Copy link thanh toán'}
                      </button>
                    )}
                    <div className="btn-row">
                      {tx.status === 'FAILED' ? (
                        <button className="btn-primary" disabled={tx.retrying} onClick={() => retryP2pOrder(tx.id)}>
                          {tx.retrying ? <div className="spinner" /> : '⟲ Thanh toán lại'}
                        </button>
                      ) : (
                        <button className="btn-primary" disabled={tx.checking || tx.status !== 'PENDING'} onClick={() => checkP2pNow(tx.id)}>
                          {tx.checking ? <div className="spinner" /> : '✓ Kiểm tra'}
                        </button>
                      )}
                      <button className="btn-secondary" disabled={tx.cancelling || tx.retrying} onClick={() => closeTicket(tx.id)}>
                        ✕ {tx.status === 'PENDING' ? 'Hủy' : 'Đóng'}
                      </button>
                    </div>
                  </>
                  )
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
                          <button className="btn-secondary" disabled={tx.cancelling} onClick={() => closeTicket(tx.id)}>
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
                          <button className="btn-secondary" disabled={tx.status === 'PAID'} onClick={() => closeTicket(tx.id)}>
                            ✕ {tx.status === 'PENDING' ? 'Hủy' : 'Đóng'}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                </TicketCard>
                </div>
              )
            })}
          </div>

          {txs.some(t => t.minimized) && (
            <div className="taskbar">
              {txs.filter(t => t.minimized).map(t => (
                <button key={t.id} className="taskbar-item" onClick={() => toggleMinimize(t.id)}>
                  <span className="modal-type-icon">{t.type === 'p2p' ? <IconP2P /> : <IconScan />}</span>
                  {formatAmount(String(t.amount))}₫
                  <StatusBadge status={t.status} />
                </button>
              ))}
            </div>
          )}
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
        <div className="toast toast-ok toast-center">
          ✓ Giao dịch {resultToast.orderId} thành công{resultToast.amount ? ` — ${formatAmount(String(resultToast.amount))}₫` : ''}
        </div>
      )}

      {/* ── TOAST TRẠNG THÁI KHI BẤM "KIỂM TRA" — nổi ngoài cửa sổ, tự đóng sau ~5.5s ── */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  )
}