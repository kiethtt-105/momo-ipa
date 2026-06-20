import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

function cleanCode(raw) {
  if (!raw) return ''
  return raw.trim()
}

export default function ScanPage() {
  const router = useRouter()

  const [authed, setAuthed] = useState(null)
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState(false)

  const [step, setStep] = useState('amount')

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const submitting = useRef(false)

  const [ready, setReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [camError, setCamError] = useState('')

  const [amount, setAmount] = useState('')
  const [orderInfo, setOrderInfo] = useState('')
  const [result, setResult] = useState(null)

  const [manualCode, setManualCode] = useState('')
  const [manualErr, setManualErr] = useState('')

  const [currentOrderId, setCurrentOrderId] = useState(null)
  const [isServerErr, setIsServerErr] = useState(false)

  const { amount: urlAmount, orderInfo: urlOrderInfo, quick } = router.query
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showConfirmAmountModal, setShowConfirmAmountModal] = useState(false)
  const [quickToast, setQuickToast] = useState(false)

  // Load jsQR
  useEffect(() => {
    if (window.jsQR) { setReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload = () => setReady(true)
    s.onerror = () => setCamError('Không tải được thư viện QR.')
    document.head.appendChild(s)
  }, [])

  // Auth
  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

  // Tự mở camera khi vào scan
  useEffect(() => {
    if (step === 'scan' && ready) {
      setCamError('')
      submitting.current = false
      setScanning(true)
    }
  }, [step, ready])

  // Tạo đơn nháp PENDING + chuyển sang step scan.
  // Nhận amount/orderInfo qua tham số (không đọc từ state) để dùng được ngay
  // cả khi gọi từ luồng link nhanh, lúc đó state amount/orderInfo có thể
  // chưa kịp cập nhật xong (setState là async).
  async function confirmAndProceed(amt, info) {
    setShowConfirmAmountModal(false)
    const generatedId = `POS${Date.now()}`
    setCurrentOrderId(generatedId)
    submitting.current = true

    try {
      // Chính thức tạo Log đơn hàng nháp PENDING lên hệ thống
      await fetch('/api/momo/save-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: generatedId,
          amount: parseInt(amt),
          orderInfo: info || `iPOS${generatedId.replace('POS', '')}`
        }),
      })
    } catch (e) {
      console.error("Lỗi lưu đơn hàng nháp:", e)
    } finally {
      submitting.current = false
      setStep('scan') // Chuyển sang màn hình Step 2 để bắn súng quét mã
    }
  }

  // Load amount và orderInfo từ query params & Dọn dẹp URL chống lặp logic
  useEffect(() => {
    if (!router.isReady) return

    if (urlAmount) {
      setAmount(urlAmount)
    }
    if (urlOrderInfo) {
      setOrderInfo(urlOrderInfo)
    }

    if (quick === 'true' && urlAmount && !currentOrderId && !submitting.current) {
      // Lấy thông tin từ link nhanh (?quick=true&amount=...) → BỎ QUA popup xác nhận,
      // tạo đơn nháp ngay luôn. Chỉ hiện 1 toast nhỏ tự ẩn để báo cho thu ngân biết.
      router.replace('/admin/scan', undefined, { shallow: true })
      confirmAndProceed(urlAmount, urlOrderInfo)
      setQuickToast(true)
    }
  }, [urlAmount, urlOrderInfo, quick, router.isReady])

  // Tự ẩn toast "đã bỏ qua xác nhận" sau ~2.5s
  useEffect(() => {
    if (!quickToast) return
    const t = setTimeout(() => setQuickToast(false), 2500)
    return () => clearTimeout(t)
  }, [quickToast])

  // Khi popup xác nhận số tiền (nhập tay) đang mở → Enter cũng xác nhận luôn,
  // không cần bấm chuột vào nút "Xác nhận"
  useEffect(() => {
    if (!showConfirmAmountModal) return
    const fn = e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmAndProceed(amount, orderInfo)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [showConfirmAmountModal, amount, orderInfo])

  // Thêm đoạn này ở khu vực các useEffect đầu file để tự focus khi nhấn thử lại
  useEffect(() => {
    if (!result && step === 'scan') {
      const inputEl = document.querySelector('input[placeholder*="Bắn mã"]')
      if (inputEl) inputEl.focus()
    }
  }, [result, step])

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
    if (code?.data && !submitting.current) {
      onDetected(code.data)
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

  useEffect(() => () => stopCamera(), [])

  async function onDetected(raw) {
    if (submitting.current) return
    submitting.current = true
    stopCamera()

    const code = cleanCode(raw)
    console.log('[SCAN] raw QR data:', raw)
    setManualCode(code)

    const amt = parseInt(amount)
    let orderId = currentOrderId || `POS${Date.now()}`
    const baseOrderInfo = orderInfo || `iPOS${orderId.replace(/^POS/, '').replace(/_\d+$/, '')}`

    // Tự động thử lại với orderId mới nếu bị trùng (resultCode 41)
    const MAX_RETRY = 5
    let attempt = 0
    let data = null

    try {
      while (attempt < MAX_RETRY) {
        const res = await fetch('/api/momo/pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: amt, orderInfo: baseOrderInfo, paymentCode: code }),
        })
        data = await res.json()

        if (data.resultCode === 41) {
          // Trùng orderId → bump suffix _2, _3, ...
          const match = orderId.match(/^(.+)_(\d+)$/)
          orderId = match ? `${match[1]}_${parseInt(match[2]) + 1}` : `${orderId}_2`
          setCurrentOrderId(orderId)
          console.log(`[SCAN] Trùng orderId, thử lại với: ${orderId}`)
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

        break // Không phải lỗi 41 → thoát
      }

      setResult({ success: data.resultCode === 0, data, amount: amt, orderId })
    } catch {
      submitting.current = false
      setIsServerErr(true)
      setManualErr('Mất kết nối hoặc cổng thanh toán phản hồi chậm!')
    }
  }

  function resetAll() {
    setResult(null)
    setAmount('')
    setOrderInfo('')
    setCurrentOrderId(null)
    setStep('amount')
    submitting.current = false
    setManualCode('')
    setManualErr('')
  }

  const handleEnterKey = (e) => {
    if (e.key === 'Enter') {
      if (amount && parseInt(amount) >= 1000) {
        // Mở popup xác nhận giống nút "Xác nhận →" để luồng tạo
        // orderId + gọi save-pending luôn được thực hiện trước khi sang step scan
        setShowConfirmAmountModal(true)
      }
    }
  }

  async function submitManualCode() {
    const code = cleanCode(manualCode)
    if (!/^(MM)?\d{18}$/.test(code)) {
      setManualErr('Mã không hợp lệ. Vui lòng kiểm tra lại.')
      return
    }
    setManualErr('')
    await onDetected(manualCode)
  }

  const handleManualCodeKey = (e) => {
    if (e.key === 'Enter') {
      submitManualCode()
    }
  }

  // Auto submit khi nhập đủ 18 ký tự
  useEffect(() => {
    const code = cleanCode(manualCode)
    if (code.length === 18 && !submitting.current && /^(\d{18}|MM\d{16})$/.test(code)) {
      submitManualCode()
    }
  }, [manualCode])

  // Hàm ép đơn hàng PENDING thành FAILED khi thực hiện hủy giao dịch
  async function triggerCancelOrderBackend() {
    submitting.current = true
    try {
      await fetch('/api/momo/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrderId,
          amount: parseInt(amount),
          orderInfo: orderInfo || currentOrderId,
          paymentCode: '000000000000000000' // Bắn mã ảo để API pos.js cập nhật trạng thái FAILED
        }),
      })
    } catch (e) {
      console.error(e)
    } finally {
      submitting.current = false
      setAmount('')
      setOrderInfo('')
      setCurrentOrderId(null)
      setManualCode('')
      setManualErr('')
      setStep('amount')
    }
  }

  // Class dùng lại nhiều lần
  const inputBase = 'w-full px-3.5 py-[11px] border-[1.5px] border-momo/15 rounded-[10px] text-sm bg-[#f5edf2]/40 text-gray-900 mb-2 outline-none focus:border-momo/40 transition-colors'
  const btnPrimary = 'w-full bg-momo text-white border-none rounded-xl py-[13px] px-6 text-sm font-bold cursor-pointer shadow-[0_4px_16px_rgba(174,0,112,0.25)] disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80'
  const card = 'bg-white/96 rounded-2xl px-4 py-[18px] shadow-[0_2px_16px_rgba(174,0,112,0.06)] border border-white/80'

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fff8fb]">
        <div className="w-2.5 h-2.5 rounded-full bg-momo animate-pulse2" />
      </div>
    )
  }

  if (!authed) {
    async function login() {
      setPwError(false)
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) { setAuthed(true); setPassword('') }
      else { setPwError(true); setPassword('') }
    }
    return (
      <>
        <Head><title>Admin · Đăng nhập</title></Head>
        <div className="relative min-h-screen bg-gradient-to-br from-[#fff0f7] via-[#fce4f0] to-[#f5edf2]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[360px] bg-white rounded-[20px] px-7 py-9 shadow-[0_20px_60px_rgba(174,0,112,0.12)] flex flex-col items-center">
            <img src="/Main.png" alt="" className="w-12 h-12 rounded-xl mb-4" />
            <h1 className="text-xl font-extrabold text-gray-900 mb-1.5">Hệ thống quản lý giao dịch</h1>
            <input
              type="password" placeholder="Nhập mật khẩu để tiếp tục" value={password} autoFocus
              onChange={e => { setPassword(e.target.value); setPwError(false) }}
              onKeyDown={e => e.key === 'Enter' && login()}
              className={`${inputBase} ${pwError ? 'border-red-600' : ''}`}
            />
            {pwError && <p className="text-red-600 text-sm mb-2.5">⚠ Sai mật khẩu</p>}
            <button onClick={login} className={btnPrimary}>Đăng nhập</button>
          </div>
        </div>
      </>
    )
  }

  if (result) {
    const isSuccess = result.success

    return (
      <>
        <Head><title>Kết quả thanh toán</title></Head>
        <div className="min-h-screen bg-gradient-to-br from-[#fff0f7] via-[#fce4f0] to-[#f5edf2]">
          <div className="flex items-center justify-center min-h-screen p-5">
            <div className={`${card} max-w-[420px] w-full text-center px-6 py-10`}>
              <div className="text-5xl mb-3">{isSuccess ? '✅' : '❌'}</div>

              <h2 className={`text-xl font-extrabold mb-2 ${isSuccess ? 'text-green-600' : 'text-red-600'}`}>
                {isSuccess ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
              </h2>

              <div className="text-2xl font-extrabold text-momo mb-2">
                {fmt(result.amount)} ₫
              </div>

              <p className="text-sm text-gray-500 mb-1">{result.data.message}</p>
              {result.data.transId && (
                <p className="text-xs font-mono text-gray-700 mt-1">
                  Mã GD: {result.data.transId}
                </p>
              )}

              <div className="flex flex-col gap-3 mt-8">
                {!isSuccess && (
                  <button
                    onClick={() => {
                      setResult(null)
                      setManualCode('')
                      setManualErr('')
                      setIsServerErr(false)
                      submitting.current = false
                      setScanning(true)
                      setStep('scan')
                    }}
                    className="w-full bg-amber-500 text-white border-none rounded-xl py-[13px] px-6 text-sm font-bold cursor-pointer shadow-[0_4px_16px_rgba(245,158,11,0.25)] active:opacity-80"
                  >
                    🔄 Thử lại giao dịch
                  </button>
                )}
                <button onClick={resetAll} className={btnPrimary}>
                  {isSuccess ? 'Giao Dịch Mới' : 'Tạo Giao Dịch Mới'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const stepIdx = step === 'amount' ? 0 : 1
  const STEPS = ['Thông tin ', 'Scan QR']

  return (
    <>
      <Head>
        <title>SCAN PAYMENT</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-[#fff0f7] via-[#fce4f0] to-[#f5edf2]">

        {/* Header */}
        <div className="sticky top-0 z-[100] bg-white/92 backdrop-blur-xl border-b border-momo/10 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              // Nếu đang ở màn hình scan, chặn lại để hiện popup hủy giao dịch
              if (step === 'scan') {
                setShowCancelModal(true)
              } else {
                router.push('/admin')
              }
            }}
            className="w-[34px] h-[34px] rounded-lg border border-momo/15 bg-white cursor-pointer text-lg text-momo flex items-center justify-center active:opacity-80"
          >←</button>
          <div className="flex items-center gap-2">
            <img src="/Main.png" alt="" className="w-[26px] h-[26px] rounded-md" />
            <span className="font-extrabold text-momo text-base">MoMo POS SCAN</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            title="Tải lại trang (dùng khi bị đơ)"
            className="w-[34px] h-[34px] rounded-lg border border-momo/15 bg-white cursor-pointer text-momo flex items-center justify-center active:opacity-80 active:rotate-180 transition-transform duration-300"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 12a9 9 0 0 1 15.5-6.36M21 12a9 9 0 0 1-15.5 6.36" />
              <path d="M3 3v6h6M21 21v-6h-6" />
            </svg>
          </button>
        </div>

        {/* Step bar */}
        <div className="flex justify-center items-center pt-3.5 px-6 max-w-[480px] mx-auto">
          {STEPS.map((label, i) => (
            <div key={i} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold transition-all duration-300 ${
                    i <= stepIdx ? 'bg-momo text-white' : 'bg-gray-200 text-gray-400'
                  }`}
                >{i < stepIdx ? '✓' : i + 1}</div>
                <span className={`text-[10px] font-semibold whitespace-nowrap ${i <= stepIdx ? 'text-momo' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-[18px] transition-all duration-300 ${i < stepIdx ? 'bg-momo' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="max-w-[480px] mx-auto px-4 pb-10 pt-4 flex flex-col gap-3">

          {/* STEP 1: AMOUNT */}
          {step === 'amount' && (
            <div className={card}>
              <h3 className="text-[13px] font-bold text-gray-700 mb-3.5">💰 Nhập số tiền </h3>
              <input
                type="number" placeholder="Nhập số tiền..."
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={handleEnterKey}
                className={inputBase} min={1000} max={5000000} autoFocus
                step={1000}
                disabled={quick === 'true'}
              />

              <div className="pt-3 border-t border-gray-100 mb-3.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Nội dung thanh toán</p>
                <input
                  placeholder="Nhập mã đơn hàng "
                  value={orderInfo} onChange={e => setOrderInfo(e.target.value)}
                  onKeyDown={handleEnterKey}
                  className={inputBase}
                  disabled={quick === 'true'}
                />
              </div>
              <button
                onClick={() => setShowConfirmAmountModal(true)}
                disabled={!amount || parseInt(amount) < 1000 || submitting.current}
                className={btnPrimary}
              >
                Xác nhận  →
              </button>
            </div>
          )}

          {/* STEP 2: SCAN */}
          {step === 'scan' && (
            <div className={card}>
              <h3 className="text-[13px] font-bold text-gray-700 mb-3">📷 Quy trình nhận mã thanh toán MoMo</h3>

              {/* TÓM TẮT ĐƠN HÀNG ĐẦY ĐỦ */}
              {(amount || orderInfo || currentOrderId) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
                  <div className="text-xs font-bold text-slate-500 mb-3 uppercase">
                    THÔNG TIN ĐƠN HÀNG TẠI QUẦY
                  </div>

                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-slate-600 text-[13px]">Mã đơn hàng (Log ID):</span>
                    <span className="font-bold font-mono text-gray-900 bg-slate-200 px-1.5 py-0.5 rounded">
                      {currentOrderId || 'Chưa khởi tạo'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Số tiền thanh toán</span>
                    <span className="text-[28px] font-extrabold text-momo">{fmt(amount)} ₫</span>
                  </div>

                  <div className="h-px bg-slate-200 my-3" />
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Nội dung thanh toán</div>
                    <div className="text-[15px] text-gray-900 font-medium">
                      {orderInfo || (currentOrderId ? `iPOS${currentOrderId.replace('POS', '')}` : '')}
                    </div>
                  </div>
                </div>
              )}

              {/* Input mã thủ công & Súng Quét */}
              <div className="mb-4 p-3.5 bg-[#f9f0f5] rounded-[10px] border border-momo/15">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                  MÃ THANH TOÁN MOMO
                </p>
                <input
                  autoFocus
                  placeholder="Scan mã QR Trên MoMo "
                  value={manualCode}
                  onChange={e => { setManualCode(e.target.value); setManualErr('') }}
                  onKeyDown={handleManualCodeKey}
                  className={`${inputBase} bg-white ${manualErr ? 'mb-1' : 'mb-2'}`}
                  disabled={submitting.current}
                />
                {manualErr && <p className="text-xs text-red-600 mb-2">⚠ {manualErr}</p>}
                {/* Chỉ hiện khi server bị đơ hoặc lỗi kết nối mạng */}
                {isServerErr && !submitting.current && (
                  <button
                    onClick={submitManualCode}
                    className="w-full bg-amber-500 text-white border-none rounded-lg py-2.5 px-4 text-[13px] font-bold cursor-pointer mt-1.5 shadow-[0_4px_12px_rgba(245,158,11,0.2)] active:opacity-80"
                  >
                    ⚡ Gửi lại dữ liệu (Kiểm tra giao dịch)
                  </button>
                )}
                <button
                  onClick={submitManualCode}
                  disabled={!manualCode.trim() || submitting.current}
                  className="w-full bg-momo text-white border-none rounded-lg py-2 px-4 text-[13px] font-bold cursor-pointer mt-1 disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80"
                >
                  {submitting.current ? 'Đang xử lý...' : '✓ Xác nhận thanh toán'}
                </button>
              </div>

              {/* Camera chạy ngầm không gây vỡ/xấu giao diện */}
              {!submitting.current && scanning && (
                <div className="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none">
                  <video ref={setVideoRef} playsInline muted className="w-full" />
                  <canvas ref={canvasRef} />
                </div>
              )}

              {/* CỤM NÚT DIỀU HƯỚNG DƯỚI ĐÁY ĐƯỢC THU NHỎ GỌN GÀNG HÀNG NGANG */}
              {!submitting.current && (
                <div className="flex gap-3 mt-3 border-t border-gray-100 pt-3.5">
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="flex-1 bg-white text-slate-500 border border-slate-300 rounded-lg py-2.5 px-3.5 text-[13px] font-semibold cursor-pointer active:opacity-80"
                  >
                    ← Hủy & Quay lại
                  </button>
                </div>
              )}

              {/* Trạng thái đang xử lý thanh toán */}
              {submitting.current && (
                <div className="py-7 px-5 text-center bg-[#f9f0f5] rounded-xl mt-3">
                  <div className="inline-block w-9 h-9 border-4 border-momo/30 border-t-momo rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[15px] font-bold text-momo">Đang xử lý thanh toán...</p>
                  <p className="text-[13px] text-gray-500">Vui lòng không đóng trang</p>
                </div>
              )}

              <div className="flex gap-2.5 mt-2.5">
                {result && !result.success && (
                  <button
                    onClick={() => {
                      setResult(null)
                      setManualCode('')
                      setManualErr('')
                      submitting.current = false
                      setScanning(true)
                    }}
                    className="w-full bg-amber-500 text-white border-none rounded-[10px] py-2.5 cursor-pointer font-semibold active:opacity-80"
                  >
                    🔄 Thử lại
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── POPUP XÁC NHẬN SỐ TIỀN & THÔNG TIN ĐƠN HÀNG (render ở mọi step) ─── */}
          {showConfirmAmountModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4">
              <div className="bg-white rounded-2xl w-full max-w-[365px] p-6 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]">
                <div className="text-base font-bold text-slate-800 mb-3.5 text-center uppercase tracking-wide">
                  🔎 Kiểm tra thông tin đơn hàng
                </div>

                <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-200">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[13px]">Số tiền cần thu:</span>
                      <span className="text-2xl font-black text-momo">{fmt(amount)} ₫</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-500 text-[13px]">Nội dung thanh toán:</span>
                      <span className="text-sm font-semibold text-gray-900 break-all">
                        {orderInfo || `iPOS${Date.now()}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowConfirmAmountModal(false)
                      // Nếu đi từ link nhanh bị hủy, trả URL về nguyên bản để thu ngân nhập tay tùy ý
                      if (quick === 'true') {
                        router.replace('/admin/scan', undefined, { shallow: true })
                      }
                    }}
                    className="flex-1 py-2.5 bg-white text-slate-500 border border-slate-300 rounded-lg text-[13px] font-semibold cursor-pointer active:opacity-80"
                  >
                    Trở lại
                  </button>

                  <button
                    onClick={() => confirmAndProceed(amount, orderInfo)}
                    className="flex-1 py-2.5 bg-momo text-white border-none rounded-lg text-[13px] font-bold cursor-pointer shadow-[0_4px_12px_rgba(174,0,112,0.2)] active:opacity-80"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* POPUP MODAL XÁC NHẬN HỦY GIAO DỊCH CHẶN TREO ĐƠN (render ở mọi step) */}
          {showCancelModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4">
              <div className="bg-white rounded-2xl w-full max-w-[350px] p-[22px] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]">
                <div className="text-[15px] font-bold text-slate-800 mb-1.5 text-center">
                  Xác nhận hủy giao dịch?
                </div>
                <p className="text-[13px] text-slate-500 text-center mb-4.5 leading-relaxed">
                  Hành động này sẽ hủy bỏ và đánh dấu thất bại cho đơn hàng <span className="font-mono font-semibold">{currentOrderId}</span>.
                </p>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setShowCancelModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 border-none rounded-lg text-[13px] font-semibold cursor-pointer active:opacity-80"
                  >
                    Tiếp tục chờ
                  </button>
                  <button
                    onClick={async () => {
                      setShowCancelModal(false)
                      stopCamera()
                      await triggerCancelOrderBackend()
                    }}
                    className="flex-1 py-2.5 bg-red-600 text-white border-none rounded-lg text-[13px] font-semibold cursor-pointer active:opacity-80"
                  >
                    Đồng ý hủy đơn
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TOAST: thông báo nhỏ khi bỏ qua bước xác nhận vì lấy từ link nhanh */}
          {quickToast && (
            <div
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
              style={{ animation: 'fadein 0.2s ease' }}
            >
              ⚡ Đã tạo đơn từ link nhanh — bỏ qua bước xác nhận
            </div>
          )}

        </div>
      </div>
    </>
  )
}