// pages/admin/create-transaction.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
const TX_BASE_URL = 'https://kiehtt.vercel.app'

function buildTxUrl(method, amount, orderInfo) {
  const amt = parseInt(amount, 10)
  if (!amt || amt <= 0) return null
  // Scan QR giờ xử lý INLINE ngay trong trang (xem startScan()), không còn
  // điều hướng qua /api/momo/scan (GET) nữa → chỉ build URL cho p2p.
  if (method !== 'p2p') return null
  return `${TX_BASE_URL}/api/momo/create-p2p?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}`
}

function cleanCode(raw) {
  return (raw || '').trim()
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

// ─── P2P TIMING ──────────────────────────────────────────────
const P2P_DURATION_MS = 10 * 60 * 1000 // mỗi giao dịch P2P sống 10 phút
const P2P_POLL_MS     = 1000           // tần suất tự động kiểm tra trạng thái

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const r = (s % 60).toString().padStart(2, '0')
  return `${m}:${r}`
}

// ─── AI AMOUNT PARSER ───────────────────────────────────────
// Gọi Anthropic API để parse ngôn ngữ tự nhiên → số tiền VNĐ
async function parseAmountWithAI(userInput) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `Bạn là AI trợ lý tài chính chuyên parse số tiền Việt Nam từ ngôn ngữ tự nhiên.
Nhiệm vụ: Đọc input của người dùng và trả về JSON với format sau (KHÔNG có markdown, KHÔNG có text khác):
{
  "amount": <số nguyên bằng đồng VNĐ hoặc null nếu không rõ>,
  "display": "<chuỗi hiển thị thân thiện, ví dụ: 500.000đ>",
  "suggestions": [<tối đa 3 số nguyên gợi ý liên quan>],
  "confidence": <0.0-1.0>,
  "note": "<giải thích ngắn gọn, tối đa 10 từ>"
}

Quy tắc parse:
- "50k" / "50 nghìn" / "50,000" → 50000
- "1 triệu" / "1M" / "1tr" → 1000000  
- "2 rưỡi" / "2.5 triệu" → 2500000
- "nửa triệu" → 500000
- "ăn trưa" / "cà phê" → gợi ý 25000, 35000, 50000
- "tiền điện" → gợi ý 200000, 300000, 500000
- "tiền nhà" / "thuê nhà" → gợi ý 3000000, 5000000, 8000000
- Nếu không có số và không đoán được context → amount: null, suggestions: []`,
      messages: [{ role: 'user', content: userInput }],
    }),
  })
  const data = await res.json()
  const text = data.content?.map(b => b.text || '').join('') || ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

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
const IconSparkle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>
)
const IconClose = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)
const IconArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
)

// ─── AI AMOUNT WIDGET ───────────────────────────────────────
function AiAmountWidget({ onAmountSelect }) {
  const [open,        setOpen]        = useState(false)
  const [inputValue,  setInputValue]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const textInputRef  = useRef(null)
  const isMobile      = useRef(false)

  // Detect mobile once
  useEffect(() => {
    isMobile.current = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent)
  }, [])

  // Khi mở panel → focus text input (không phải number input)
  useEffect(() => {
    if (open) {
      setTimeout(() => textInputRef.current?.focus(), 80)
      setResult(null)
      setError(null)
      setInputValue('')
    }
  }, [open])

  const handleAsk = useCallback(async (overrideInput) => {
    const q = (overrideInput ?? inputValue).trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const parsed = await parseAmountWithAI(q)
      setResult(parsed)
    } catch (e) {
      setError('Không kết nối được AI. Thử lại sau.')
    } finally {
      setLoading(false)
    }
  }, [inputValue])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAsk()
  }

  const applyAmount = (amt) => {
    onAmountSelect(String(amt))
    setOpen(false)
    setResult(null)
    setInputValue('')
  }

  const EXAMPLE_PROMPTS = ['50k', '2 triệu rưỡi', 'tiền điện tháng này', 'ăn trưa']

  return (
    <>
      {/* FAB TRIGGER */}
      <button
        className="ai-fab"
        onClick={() => setOpen(v => !v)}
        title="Gợi ý số tiền bằng AI"
        aria-label="AI gợi ý số tiền"
      >
        <IconSparkle />
        <span className="ai-fab-label">AI</span>
      </button>

      {/* BACKDROP */}
      {open && <div className="ai-backdrop" onClick={() => setOpen(false)} />}

      {/* PANEL */}
      <div className={`ai-panel${open ? ' open' : ''}`}>
        {/* Panel header */}
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <span className="ai-panel-icon"><IconSparkle /></span>
            Gợi ý số tiền
          </div>
          <button className="ai-panel-close" onClick={() => setOpen(false)}>
            <IconClose />
          </button>
        </div>

        {/* Text input — luôn là text để tránh bàn phím số trên mobile */}
        <div className="ai-input-row">
          <input
            ref={textInputRef}
            type="text"
            inputMode="text"
            className="ai-text-input"
            placeholder='Nhập như "2 triệu", "50k", "tiền điện"…'
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            className={`ai-send-btn${loading ? ' loading' : ''}`}
            onClick={() => handleAsk()}
            disabled={!inputValue.trim() || loading}
          >
            {loading ? <div className="ai-spinner" /> : <IconArrow />}
          </button>
        </div>

        {/* Example chips */}
        {!result && !loading && (
          <div className="ai-examples">
            {EXAMPLE_PROMPTS.map(p => (
              <button
                key={p}
                className="ai-example-chip"
                onClick={() => {
                  setInputValue(p)
                  handleAsk(p)
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <div className="ai-error">{error}</div>}

        {/* Result */}
        {result && (
          <div className="ai-result">
            {result.amount ? (
              <>
                <div className="ai-result-label">Số tiền được nhận diện</div>
                <button
                  className="ai-result-main"
                  onClick={() => applyAmount(result.amount)}
                >
                  <span className="ai-result-amount">{result.display}</span>
                  <span className="ai-result-apply">Dùng ngay ↗</span>
                </button>
                {result.note && (
                  <div className="ai-result-note">💡 {result.note}</div>
                )}
              </>
            ) : (
              <div className="ai-result-note" style={{ marginTop: 0 }}>
                ⚠️ Không nhận diện được số tiền. Thử mô tả cụ thể hơn.
              </div>
            )}

            {result.suggestions?.length > 0 && (
              <>
                <div className="ai-result-label" style={{ marginTop: 10 }}>
                  Gợi ý liên quan
                </div>
                <div className="ai-suggestions">
                  {result.suggestions.map((s, i) => (
                    <button
                      key={i}
                      className="ai-suggestion-chip"
                      onClick={() => applyAmount(s)}
                    >
                      {s >= 1000000
                        ? `${(s / 1000000).toFixed(s % 1000000 === 0 ? 0 : 1)}tr`
                        : s >= 1000
                        ? `${s / 1000}k`
                        : s.toLocaleString('en-US')}
                      <span className="ai-chip-full">{s.toLocaleString('en-US')}đ</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="ai-skeleton-wrap">
            <div className="ai-skeleton" style={{ width: '60%' }} />
            <div className="ai-skeleton" style={{ width: '40%', marginTop: 8 }} />
          </div>
        )}
      </div>
    </>
  )
}

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

  // ─── SCAN QR INLINE STATE ──────────────────────────────────
  // Khi method = scan và đã bấm "Xác nhận", khung quét QR hiện ngay
  // trong trang (chia đôi màn hình) thay vì chuyển sang /admin/scan.
  const [scanActive,    setScanActive]    = useState(false)
  const [scanOrderId,   setScanOrderId]   = useState(null)
  const [manualCode,    setManualCode]    = useState('')
  const [manualErr,     setManualErr]     = useState('')
  const [isSubmittingCode, setIsSubmittingCode] = useState(false)
  const [isServerErr,   setIsServerErr]   = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [camError,      setCamError]      = useState('')
  const [scanning,      setScanning]      = useState(false)
  const [jsQrReady,     setJsQrReady]     = useState(false)

  // ─── SCAN: TRẠNG THÁI XÁC NHẬN SAU KHI GỬI MÃ (giống p2p, KHÔNG có
  // đếm ngược vì mã quét không có mốc hết hạn cố định) ─────────────
  // Sau khi submitPaymentCode gửi mã lên /api/momo/scan, thay vì chỉ
  // dựa vào response đồng bộ, ta chuyển đơn sang PENDING rồi tự động
  // poll /api/momo/status mỗi giây (giống hệt cơ chế p2p) cho tới khi
  // có kết quả cuối cùng PAID/FAILED.
  const [scanStatus,      setScanStatus]      = useState('PENDING') // PENDING | PAID | FAILED
  const [scanChecking,    setScanChecking]    = useState(false)
  const [scanCheckMsg,    setScanCheckMsg]    = useState('')
  const [scanSubmittedCode, setScanSubmittedCode] = useState('') // mã đã gửi, hiển thị bên panel trạng thái
  const scanPollingRef = useRef(false) // chặn 2 lần poll tự động chồng lên nhau

  // ─── P2P QR INLINE STATE ────────────────────────────────────
  // Khi method = p2p và đã bấm "Xác nhận", QR thanh toán hiện ngay
  // trong trang (chia đôi màn hình) thay vì mở tab MoMo mới.
  const [p2pActive,        setP2pActive]        = useState(false)
  const [p2pOrderId,       setP2pOrderId]       = useState(null)
  const [p2pQrImage,       setP2pQrImage]       = useState('')
  const [p2pPayUrl,        setP2pPayUrl]        = useState('')
  const [p2pDeeplink,      setP2pDeeplink]      = useState('')
  const [p2pStatus,        setP2pStatus]        = useState('PENDING')
  const [p2pChecking,      setP2pChecking]      = useState(false)
  const [p2pCancelling,    setP2pCancelling]    = useState(false)
  const [p2pCheckMsg,      setP2pCheckMsg]      = useState('')
  const [showP2pCancelModal, setShowP2pCancelModal] = useState(false)
  const [p2pExpiresAt,     setP2pExpiresAt]     = useState(null) // mốc timestamp hết hạn (10 phút)
  const [p2pTimeLeft,      setP2pTimeLeft]      = useState(0)    // giây còn lại, cập nhật mỗi giây
  const [p2pCopied,        setP2pCopied]        = useState(false)
  const p2pPollingRef = useRef(false) // chặn 2 lần poll tự động chồng lên nhau

  const videoRef     = useRef(null)
  const canvasRef     = useRef(null)
  const streamRef      = useRef(null)
  const rafRef          = useRef(null)
  const submittingRef    = useRef(false)

  // Tải thư viện jsQR 1 lần khi vào trang
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.jsQR) { setJsQrReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload = () => setJsQrReady(true)
    s.onerror = () => setCamError('Không tải được thư viện QR.')
    document.head.appendChild(s)
  }, [])

  function setVideoRef(el) {
    videoRef.current = el
    if (el && !streamRef.current) initStream(el)
  }

  async function initStream(videoEl) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      videoEl.srcObject = stream
      videoEl.setAttribute('playsinline', true)
      await videoEl.play()
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setScanning(false)
      if (err.name === 'NotAllowedError')
        setCamError('Bị từ chối quyền camera. Vào Settings trình duyệt → cho phép Camera.')
      else if (err.name === 'NotFoundError')
        setCamError('Không tìm thấy camera.')
      else
        setCamError(`Lỗi camera: ${err.message}`)
    }
  }

  function tick() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = window.jsQR?.(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
    if (code?.data && !submittingRef.current) {
      submitPaymentCode(code.data)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  // Dừng camera khi rời trang
  useEffect(() => () => stopCamera(), [])

  // Tự bật camera ngay khi khung scan mở
  useEffect(() => {
    if (scanActive && jsQrReady) {
      setCamError('')
      submittingRef.current = false
      setScanning(true)
    }
  }, [scanActive, jsQrReady])

  function closeScanPanel() {
    stopCamera()
    setScanActive(false)
    setScanOrderId(null)
    setManualCode('')
    setManualErr('')
    setIsServerErr(false)
    setIsSubmittingCode(false)
    submittingRef.current = false
    setScanStatus('PENDING')
    setScanChecking(false)
    setScanCheckMsg('')
    setScanSubmittedCode('')
    scanPollingRef.current = false
    setAmount('')
    setOrderInfo(genOrderId())
  }

  // ─── P2P: tạo đơn + QR rồi hiện ngay tại chỗ (chia đôi màn hình) ──
  function closeP2pPanel() {
    setP2pActive(false)
    setP2pOrderId(null)
    setP2pQrImage('')
    setP2pPayUrl('')
    setP2pDeeplink('')
    setP2pStatus('PENDING')
    setP2pCheckMsg('')
    setP2pChecking(false)
    setP2pCancelling(false)
    setP2pExpiresAt(null)
    setP2pTimeLeft(0)
    setP2pCopied(false)
    p2pPollingRef.current = false
    p2pSyncedOrderRef.current = null
    p2pAutoVerifyTickRef.current = 0
    setAmount('')
    setOrderInfo(genOrderId())
    // Chỉ xoá URL cứng (orderId/payUrl) ở ĐÂY — lúc panel thực sự đóng.
    // Trong lúc đơn đang chờ HOẶC đang hiện kết quả (PAID/FAILED/EXPIRED
    // trước khi tự đóng), URL vẫn giữ nguyên để F5 không mất đơn.
    router.replace('/admin/create-transaction', undefined, { shallow: true })
  }

  async function startP2P(amt, info) {
    const finalOrderInfo = info || genOrderId()
    const url = buildTxUrl('p2p', amt, finalOrderInfo)
    if (!url) return

    try {
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok || !data.payUrl) {
        alert(data.error || 'Tạo giao dịch thất bại, thử lại sau')
        return
      }
      setP2pOrderId(data.orderId || finalOrderInfo)
      setP2pQrImage(data.qrCodeImage || '')
      setP2pPayUrl(data.payUrl || '')
      setP2pDeeplink(data.deeplink || '')
      setP2pStatus('PENDING')
      setP2pCheckMsg('')
      const expiresAt = Date.now() + P2P_DURATION_MS
      setP2pExpiresAt(expiresAt)
      setP2pCopied(false)
      setOrderInfo(finalOrderInfo)
      setP2pActive(true)

      // Ghi "cứng" thông tin đơn vào URL (shallow, không reload trang) —
      // nếu admin lỡ bấm F5, trang sẽ đọc lại đúng đơn này ở effect resume
      // bên dưới thay vì tạo đơn P2P MỚI (trước đây F5 = mất đơn cũ, sinh
      // đơn trùng).
      router.replace({
        pathname: '/admin/create-transaction',
        query: {
          method: 'p2p',
          orderId: data.orderId || finalOrderInfo,
          payUrl: data.payUrl || '',
          ...(data.deeplink ? { deeplink: data.deeplink } : {}),
          amount: amt,
          orderInfo: finalOrderInfo,
          expiresAt,
        },
      }, undefined, { shallow: true })
    } catch (e) {
      alert('Lỗi server, thử lại sau')
    }
  }

  // Bấm "Kiểm tra giao dịch" — gọi /api/momo/status để lấy trạng thái mới
  // nhất rồi cập nhật UI.
  // opts.silent = true khi gọi tự động từ vòng polling nền — không bật
  // trạng thái loading trên nút "Kiểm tra giao dịch" và không hiện lỗi
  // kết nối (tránh nháy UI liên tục), nhưng vẫn cập nhật trạng thái/QR khi
  // có kết quả rõ ràng.
  //
  // QUAN TRỌNG: /api/momo/status CHỈ tự gọi MoMo để verify thật trong 60s
  // cuối trước khi hết hạn — ngoài khoảng đó nó chỉ đọc lại bản ghi Redis
  // (được IPN webhook cập nhật). Nếu IPN bị trễ/rớt, bấm "Kiểm tra giao
  // dịch" trong 9 phút đầu sẽ KHÔNG cập nhật gì cả vì status.js không hề
  // gọi MoMo. Vì vậy khi bấm TAY (không silent), gọi thêm /api/momo/query
  // trước — endpoint này verify thật với MoMo bất kể đơn còn bao lâu, và
  // tự reconcile lại Redis nếu lệch — rồi mới đọc /api/momo/status để lấy
  // đúng bản ghi đã cập nhật. Auto-poll nền (silent) vẫn chỉ đọc status
  // như cũ, tránh gọi MoMo dồn dập mỗi giây.
  async function checkP2pStatus(opts = {}) {
    const silent = opts.silent === true
    if (!p2pOrderId) return
    if (!silent) {
      if (p2pChecking) return
      setP2pChecking(true)
      setP2pCheckMsg('')
      // Verify thật với MoMo trước — lỗi ở bước này (mạng, MoMo rate-limit…)
      // không chặn bước đọc status bên dưới, cứ đọc trạng thái hiện có.
      await fetch('/api/momo/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: p2pOrderId }),
      }).catch(() => {})
    }
    try {
      const res  = await fetch(`/api/momo/status?orderId=${encodeURIComponent(p2pOrderId)}`)
      const data = await res.json()
      const status = data.status || 'PENDING'
      setP2pStatus(status)

      if (status === 'PAID') {
        setP2pCheckMsg('✓ Thanh toán thành công!')
        setResultToast({
          orderId: p2pOrderId,
          status: 'success',
          amount: data.amount || parseInt(amount, 10) || null,
        })
        setTimeout(() => closeP2pPanel(), 1500)
      } else if (status === 'EXPIRED') {
        setP2pCheckMsg('⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.')
      } else if (status === 'FAILED') {
        setP2pCheckMsg(`✗ Giao dịch thất bại${data.message ? `: ${data.message}` : ''}`)
      } else if (!silent) {
        setP2pCheckMsg('⏳ Chưa nhận được thanh toán, khách vui lòng quét mã QR.')
      }
      // silent + vẫn PENDING → không đụng vào p2pCheckMsg, tránh spam UI
    } catch (e) {
      if (!silent) setP2pCheckMsg('⚠ Lỗi kết nối, thử kiểm tra lại.')
      // silent lỗi mạng tạm thời thì bỏ qua, vòng poll sau sẽ tự thử lại
    } finally {
      if (!silent) setP2pChecking(false)
    }
  }

  // ─── SCAN: KIỂM TRA TRẠNG THÁI GIAO DỊCH (giống checkP2pStatus, KHÔNG
  // có bước gọi /api/momo/query trước vì /api/momo/scan đã tự verify thật
  // với MoMo ngay lúc gửi mã rồi — chỉ cần đọc lại /api/momo/status để
  // lấy bản ghi mới nhất, tránh gọi trùng MoMo 2 lần cho cùng 1 mã) ────
  async function checkScanStatus(opts = {}) {
    const silent = opts.silent === true
    const targetOrderId = opts.orderId || scanOrderId
    if (!targetOrderId) return
    if (!silent) {
      if (scanChecking) return
      setScanChecking(true)
      setScanCheckMsg('')
    }
    try {
      const res  = await fetch(`/api/momo/status?orderId=${encodeURIComponent(targetOrderId)}`)
      const data = await res.json()
      const status = data.status || 'PENDING'
      setScanStatus(status)

      if (status === 'PAID') {
        setScanCheckMsg('✓ Thanh toán thành công!')
        setResultToast({
          orderId: targetOrderId,
          status: 'success',
          amount: data.amount || parseInt(amount, 10) || null,
        })
        setPendingOrders(prev => prev.filter(o => o.orderId !== targetOrderId))
        setTimeout(() => closeScanPanel(), 1500)
      } else if (status === 'FAILED') {
        setScanCheckMsg(`✗ Giao dịch thất bại${data.message ? `: ${data.message}` : ''}`)
      } else if (!silent) {
        setScanCheckMsg('⏳ Chưa xác nhận được thanh toán, đang tiếp tục kiểm tra…')
      }
      // silent + vẫn PENDING → không đụng vào scanCheckMsg, tránh spam UI
    } catch (e) {
      if (!silent) setScanCheckMsg('⚠ Lỗi kết nối, thử kiểm tra lại.')
    } finally {
      if (!silent) setScanChecking(false)
    }
  }

  // ─── SCAN: TỰ ĐỘNG POLL TRẠNG THÁI (giống hệt p2p, KHÔNG có mốc hết
  // hạn/đếm ngược — mã quét không có TTL cố định như QR P2P) ─────────
  useEffect(() => {
    if (!scanActive || !scanOrderId || !scanSubmittedCode || scanStatus !== 'PENDING') return
    const id = setInterval(async () => {
      if (scanPollingRef.current) return
      scanPollingRef.current = true
      try {
        await checkScanStatus({ silent: true })
      } finally {
        scanPollingRef.current = false
      }
    }, P2P_POLL_MS)
    return () => clearInterval(id)
  }, [scanActive, scanOrderId, scanSubmittedCode, scanStatus])

  // Cho phép thử lại với mã khác khi giao dịch FAILED — giữ nguyên
  // scanOrderId (đơn nháp cũ), chỉ reset để nhập/quét mã mới, bật lại camera.
  function retryScanCode() {
    setScanStatus('PENDING')
    setScanCheckMsg('')
    setScanSubmittedCode('')
    setManualCode('')
    setManualErr('')
    setIsServerErr(false)
    submittingRef.current = false
    setCamError('')
    setScanning(true)
  }

  // Copy URL thanh toán (payUrl) vào clipboard — dùng khi admin muốn gửi
  // link tay cho khách thay vì bắt khách quét QR trên màn hình.
  async function copyP2pPayUrl() {
    const text = p2pPayUrl
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      // Fallback cho trình duyệt/context không hỗ trợ Clipboard API (vd. http)
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        return
      }
    }
    setP2pCopied(true)
    setTimeout(() => setP2pCopied(false), 2000)
  }

  // ─── ĐẾM NGƯỢC 10 PHÚT ────────────────────────────────────────
  // Mỗi giao dịch P2P có hạn 10 phút kể từ lúc tạo. Khi hết giờ mà vẫn
  // đang PENDING → tự chuyển UI sang EXPIRED (không cần khách/admin bấm gì).
  useEffect(() => {
    if (!p2pActive || !p2pExpiresAt) return
    const tick = () => {
      const remain = Math.max(0, Math.ceil((p2pExpiresAt - Date.now()) / 1000))
      setP2pTimeLeft(remain)
      if (remain <= 0) {
        setP2pStatus(prev => (prev === 'PENDING' ? 'EXPIRED' : prev))
        setP2pCheckMsg(prev => prev || '⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.')
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [p2pActive, p2pExpiresAt])

  // ─── ĐỒNG BỘ NGAY VỚI SERVER MỖI KHI CÓ ĐƠN MỚI/RESUME ───────
  // Chạy 1 lần duy nhất mỗi khi p2pOrderId đổi (áp dụng cho cả đơn vừa tạo
  // lẫn đơn được khôi phục từ URL sau F5). Quan trọng nhất với trường hợp
  // resume: trạng thái EXPIRED/PENDING lúc đó chỉ là suy đoán từ đồng hồ
  // phía client, cần xác nhận lại với server phòng khi khách đã thanh
  // toán/đơn đã hết hạn thật trong lúc admin không nhìn màn hình.
  const p2pSyncedOrderRef = useRef(null)
  useEffect(() => {
    if (!p2pActive || !p2pOrderId) return
    if (p2pSyncedOrderRef.current === p2pOrderId) return
    p2pSyncedOrderRef.current = p2pOrderId
    checkP2pStatus({ silent: true })
  }, [p2pActive, p2pOrderId])

  // ─── TỰ ĐỘNG POLL TRẠNG THÁI ────────────────────────────────
  // Thay vì bắt admin bấm "Kiểm tra giao dịch" liên tục, tự động gọi ngầm
  // mỗi P2P_POLL_MS trong lúc đơn còn PENDING. Dừng ngay khi có kết quả
  // cuối (PAID/EXPIRED/FAILED) hoặc khi rời khỏi màn hình P2P.
  //
  // /api/momo/status chỉ tự verify thật với MoMo trong 60s cuối trước khi
  // hết hạn — ngoài khoảng đó nó chỉ đọc Redis (phụ thuộc IPN webhook).
  // Để không phải đợi IPN (có thể trễ/rớt) hoặc bắt admin bấm tay, cứ mỗi
  // ~10 lần poll (~10s) thì chủ động gọi /api/momo/query verify thật 1
  // lần — tần suất đủ thấp để không đụng rate-limit của MoMo, nhưng đủ
  // nhanh để không còn cảnh "thanh toán rồi mà đợi cả chục giây không lên".
  const p2pAutoVerifyTickRef = useRef(0)
  useEffect(() => {
    if (!p2pActive || !p2pOrderId || p2pStatus !== 'PENDING') return
    const id = setInterval(async () => {
      if (p2pPollingRef.current) return
      p2pPollingRef.current = true
      try {
        p2pAutoVerifyTickRef.current += 1
        const shouldLiveVerify = p2pAutoVerifyTickRef.current % 10 === 0
        if (shouldLiveVerify) {
          await fetch('/api/momo/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: p2pOrderId }),
          }).catch(() => {})
        }
        await checkP2pStatus({ silent: true })
      } finally {
        p2pPollingRef.current = false
      }
    }, P2P_POLL_MS)
    return () => clearInterval(id)
  }, [p2pActive, p2pOrderId, p2pStatus])

  // Bấm "Hủy giao dịch" — chỉ đánh dấu FAILED nếu đơn còn PENDING bên server
  // (route /api/momo/cancel tự bảo vệ, không ghi đè đơn đã PAID/FAILED/EXPIRED).
  async function cancelP2pOrder() {
    if (!p2pOrderId || p2pCancelling) return
    setP2pCancelling(true)
    try {
      const res  = await fetch('/api/momo/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: p2pOrderId }),
      })
      const data = await res.json()
      if (data.alreadyFinal && data.status === 'PAID') {
        // Khách vừa thanh toán xong đúng lúc admin bấm hủy — không hủy nữa, báo thành công.
        setP2pStatus('PAID')
        setP2pCheckMsg('✓ Đơn đã được thanh toán, không thể hủy.')
        setP2pCancelling(false)
        return
      }
    } catch (e) {
      console.error('Lỗi hủy đơn P2P:', e)
    } finally {
      setP2pCancelling(false)
    }
    closeP2pPanel()
  }

  // Tạo đơn PENDING rồi mở khung quét QR ngay tại chỗ (không chuyển trang)
  async function startScan(amt, info) {
    const generatedId = `POS${Date.now()}`
    const finalOrderInfo = info || genOrderId()
    submittingRef.current = true
    try {
      await fetch('/api/momo/save-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: generatedId,
          amount: parseInt(amt, 10),
          orderInfo: finalOrderInfo,
        }),
      })
    } catch (e) {
      console.error('Lỗi lưu đơn hàng nháp:', e)
    } finally {
      submittingRef.current = false
    }
    setScanOrderId(generatedId)
    setOrderInfo(finalOrderInfo)
    setManualCode('')
    setManualErr('')
    setIsServerErr(false)
    setScanStatus('PENDING')
    setScanChecking(false)
    setScanCheckMsg('')
    setScanSubmittedCode('')
    scanPollingRef.current = false
    setScanActive(true)
  }

  // Gửi mã thanh toán (18 số, có thể có MM) lên /api/momo/scan (POST)
  async function submitPaymentCode(rawCode) {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmittingCode(true)
    setIsServerErr(false)

    const code = cleanCode(rawCode)
    setManualCode(code)

    const amt = parseInt(amount, 10)
    let orderId = scanOrderId || `POS${Date.now()}`
    const baseOrderInfo = orderInfo || genOrderId()

    const MAX_RETRY = 5
    let attempt = 0
    let data = null

    try {
      while (attempt < MAX_RETRY) {
        const res = await fetch('/api/momo/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: amt, orderInfo: baseOrderInfo, paymentCode: code }),
        })
        data = await res.json()

        if (data.resultCode === 41) {
          // Trùng orderId bên MoMo → tự bump số thứ tự rồi thử lại
          const match = orderId.match(/^(.+)_(\d+)$/)
          orderId = match ? `${match[1]}_${parseInt(match[2]) + 1}` : `${orderId}_2`
          setScanOrderId(orderId)
          attempt++
          try {
            await fetch('/api/momo/save-pending', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId, amount: amt, orderInfo: baseOrderInfo }),
            })
          } catch (e) { console.error('Lỗi lưu đơn nháp khi bump:', e) }
          continue
        }
        break
      }

      // Không đóng panel / không kết luận ngay từ response đồng bộ nữa.
      // Chuyển sang chế độ chờ xác nhận + tự động poll /api/momo/status
      // (giống hệt cơ chế p2p), chỉ khác là KHÔNG có đếm ngược hết hạn.
      submittingRef.current = false
      setIsSubmittingCode(false)
      stopCamera()
      setScanSubmittedCode(code)

      if (data?.resultCode === 0) {
        setIsServerErr(false)
        setScanStatus('PENDING')
        setScanCheckMsg('⏳ Đã gửi mã, đang xác nhận giao dịch…')
        await checkScanStatus({ silent: true, orderId })
      } else {
        // MoMo trả lỗi rõ ràng ngay lúc gửi (mã sai/hết hạn/không khớp…)
        setIsServerErr(false)
        setScanStatus('FAILED')
        setScanCheckMsg(`✗ Giao dịch thất bại${data?.message ? `: ${data.message}` : ''}`)
      }
    } catch (e) {
      submittingRef.current = false
      setIsSubmittingCode(false)
      setIsServerErr(true)
      setManualErr('Mất kết nối hoặc cổng thanh toán phản hồi chậm!')
    }
  }

  function handleManualCodeKey(e) {
    if (e.key === 'Enter') submitManualCode()
  }

  async function submitManualCode() {
    const code = cleanCode(manualCode)
    if (!/^(MM|mm)?\d{18}$/.test(code)) {
      setManualErr('Mã không hợp lệ. Vui lòng kiểm tra lại (18 chữ số, có thể có MM).')
      return
    }
    setManualErr('')
    await submitPaymentCode(code)
  }

  // Tự gửi khi gõ/quét đủ 18 hoặc 20 ký tự hợp lệ — tránh trường hợp
  // người quét mã QR (18 số) bị nhầm thành đang gõ số tiền.
  useEffect(() => {
    const code = cleanCode(manualCode)
    if ((code.length === 18 || code.length === 20) && !submittingRef.current && /^(MM|mm)?\d{18}$/.test(code)) {
      submitManualCode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualCode])

  async function triggerCancelOrderBackend() {
    submittingRef.current = true
    setIsSubmittingCode(true)
    try {
      await fetch('/api/momo/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: scanOrderId,
          amount: parseInt(amount, 10),
          orderInfo: orderInfo || scanOrderId,
          paymentCode: '000000000000000000',
        }),
      })
    } catch (e) {
      console.error(e)
    } finally {
      closeScanPanel()
    }
  }

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
    const {
      method: qMethod, amount: qAmount, orderInfo: qOrderInfo,
      orderId: qOrderId, payUrl: qPayUrl, deeplink: qDeeplink, expiresAt: qExpiresAt,
    } = router.query
    const validMethod = (qMethod === 'p2p' || qMethod === 'scan') ? qMethod : null
    const validAmount = qAmount ? String(parseInt(qAmount, 10) || '') : null

    if (validMethod) setMethod(validMethod)
    if (validAmount) setAmount(validAmount)
    if (qOrderInfo) setOrderInfo(String(qOrderInfo))

    // ─── RESUME: URL đã có sẵn orderId + payUrl của 1 đơn P2P đang chạy
    // (do chính trang này ghi vào lúc tạo đơn) → khôi phục lại panel thay
    // vì tạo đơn P2P MỚI. Trường hợp này xảy ra khi admin bấm F5 giữa lúc
    // khách đang quét QR — không có bước này, F5 sẽ chạy lại startP2P và
    // sinh ra một đơn hoàn toàn khác, đơn cũ (khách có thể đang quét dở)
    // bị bỏ rơi.
    if (validMethod === 'p2p' && qOrderId && qPayUrl) {
      const orderIdStr   = String(qOrderId)
      const payUrlStr    = String(qPayUrl)
      const deeplinkStr  = qDeeplink ? String(qDeeplink) : ''
      const expiresAtNum = qExpiresAt ? parseInt(qExpiresAt, 10) : null

      setP2pOrderId(orderIdStr)
      setP2pPayUrl(payUrlStr)
      setP2pDeeplink(deeplinkStr)
      setP2pCheckMsg('')
      setP2pActive(true)

      if (expiresAtNum && expiresAtNum > Date.now()) {
        setP2pExpiresAt(expiresAtNum)
        setP2pStatus('PENDING')
      } else {
        // Thiếu mốc hết hạn hoặc đã quá giờ ngay khi vừa mở lại trang
        setP2pStatus('EXPIRED')
        setP2pCheckMsg('⚠ Mã QR đã hết hạn, vui lòng tạo đơn mới.')
      }
      return // đã resume xong — KHÔNG chạy nhánh tạo-mới bên dưới
    }

    if (validMethod && validAmount && parseInt(validAmount, 10) > 0) {
      const finalOrderInfo = qOrderInfo || genOrderId()
      if (qOrderInfo) setOrderInfo(finalOrderInfo)

      if (validMethod !== 'p2p') {
        // scan: tạo đơn & mở khung quét QR ngay tại chỗ, không cần build URL
        startScan(validAmount, finalOrderInfo)
        return
      }

      // p2p: tạo đơn + QR rồi hiện ngay tại chỗ (chia đôi màn hình), không
      // điều hướng sang MoMo nữa.
      startP2P(validAmount, finalOrderInfo)
    }
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

  const isP2P    = method === 'p2p'
  const canSubmit = parseInt(amount || 0, 10) > 0
  const previewUrl = buildTxUrl(method, amount, orderInfo) || ''

  const handleCreate = async () => {
    const finalOrderInfo = (orderInfo || '').trim() || genOrderId()

    if (!isP2P) {
      // SCAN: bấm Enter/Xác nhận → tạo đơn PENDING rồi hiện khung quét QR
      // ngay trong trang (không mở tab mới, không qua /admin/scan)
      setLoading(true)
      await startScan(amount, finalOrderInfo)
      setLoading(false)
      return
    }

    // P2P: tạo đơn + QR rồi hiện ngay trong trang (chia đôi màn hình),
    // kèm nút "Kiểm tra giao dịch" và "Hủy giao dịch".
    setLoading(true)
    await startP2P(amount, finalOrderInfo)
    setLoading(false)
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

        .top-stripe {
          flex-shrink: 0;
          height: 3px;
          background: linear-gradient(90deg, #f9a8c9 0%, var(--mm) 50%, #c084d4 100%);
        }

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

        .card-body {
          flex: 1;
          padding: 16px 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .field-label {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }

        .method-tabs {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
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
        .method-tab:hover { border-color: rgba(174,0,112,0.3); background: var(--mm-light); }
        .method-tab.active {
          border-color: var(--mm);
          background: var(--mm-light);
          box-shadow: 0 0 0 3px var(--mm-mid);
        }
        .method-tab-icon { color: var(--muted); transition: color 0.18s; line-height: 0; }
        .method-tab.active .method-tab-icon { color: var(--mm); }
        .method-tab-label { font-size: 12px; font-weight: 700; color: var(--muted); transition: color 0.18s; }
        .method-tab.active .method-tab-label { color: var(--mm); }
        .method-tab-desc { font-size: 9.5px; font-weight: 500; color: var(--muted); transition: color 0.18s; text-align: center; line-height: 1.3; }
        .method-tab.active .method-tab-desc { color: rgba(174,0,112,0.7); }

        .amount-section { margin-bottom: 18px; }
        .amount-input-wrap { position: relative; margin-bottom: 10px; }
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
        .amount-input-wrap .prefix-label {
          position: absolute;
          left: 16px; top: 50%; transform: translateY(-50%);
          font-size: 16px; font-weight: 800;
          color: var(--muted);
          pointer-events: none;
          transition: color 0.18s;
        }

        .quick-amounts { display: flex; gap: 7px; flex-wrap: wrap; }
        .quick-btn {
          flex: 1; min-width: 0;
          padding: 7px 4px;
          border-radius: 10px;
          border: 1.5px solid var(--border);
          background: transparent;
          font-family: inherit; font-size: 11.5px; font-weight: 700;
          color: var(--muted);
          cursor: pointer; transition: all 0.15s ease;
          white-space: nowrap; text-align: center;
          -webkit-tap-highlight-color: transparent;
        }
        .quick-btn:hover, .quick-btn:active {
          border-color: var(--mm); color: var(--mm); background: var(--mm-light);
        }

        .order-section { margin-bottom: 20px; }
        .order-input-wrap { display: flex; gap: 8px; align-items: stretch; }
        .order-input {
          flex: 1; min-width: 0;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          background: var(--subtle);
          padding: 11px 13px;
          font-family: 'SF Mono','Fira Code', monospace;
          font-size: 12.5px; font-weight: 500;
          color: var(--text);
          outline: none; transition: all 0.18s ease;
        }
        .order-input:focus { border-color: var(--mm); background: #fff; box-shadow: 0 0 0 3px var(--mm-mid); }
        .refresh-btn {
          flex-shrink: 0; width: 42px;
          border-radius: 12px; border: 1.5px solid var(--border);
          background: var(--subtle);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--muted); transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .refresh-btn:hover { border-color: var(--mm); color: var(--mm); background: var(--mm-light); }

        .submit-btn {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 15px; border-radius: 16px; border: none;
          background: linear-gradient(135deg, var(--mm) 0%, #c0006a 100%);
          color: #fff; font-family: inherit; font-size: 15px; font-weight: 800;
          letter-spacing: 0.1px; cursor: pointer; transition: all 0.2s ease;
          box-shadow: 0 8px 24px rgba(174,0,112,0.28);
          position: relative; overflow: hidden;
          -webkit-tap-highlight-color: transparent;
        }
        .submit-btn::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%);
          pointer-events: none;
        }
        .submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 30px rgba(174,0,112,0.35); }
        .submit-btn:active:not(:disabled) { transform: translateY(0); box-shadow: 0 4px 12px rgba(174,0,112,0.25); }
        .submit-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
        .submit-btn.loading { opacity: 0.8; }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .url-preview-row {
          display: flex; align-items: center; gap: 8px;
          margin-top: 12px; padding: 9px 12px;
          border-radius: 11px; border: 1px solid var(--border);
          background: var(--subtle);
        }
        .url-preview-text {
          flex: 1; min-width: 0;
          font-family: 'SF Mono','Fira Code', monospace;
          font-size: 10px; color: var(--muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.4;
        }
        .url-copy-btn {
          flex-shrink: 0; width: 28px; height: 28px;
          border-radius: 7px; border: 1px solid var(--border);
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--muted);
          font-size: 11px; font-weight: 800;
          transition: all 0.15s; font-family: inherit;
        }
        .url-copy-btn:hover { border-color: var(--mm); color: var(--mm); background: var(--mm-light); }
        .url-copy-btn.done { background: #dcfce7; border-color: #86efac; color: #16a34a; }

        .toast {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          z-index: 100; width: calc(100% - 32px); max-width: 400px;
          display: flex; align-items: center; gap: 12px;
          padding: 13px 14px; border-radius: 18px; border: 1px solid;
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
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 900; flex-shrink: 0;
        }
        .toast.success .toast-icon { background: #dcfce7; color: #16a34a; }
        .toast.fail    .toast-icon { background: #fee2e2; color: #dc2626; }
        .toast-body { flex: 1; min-width: 0; }
        .toast-title { font-size: 13px; font-weight: 800; line-height: 1.2; }
        .toast.success .toast-title { color: #16a34a; }
        .toast.fail    .toast-title { color: #dc2626; }
        .toast-sub { font-size: 11px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .toast-close {
          flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%;
          background: none; border: none; font-size: 13px; cursor: pointer;
          color: var(--muted);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .toast-close:hover { background: rgba(0,0,0,0.07); color: var(--text); }

        .pending-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px 3px 7px; border-radius: 20px;
          background: var(--mm-light); border: 1px solid rgba(174,0,112,0.18);
          font-size: 10.5px; font-weight: 700; color: var(--mm);
          margin-bottom: 14px;
        }
        .pending-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--mm);
          animation: pulse 1.2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.75); }
        }

        /* ── SCAN QR — chia 2 cửa sổ ── */
        .card.split { }
        @media (min-width: 600px) {
          .card.split { max-width: 760px; }
        }

        /* ── FULL-SCREEN KIOSK MODE ──────────────────────────────────
           Khung quét/QR (scan & p2p) là phần sau này sẽ đẩy nguyên sang
           màn hình phụ cho khách nhìn (setup sau) → cần LẤP ĐẦY toàn bộ
           viewport ngay từ bây giờ thay vì bó hẹp giữa trang như form
           nhập liệu, tránh khoảng trắng thừa quanh & bên trong card. */
        .page-root.fullscreen {
          padding: 0 !important;
        }
        .page-root.fullscreen .card.split {
          width: 100vw;
          height: 100dvh;
          max-width: 100vw;
          max-height: 100dvh;
          border-radius: 0;
          box-shadow: none;
        }
        .page-root.fullscreen .scan-split {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
        }
        .page-root.fullscreen .card-header {
          padding: 32px 40px 0;
        }
        .page-root.fullscreen .header-logo { width: 52px; height: 52px; }
        .page-root.fullscreen .header-text-title { font-size: 26px; }
        .page-root.fullscreen .header-text-sub { font-size: 14.5px; }
        .page-root.fullscreen .scan-pane {
          justify-content: center;
          padding: 40px 56px;
          gap: 20px;
        }
        .page-root.fullscreen .field-label { font-size: 13px; margin-bottom: 12px; }
        .page-root.fullscreen .scan-order-card { padding: 22px 26px; border-radius: 18px; }
        .page-root.fullscreen .scan-order-row { font-size: 16px; padding: 9px 0; }
        .page-root.fullscreen .scan-order-mono { font-size: 15px; }
        .page-root.fullscreen .scan-order-amount span:last-child { font-size: 34px; }
        .page-root.fullscreen .scan-order-divider { margin: 9px 0; }
        .page-root.fullscreen .p2p-status-badge { font-size: 14px; padding: 5px 14px; }
        .page-root.fullscreen .p2p-check-msg { font-size: 14px; padding: 12px 14px; }
        .page-root.fullscreen .p2p-poll-hint { font-size: 13px; }
        .page-root.fullscreen .p2p-countdown { font-size: 20px; }
        .page-root.fullscreen .scan-cam-status,
        .page-root.fullscreen .scan-cam-error { font-size: 14px; }
        .page-root.fullscreen .scan-code-input { padding: 16px 18px; font-size: 17px; }
        .page-root.fullscreen .scan-confirm-btn,
        .page-root.fullscreen .scan-retry-btn,
        .page-root.fullscreen .scan-cancel-btn,
        .page-root.fullscreen .p2p-copy-btn { padding: 16px; font-size: 15px; }
        .page-root.fullscreen .p2p-qr-card {
          max-width: min(58vh, 480px);
        }
        .page-root.fullscreen .p2p-open-link { font-size: 13px; }
        /* Bỏ ghim nút "Hủy" xuống đáy — để toàn bộ nội dung được canh
           giữa theo chiều dọc (justify-content: center ở trên), tránh
           khoảng trắng lửng lơ ở giữa panel như trước. */
        .page-root.fullscreen .scan-cancel-btn { margin-top: 4px; }

        .scan-split {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
        }
        @media (min-width: 600px) {
          .scan-split { grid-template-columns: 1fr 1fr; }
        }

        .scan-pane {
          padding: 16px 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .scan-pane-info {
          border-bottom: 1px solid var(--border);
        }
        @media (min-width: 600px) {
          .scan-pane-info {
            border-bottom: none;
            border-right: 1px solid var(--border);
          }
        }

        .scan-order-card {
          border: 1.5px solid var(--border);
          border-radius: 14px;
          background: var(--subtle);
          padding: 14px 16px;
        }
        .scan-order-row {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12.5px; color: var(--muted); font-weight: 600;
          padding: 5px 0;
        }
        .scan-order-mono {
          font-family: 'SF Mono','Fira Code', monospace;
          font-size: 11.5px; color: var(--text); font-weight: 600;
          max-width: 60%; text-align: right; word-break: break-all;
        }
        .scan-order-amount span:last-child {
          font-size: 20px; font-weight: 900; color: var(--mm);
        }
        .scan-order-divider { height: 1px; background: var(--border); margin: 6px 0; }

        .scan-cam-status {
          display: flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 600; color: var(--mm);
        }
        .scan-cam-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--mm);
          animation: pulse 1.2s ease-in-out infinite;
        }
        .scan-cam-error {
          font-size: 12px; font-weight: 600; color: #dc2626;
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 10px; padding: 8px 10px;
        }
        .scan-cam-hidden {
          position: absolute; width: 1px; height: 1px;
          overflow: hidden; opacity: 0; pointer-events: none;
        }

        .scan-cancel-btn {
          margin-top: auto;
          width: 100%;
          padding: 11px; border-radius: 12px;
          border: 1.5px solid var(--border);
          background: #fff; color: var(--muted);
          font-family: inherit; font-size: 12.5px; font-weight: 700;
          cursor: pointer; transition: all 0.15s;
        }
        .scan-cancel-btn:hover { border-color: #fca5a5; color: #dc2626; background: #fef2f2; }

        .scan-code-input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          background: var(--subtle);
          padding: 12px 14px;
          font-family: 'SF Mono','Fira Code', monospace;
          font-size: 14px; font-weight: 600; color: var(--text);
          outline: none; transition: all 0.18s;
        }
        .scan-code-input:focus { border-color: var(--mm); background: #fff; box-shadow: 0 0 0 3px var(--mm-mid); }
        .scan-code-err { font-size: 11.5px; color: #dc2626; font-weight: 600; }

        .scan-confirm-btn {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px; border-radius: 14px; border: none;
          background: linear-gradient(135deg, var(--mm) 0%, #c0006a 100%);
          color: #fff; font-family: inherit; font-size: 13.5px; font-weight: 800;
          cursor: pointer; transition: all 0.18s;
          box-shadow: 0 8px 20px rgba(174,0,112,0.25);
        }
        .scan-confirm-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
        .scan-confirm-btn.loading { opacity: 0.85; }

        .scan-retry-btn {
          width: 100%;
          padding: 11px; border-radius: 12px; border: none;
          background: #f59e0b; color: #fff;
          font-family: inherit; font-size: 12.5px; font-weight: 700;
          cursor: pointer; box-shadow: 0 4px 12px rgba(245,158,11,0.25);
        }

        /* ── P2P QR PANE ── */
        .p2p-status-badge {
          font-size: 11px; font-weight: 800;
          padding: 3px 9px; border-radius: 20px;
        }
        .p2p-status-pending { background: var(--mm-light); color: var(--mm); }
        .p2p-status-paid    { background: #dcfce7; color: #16a34a; }
        .p2p-status-expired { background: #fef3c7; color: #b45309; }
        .p2p-status-failed  { background: #fee2e2; color: #dc2626; }

        .p2p-check-msg {
          font-size: 12px; font-weight: 600; color: var(--mm);
          background: var(--mm-light); border: 1px solid rgba(174,0,112,0.18);
          border-radius: 10px; padding: 8px 10px; line-height: 1.4;
        }
        .p2p-check-msg.ok  { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
        .p2p-check-msg.err { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

        .p2p-qr-card {
          position: relative;
          width: 100%; max-width: 260px; margin: 0 auto;
          aspect-ratio: 1 / 1;
          display: flex; align-items: center; justify-content: center;
          background: var(--subtle);
          border: 1.5px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          padding: 12px;
        }
        /* Co giãn theo màn hình: 260px chỉ hợp cho điện thoại (1 cột dọc).
           Từ 600px trở lên, .scan-split chia 2 cột (xem @media ở trên) nên
           cột QR có nhiều chỗ trống hơn — tăng dần max-width theo breakpoint
           để khung QR to rõ ràng trên laptop, không bị kẹt cứng ở 260px. */
        @media (min-width: 600px) {
          .p2p-qr-card { max-width: 300px; }
        }
        @media (min-width: 900px) {
          .p2p-qr-card { max-width: 340px; }
        }
        @media (min-width: 1200px) {
          .p2p-qr-card { max-width: 380px; }
        }
        .p2p-qr-img {
          width: 100%; height: 100%;
          object-fit: contain;
          border-radius: 8px;
          display: block;
        }
        .p2p-iframe-loading {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px;
          font-size: 12px; font-weight: 600; color: var(--muted);
          text-align: center; padding: 0 20px;
        }

        .p2p-open-link {
          display: block; text-align: center;
          font-size: 11.5px; font-weight: 700; color: var(--mm);
          text-decoration: underline; text-underline-offset: 2px;
          padding: 2px 0 0;
        }
        .p2p-open-link:hover { color: #7a0056; }

        .p2p-countdown {
          font-size: 13px; font-weight: 800; color: var(--mm);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.5px;
        }
        .p2p-countdown-warn { color: #dc2626; }

        .p2p-poll-hint {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; color: var(--muted);
          padding: 2px 2px 0;
        }
        .p2p-poll-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #16a34a; flex-shrink: 0;
          animation: p2pPollPulse 1.4s ease-in-out infinite;
        }
        @keyframes p2pPollPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.7); }
        }

        .p2p-copy-btn {
          width: 100%; padding: 10px; border-radius: 12px;
          border: 1.5px solid var(--border); background: #fff;
          font-family: inherit; font-size: 12.5px; font-weight: 700;
          color: var(--text); cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .p2p-copy-btn:hover { border-color: var(--mm); color: var(--mm); }
        .p2p-copy-btn.copied {
          border-color: #16a34a; color: #16a34a; background: #f0fdf4;
        }

        /* ── CANCEL MODAL ── */
        .cancel-modal-backdrop {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .cancel-modal-box {
          width: 100%; max-width: 340px;
          background: #fff; border-radius: 18px; padding: 22px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .cancel-modal-title { font-size: 15px; font-weight: 800; color: var(--text); text-align: center; margin-bottom: 6px; }
        .cancel-modal-desc { font-size: 12.5px; color: var(--muted); text-align: center; line-height: 1.5; margin-bottom: 16px; }
        .cancel-modal-id { font-family: 'SF Mono','Fira Code', monospace; font-weight: 700; color: var(--text); }
        .cancel-modal-actions { display: flex; gap: 10px; }
        .cancel-modal-keep, .cancel-modal-confirm {
          flex: 1; padding: 10px; border-radius: 10px; border: none;
          font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .cancel-modal-keep { background: var(--subtle); color: var(--muted); }
        .cancel-modal-confirm { background: #dc2626; color: #fff; }

        /* ══════════════════════════════════════════════
           AI WIDGET STYLES
           ══════════════════════════════════════════════ */

        /* FAB button — bottom-right */
        .ai-fab {
          position: fixed;
          bottom: 24px;
          right: 20px;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 10px 14px 10px 11px;
          border-radius: 50px;
          border: none;
          background: linear-gradient(135deg, #7c3aed 0%, #ae0070 100%);
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(124,58,237,0.35), 0 2px 8px rgba(0,0,0,0.15);
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
          letter-spacing: 0.2px;
        }
        .ai-fab:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(124,58,237,0.45), 0 4px 12px rgba(0,0,0,0.18);
        }
        .ai-fab:active {
          transform: translateY(0);
          box-shadow: 0 4px 12px rgba(124,58,237,0.3);
        }
        .ai-fab-label { line-height: 1; }

        /* BACKDROP */
        .ai-backdrop {
          position: fixed;
          inset: 0;
          z-index: 55;
          background: rgba(0,0,0,0.25);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          animation: fadeIn 0.18s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* PANEL — slides up from bottom */
        .ai-panel {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%) translateY(110%);
          z-index: 60;
          width: 100%;
          max-width: 480px;
          background: #fff;
          border-radius: 24px 24px 0 0;
          box-shadow: 0 -16px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
          padding: 0 0 env(safe-area-inset-bottom, 16px);
          transition: transform 0.35s cubic-bezier(0.34,1.2,0.64,1);
          overflow: hidden;
        }
        .ai-panel.open {
          transform: translateX(-50%) translateY(0);
        }
        @media (min-width: 600px) {
          .ai-panel {
            bottom: 24px;
            right: 20px;
            left: auto;
            transform: translateY(110%);
            border-radius: 20px;
            max-width: 340px;
            box-shadow: 0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
          }
          .ai-panel.open { transform: translateY(0); }
        }

        /* Gradient top bar on panel */
        .ai-panel::before {
          content: '';
          display: block;
          height: 3px;
          background: linear-gradient(90deg, #7c3aed 0%, #ae0070 100%);
          border-radius: 24px 24px 0 0;
        }

        .ai-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 10px;
        }
        .ai-panel-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 800;
          color: #1a0f16;
          letter-spacing: -0.2px;
        }
        .ai-panel-icon {
          display: flex;
          align-items: center;
          color: #7c3aed;
        }
        .ai-panel-close {
          width: 28px; height: 28px;
          border-radius: 50%;
          border: 1.5px solid var(--border);
          background: var(--subtle);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: var(--muted);
          transition: all 0.15s;
        }
        .ai-panel-close:hover { background: var(--mm-light); border-color: var(--mm); color: var(--mm); }

        /* Text input row */
        .ai-input-row {
          display: flex;
          gap: 8px;
          padding: 0 16px 12px;
        }
        .ai-text-input {
          flex: 1;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          background: var(--subtle);
          padding: 10px 13px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          color: var(--text);
          outline: none;
          transition: all 0.18s;
        }
        .ai-text-input:focus {
          border-color: #7c3aed;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        .ai-text-input::placeholder { color: #c4b0cc; font-weight: 400; }
        .ai-send-btn {
          flex-shrink: 0;
          width: 42px; height: 42px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #7c3aed 0%, #ae0070 100%);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.18s;
          -webkit-tap-highlight-color: transparent;
        }
        .ai-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ai-send-btn:not(:disabled):hover { transform: scale(1.05); }
        .ai-send-btn.loading { opacity: 0.8; }

        .ai-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        /* Example chips */
        .ai-examples {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding: 0 16px 14px;
        }
        .ai-example-chip {
          padding: 5px 11px;
          border-radius: 20px;
          border: 1.5px solid rgba(124,58,237,0.2);
          background: rgba(124,58,237,0.06);
          font-family: inherit;
          font-size: 11.5px;
          font-weight: 600;
          color: #7c3aed;
          cursor: pointer;
          transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .ai-example-chip:hover, .ai-example-chip:active {
          background: rgba(124,58,237,0.12);
          border-color: #7c3aed;
        }

        /* Error */
        .ai-error {
          margin: 0 16px 14px;
          padding: 9px 12px;
          border-radius: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          font-size: 11.5px;
          color: #dc2626;
          font-weight: 500;
        }

        /* Result block */
        .ai-result {
          padding: 0 16px 16px;
        }
        .ai-result-label {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 7px;
        }
        .ai-result-main {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 16px;
          border-radius: 14px;
          border: 2px solid rgba(124,58,237,0.25);
          background: rgba(124,58,237,0.06);
          cursor: pointer;
          font-family: inherit;
          transition: all 0.18s;
          -webkit-tap-highlight-color: transparent;
        }
        .ai-result-main:hover {
          border-color: #7c3aed;
          background: rgba(124,58,237,0.1);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(124,58,237,0.18);
        }
        .ai-result-amount {
          font-size: 22px;
          font-weight: 900;
          color: #7c3aed;
          letter-spacing: -0.5px;
        }
        .ai-result-apply {
          font-size: 11px;
          font-weight: 700;
          color: #7c3aed;
          opacity: 0.7;
        }
        .ai-result-note {
          margin-top: 7px;
          font-size: 11px;
          color: var(--muted);
          font-weight: 500;
          line-height: 1.4;
        }

        /* Suggestion chips */
        .ai-suggestions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .ai-suggestion-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          padding: 7px 14px;
          border-radius: 12px;
          border: 1.5px solid rgba(174,0,112,0.2);
          background: var(--mm-light);
          font-family: inherit;
          font-size: 13px;
          font-weight: 800;
          color: var(--mm);
          cursor: pointer;
          transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .ai-suggestion-chip:hover, .ai-suggestion-chip:active {
          border-color: var(--mm);
          background: rgba(174,0,112,0.13);
          transform: translateY(-1px);
        }
        .ai-chip-full {
          font-size: 9px;
          font-weight: 500;
          color: rgba(174,0,112,0.55);
          letter-spacing: 0;
        }

        /* Loading skeleton */
        .ai-skeleton-wrap { padding: 0 16px 16px; }
        .ai-skeleton {
          height: 14px;
          border-radius: 8px;
          background: linear-gradient(90deg, #f0e8ef 25%, #e8dce6 50%, #f0e8ef 75%);
          background-size: 200% 100%;
          animation: shimmer 1.2s infinite;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
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

      <div className={`page-root${(scanActive || p2pActive) ? ' fullscreen' : ''}`}>
        <div className={`card${(scanActive || p2pActive) ? ' split' : ''}`}>
          <div className="top-stripe" />


          <div className="card-header">
            <img src="/Main.png" alt="" className="header-logo" />
            <div>
              <div className="header-text-title">
                {scanActive ? 'Quét Mã MoMo' : p2pActive ? 'Thanh Toán QR' : 'Tạo Giao Dịch'}
              </div>
              <div className="header-text-sub">
                {scanActive
                  ? 'Quét mã QR khách hàng để nhận tiền'
                  : p2pActive
                  ? 'Đưa mã QR cho khách quét để thanh toán'
                  : 'Tạo link & QR thanh toán MoMo'}
              </div>
            </div>
          </div>

          {!scanActive && !p2pActive && (
          <div className="card-body">
            {pendingOrders.length > 0 && (
              <div className="pending-badge">
                <div className="pending-dot" />
                {pendingOrders.length} đơn đang chờ kết quả
              </div>
            )}

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
                <span className="prefix-label" style={{ color: amount ? 'var(--mm)' : 'var(--muted)' }}>₫</span>
              </div>
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
          </div>
          )}

          {scanActive && (
            <div className="scan-split">
              {/* CỬA SỔ TRÁI — thông tin đơn hàng + trạng thái (giống p2p,
                  KHÔNG có dòng "Thời gian còn lại" vì mã quét không có TTL) */}
              <div className="scan-pane scan-pane-info">
                <div className="field-label">Thông tin đơn hàng</div>
                <div className="scan-order-card">
                  <div className="scan-order-row">
                    <span>Mã đơn hàng</span>
                    <span className="scan-order-mono">{scanOrderId || '—'}</span>
                  </div>
                  <div className="scan-order-row scan-order-amount">
                    <span>Số tiền</span>
                    <span>{formatAmount(amount)}₫</span>
                  </div>
                  <div className="scan-order-divider" />
                  <div className="scan-order-row">
                    <span>Nội dung</span>
                    <span className="scan-order-mono">{orderInfo}</span>
                  </div>
                  {scanSubmittedCode && (
                    <>
                      <div className="scan-order-divider" />
                      <div className="scan-order-row">
                        <span>Mã đã gửi</span>
                        <span className="scan-order-mono">{scanSubmittedCode}</span>
                      </div>
                    </>
                  )}
                  <div className="scan-order-divider" />
                  <div className="scan-order-row">
                    <span>Trạng thái</span>
                    <span className={`p2p-status-badge p2p-status-${scanStatus.toLowerCase()}`}>
                      {scanStatus === 'PAID'   ? 'Đã thanh toán'
                        : scanStatus === 'FAILED' ? 'Thất bại'
                        : 'Đang chờ'}
                    </span>
                  </div>
                </div>

                {!scanSubmittedCode && (
                  <>
                    {camError && <div className="scan-cam-error">⚠ {camError}</div>}
                    {!camError && (
                      <div className="scan-cam-status">
                        <span className="scan-cam-dot" /> Camera đang quét mã QR…
                      </div>
                    )}
                  </>
                )}

                {scanSubmittedCode && scanStatus === 'PENDING' && (
                  <div className="p2p-poll-hint">
                    <span className="p2p-poll-dot" />
                    Đang tự động kiểm tra giao dịch mỗi {P2P_POLL_MS / 1000}s…
                  </div>
                )}

                {scanCheckMsg && (
                  <div className={`p2p-check-msg${scanStatus === 'PAID' ? ' ok' : scanStatus === 'FAILED' ? ' err' : ''}`}>
                    {scanCheckMsg}
                  </div>
                )}

                {!isSubmittingCode && (
                  <button
                    type="button"
                    className="scan-cancel-btn"
                    onClick={() => setShowCancelModal(true)}
                    disabled={scanStatus === 'PAID'}
                  >
                    ← Hủy &amp; quay lại
                  </button>
                )}
              </div>

              {/* CỬA SỔ PHẢI — nhập / quét mã thanh toán, hoặc khi đã gửi
                  mã thì hiện trạng thái đang xác nhận / kết quả cuối cùng */}
              <div className="scan-pane scan-pane-code">
                {!scanSubmittedCode ? (
                  <>
                    <div className="field-label">Mã thanh toán MoMo (18 số)</div>
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      placeholder="Scan mã QR hoặc gõ mã 18 số"
                      value={manualCode}
                      onChange={e => { setManualCode(e.target.value); setManualErr('') }}
                      onKeyDown={handleManualCodeKey}
                      disabled={isSubmittingCode}
                      className="scan-code-input"
                    />
                    {manualErr && <div className="scan-code-err">⚠ {manualErr}</div>}

                    <button
                      type="button"
                      className={`scan-confirm-btn${isSubmittingCode ? ' loading' : ''}`}
                      onClick={submitManualCode}
                      disabled={!manualCode.trim() || isSubmittingCode}
                    >
                      {isSubmittingCode
                        ? <><div className="spinner" /> Đang xử lý…</>
                        : <>✓ Xác nhận thanh toán</>
                      }
                    </button>

                    {isServerErr && !isSubmittingCode && (
                      <button type="button" className="scan-retry-btn" onClick={submitManualCode}>
                        ⚡ Gửi lại dữ liệu
                      </button>
                    )}

                    {/* Camera chạy ngầm — ẩn khỏi UI nhưng vẫn quét */}
                    {scanning && (
                      <div className="scan-cam-hidden">
                        <video ref={setVideoRef} playsInline muted />
                        <canvas ref={canvasRef} />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="field-label">Xác nhận giao dịch</div>
                    <div className="p2p-iframe-loading">
                      {scanStatus === 'PENDING' && (
                        <>
                          <div className="spinner" style={{ borderTopColor: 'var(--mm)', borderColor: 'rgba(174,0,112,0.25)' }} />
                          <span>Đang xác nhận thanh toán…</span>
                        </>
                      )}
                      {scanStatus === 'PAID' && <span>✓ Thanh toán thành công!</span>}
                      {scanStatus === 'FAILED' && <span>✗ Giao dịch thất bại</span>}
                    </div>

                    <button
                      type="button"
                      className={`scan-confirm-btn${scanChecking ? ' loading' : ''}`}
                      onClick={() => checkScanStatus()}
                      disabled={scanChecking || scanStatus === 'PAID'}
                    >
                      {scanChecking
                        ? <><div className="spinner" /> Đang kiểm tra…</>
                        : <>✓ Kiểm tra giao dịch</>
                      }
                    </button>

                    {scanStatus === 'FAILED' && (
                      <button type="button" className="scan-retry-btn" onClick={retryScanCode}>
                        ⚡ Thử mã khác
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {p2pActive && (
            <div className="scan-split">
              {/* CỬA SỔ TRÁI — thông tin đơn hàng + trạng thái */}
              <div className="scan-pane scan-pane-info">
                <div className="field-label">Thông tin đơn hàng</div>
                <div className="scan-order-card">
                  <div className="scan-order-row">
                    <span>Mã đơn hàng</span>
                    <span className="scan-order-mono">{p2pOrderId || '—'}</span>
                  </div>
                  <div className="scan-order-row scan-order-amount">
                    <span>Số tiền</span>
                    <span>{formatAmount(amount)}₫</span>
                  </div>
                  <div className="scan-order-divider" />
                  <div className="scan-order-row">
                    <span>Nội dung</span>
                    <span className="scan-order-mono">{orderInfo}</span>
                  </div>
                  <div className="scan-order-divider" />
                  <div className="scan-order-row">
                    <span>Trạng thái</span>
                    <span className={`p2p-status-badge p2p-status-${p2pStatus.toLowerCase()}`}>
                      {p2pStatus === 'PAID'    ? 'Đã thanh toán'
                        : p2pStatus === 'EXPIRED' ? 'Hết hạn'
                        : p2pStatus === 'FAILED'  ? 'Thất bại'
                        : 'Đang chờ'}
                    </span>
                  </div>
                  {p2pStatus === 'PENDING' && (
                    <>
                      <div className="scan-order-divider" />
                      <div className="scan-order-row">
                        <span>Thời gian còn lại</span>
                        <span className={`p2p-countdown${p2pTimeLeft <= 60 ? ' p2p-countdown-warn' : ''}`}>
                          {formatCountdown(p2pTimeLeft)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {p2pStatus === 'PENDING' && (
                  <div className="p2p-poll-hint">
                    <span className="p2p-poll-dot" />
                    Đang tự động kiểm tra giao dịch mỗi {P2P_POLL_MS / 1000}s…
                  </div>
                )}

                {p2pCheckMsg && (
                  <div className={`p2p-check-msg${p2pStatus === 'PAID' ? ' ok' : (p2pStatus === 'EXPIRED' || p2pStatus === 'FAILED') ? ' err' : ''}`}>
                    {p2pCheckMsg}
                  </div>
                )}

                <button
                  type="button"
                  className="scan-cancel-btn"
                  onClick={() => setShowP2pCancelModal(true)}
                  disabled={p2pCancelling || p2pStatus === 'PAID'}
                >
                  ← Hủy giao dịch
                </button>
              </div>

              {/* CỬA SỔ PHẢI — mã QR để khách quét thanh toán */}
              <div className="scan-pane scan-pane-code">
                <div className="field-label">Khách quét mã QR để thanh toán</div>

                <div className="p2p-qr-card">
                  {p2pPayUrl ? (
                    <img
                      key={p2pOrderId}
                      src={`/api/momo/qr-extract?payUrl=${encodeURIComponent(p2pPayUrl)}`}
                      alt="Mã QR thanh toán MoMo"
                      className="p2p-qr-img"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className="p2p-iframe-loading">
                      <div className="spinner" style={{ borderTopColor: 'var(--mm)', borderColor: 'rgba(174,0,112,0.25)' }} />
                      <span>Đang tạo giao dịch…</span>
                    </div>
                  )}
                </div>

                {p2pPayUrl && (
                  <a
                    // Không trỏ thẳng payUrl/deeplink MoMo nữa (lộ URL thật + query
                    // string dài trên thanh địa chỉ khi mở tab mới). Trỏ qua
                    // /api/momo/status?open=1 — route cũ đã có sẵn logic tra Redis
                    // theo orderId, giờ thêm nhánh redirect. Khách chỉ thấy
                    // "…/api/momo/status?orderId=...&open=1" lúc bấm, trước khi
                    // được điều hướng sang trang MoMo thật.
                    href={`/api/momo/status?orderId=${encodeURIComponent(p2pOrderId)}&open=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p2p-open-link"
                  >
                    QR không hiển thị? Mở trang thanh toán trong tab mới ↗
                  </a>
                )}

                {p2pPayUrl && (
                  <button
                    type="button"
                    className={`p2p-copy-btn${p2pCopied ? ' copied' : ''}`}
                    onClick={copyP2pPayUrl}
                  >
                    {p2pCopied ? '✓ Đã copy link thanh toán' : '📋 Copy link thanh toán (URL)'}
                  </button>
                )}

                <button
                  type="button"
                  className={`scan-confirm-btn${p2pChecking ? ' loading' : ''}`}
                  onClick={() => checkP2pStatus()}
                  disabled={p2pChecking || p2pStatus === 'PAID'}
                >
                  {p2pChecking
                    ? <><div className="spinner" /> Đang kiểm tra…</>
                    : <>✓ Kiểm tra giao dịch</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* POPUP XÁC NHẬN HỦY ĐƠN ĐANG QUÉT */}
      {showCancelModal && (
        <div className="cancel-modal-backdrop">
          <div className="cancel-modal-box">
            <div className="cancel-modal-title">Xác nhận hủy giao dịch?</div>
            <p className="cancel-modal-desc">
              Hành động này sẽ hủy bỏ và đánh dấu thất bại cho đơn hàng{' '}
              <span className="cancel-modal-id">{scanOrderId}</span>.
            </p>
            <div className="cancel-modal-actions">
              <button
                type="button"
                className="cancel-modal-keep"
                onClick={() => setShowCancelModal(false)}
              >
                Tiếp tục chờ
              </button>
              <button
                type="button"
                className="cancel-modal-confirm"
                onClick={async () => {
                  setShowCancelModal(false)
                  await triggerCancelOrderBackend()
                }}
              >
                Đồng ý hủy đơn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP XÁC NHẬN HỦY ĐƠN P2P (QR chuyển tiền) */}
      {showP2pCancelModal && (
        <div className="cancel-modal-backdrop">
          <div className="cancel-modal-box">
            <div className="cancel-modal-title">Xác nhận hủy giao dịch?</div>
            <p className="cancel-modal-desc">
              Hành động này sẽ hủy bỏ và đánh dấu thất bại cho đơn hàng{' '}
              <span className="cancel-modal-id">{p2pOrderId}</span>.
              Nếu khách vừa thanh toán xong, đơn sẽ không bị hủy.
            </p>
            <div className="cancel-modal-actions">
              <button
                type="button"
                className="cancel-modal-keep"
                onClick={() => setShowP2pCancelModal(false)}
              >
                Tiếp tục chờ
              </button>
              <button
                type="button"
                className="cancel-modal-confirm"
                onClick={async () => {
                  setShowP2pCancelModal(false)
                  await cancelP2pOrder()
                }}
              >
                Đồng ý hủy đơn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI AMOUNT WIDGET — ngoài .card để fixed positioning không bị clip */}
      <AiAmountWidget onAmountSelect={setAmount} />
    </>
  )
}