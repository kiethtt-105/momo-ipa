import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

function cleanCode(raw) {
  if (!raw) return ''
  return raw.trim()
}

const SCAN_SESSION_KEY = 'momo_scan_session'

export async function getServerSideProps() {
  return { props: {} }
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

  const [manualCode, setManualCode] = useState('')
  const [manualErr, setManualErr] = useState('')

  const [currentOrderId, setCurrentOrderId] = useState(null)
  const [isServerErr, setIsServerErr] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Kết quả kiểm tra — khi có PAID/FAILED sẽ redirect sang /result thay vì hiện inline
  const [checkResult, setCheckResult] = useState(null)
  const [isChecking, setIsChecking] = useState(false)

  const { amount: urlAmount, orderInfo: urlOrderInfo, quick } = router.query
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [quickToast, setQuickToast] = useState(false)

  // Load jsQR — camera luôn chạy ngầm, không phụ thuộc vào trạng thái UI
  useEffect(() => {
    if (window.jsQR) { setReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload = () => setReady(true)
    s.onerror = () => setCamError('Không tải được thư viện QR.')
    document.head.appendChild(s)
  }, [])

  // ── KHÔNG reload khi nhận BroadcastChannel ──
  // Bug cũ: reload() xoá toàn bộ state + tắt camera.
  // Giờ chỉ hiện toast nhỏ thông báo, không reload.
  // Trang scan tiếp tục sẵn sàng nhận đơn mới.
  const [resultToast, setResultToast] = useState(null) // { orderId, status }
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return
    const ch = new BroadcastChannel('momo-result')
    ch.onmessage = (e) => {
      if (e.data?.type === 'momo-result-done') {
        const { orderId, status } = e.data
        setResultToast({ orderId, status })
        // Reset về trạng thái sẵn sàng đơn mới (không reload)
        submitting.current = false
        setIsSubmitting(false)
        setManualCode('')
        setManualErr('')
        setIsServerErr(false)
        setCurrentOrderId(null)
        setAmount('')
        setOrderInfo('')
        setStep('amount')
        if (typeof window !== 'undefined') sessionStorage.removeItem(SCAN_SESSION_KEY)
      }
    }
    return () => ch.close()
  }, [])

  useEffect(() => {
    if (!resultToast) return
    const t = setTimeout(() => setResultToast(null), 4000)
    return () => clearTimeout(t)
  }, [resultToast])

  // Auth
  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

  // Tự mở camera khi vào step scan — camera LUÔN bật, kể cả khi đang nhập mã thủ công
  useEffect(() => {
    if (step === 'scan' && ready) {
      setCamError('')
      submitting.current = false
      setScanning(true)
    }
  }, [step, ready])

  async function confirmAndProceed(amt, info) {
    const generatedId = `POS${Date.now()}`
    setCurrentOrderId(generatedId)
    submitting.current = true

    const finalOrderInfo = info || `iPOS${generatedId.replace('POS', '')}`

    try {
      await fetch('/api/momo/save-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: generatedId,
          amount: parseInt(amt),
          orderInfo: finalOrderInfo
        }),
      })
    } catch (e) {
      console.error('Lỗi lưu đơn hàng nháp:', e)
    } finally {
      submitting.current = false
      setStep('scan')
    }
  }
  useEffect(() => {
    if (!router.isReady) return

    if (urlAmount) setAmount(urlAmount)
    if (urlOrderInfo) setOrderInfo(urlOrderInfo)

    if (urlAmount && !currentOrderId && !submitting.current) {
      router.replace('/admin/scan', undefined, { shallow: true })
      confirmAndProceed(urlAmount, urlOrderInfo)
      if (quick === 'true') setQuickToast(true)
    }
  }, [urlAmount, urlOrderInfo, quick, router.isReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (step === 'scan' && currentOrderId) {
      sessionStorage.setItem(SCAN_SESSION_KEY, JSON.stringify({
        step, amount, orderInfo, currentOrderId,
      }))
    }
  }, [step, amount, orderInfo, currentOrderId])

  useEffect(() => {
    if (typeof window === 'undefined' || !router.isReady) return
    if (urlAmount || currentOrderId) return

    try {
      const saved = sessionStorage.getItem(SCAN_SESSION_KEY)
      if (!saved) return
      const s = JSON.parse(saved)
      if (s?.step === 'scan' && s.currentOrderId) {
        setAmount(s.amount || '')
        setOrderInfo(s.orderInfo || '')
        setCurrentOrderId(s.currentOrderId)
        setStep('scan')
      }
    } catch (e) {
      console.error('Không khôi phục được session quét trước đó:', e)
    }
  }, [router.isReady])

  useEffect(() => {
    if (!quickToast) return
    const t = setTimeout(() => setQuickToast(false), 2500)
    return () => clearTimeout(t)
  }, [quickToast])

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

  // Dừng camera khi unmount trang
  useEffect(() => () => stopCamera(), [])

  async function onDetected(raw) {
    if (submitting.current) return
    submitting.current = true
    setIsSubmitting(true)
    setCheckResult(null)
    // KHÔNG stopCamera() ở đây — camera tiếp tục chạy ngầm

    const code = cleanCode(raw)
    console.log('[SCAN] raw QR data:', raw)
    setManualCode(code)

    const amt = parseInt(amount)
    let orderId = currentOrderId || `POS${Date.now()}`
    const baseOrderInfo = orderInfo || `iPOS${orderId.replace(/^POS/, '').replace(/_\d+$/, '')}`

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

        break
      }

      // Mở /result ở TAB MỚI — tab scan tiếp tục sẵn sàng nhận mã mới
      const qs = new URLSearchParams({
        orderId,
        resultCode: data.resultCode,
        transId: data.transId || '',
        amount: amt,
        payType: data.payType || 'qr',
        message: data.message || '',
        orderInfo: baseOrderInfo,
      }).toString()
      window.location.href = `/result?${qs}`;
      // Reset để sẵn sàng quét tiếp — camera vẫn chạy ngầm
      submitting.current = false
      setIsSubmitting(false)
      setManualCode('')
      setManualErr('')
      // Restart camera nếu đã bị dừng
      if (!streamRef.current && scanning) setScanning(true)
    } catch {
      submitting.current = false
      setIsSubmitting(false)
      setIsServerErr(true)
      setManualErr('Mất kết nối hoặc cổng thanh toán phản hồi chậm!')
    }
  }

  function resetAll() {
    setAmount('')
    setOrderInfo('')
    setCurrentOrderId(null)
    setStep('amount')
    submitting.current = false
    setIsSubmitting(false)
    setCheckResult(null)
    setManualCode('')
    setManualErr('')
    setIsServerErr(false)
    if (typeof window !== 'undefined') sessionStorage.removeItem(SCAN_SESSION_KEY)
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
    if (e.key === 'Enter') submitManualCode()
  }

  // Auto submit khi đủ ký tự hợp lệ
  useEffect(() => {
    const code = cleanCode(manualCode)
    if ((code.length === 18 || code.length === 20) && !submitting.current && /^(MM)?\d{18}$/.test(code)) {
      submitManualCode()
    }
  }, [manualCode])

  async function triggerCancelOrderBackend() {
    submitting.current = true
    setIsSubmitting(true)
    try {
      await fetch('/api/momo/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrderId,
          amount: parseInt(amount),
          orderInfo: orderInfo || currentOrderId,
          paymentCode: '000000000000000000'
        }),
      })
    } catch (e) {
      console.error(e)
    } finally {
      submitting.current = false
      setIsSubmitting(false)
      setAmount('')
      setOrderInfo('')
      setCurrentOrderId(null)
      setManualCode('')
      setManualErr('')
      setStep('amount')
      if (typeof window !== 'undefined') sessionStorage.removeItem(SCAN_SESSION_KEY)
    }
  }

  // ── KIỂM TRA GIAO DỊCH — nếu có kết quả thì redirect sang /result ──
  // Bug cũ: chỉ setCheckResult hiện inline, không bao giờ đến /result.
  // Fix: nếu PAID/FAILED → mở /result tab mới; nếu PENDING → hiện inline như cũ.
  async function checkOrder() {
    if (!currentOrderId) return
    setIsChecking(true)
    setCheckResult(null)
    try {
      const res = await fetch(`/api/momo/status?orderId=${encodeURIComponent(currentOrderId)}`)
      const data = await res.json()

      if (data.status === 'PAID' || data.status === 'FAILED') {
        // Có kết quả rõ ràng → điều hướng sang /result
        const qs = new URLSearchParams({
          orderId: currentOrderId,
          resultCode: data.status === 'PAID' ? 0 : data.resultCode || 99,
          transId: data.transId || '',
          amount: data.amount || amount,
          payType: data.payType || '',
          message: data.message || '',
          orderInfo: data.orderInfo || orderInfo || currentOrderId,
        }).toString()
        window.open(`/result?${qs}`, '_blank')
        window.focus()
      } else {
        // Vẫn PENDING hoặc chưa có dữ liệu → hiện inline
        setCheckResult(data)
      }
    } catch (e) {
      setCheckResult({ error: 'Không kết nối được server' })
    } finally {
      setIsChecking(false)
    }
  }

  const inputBase = 'w-full px-3.5 py-[11px] border-[1.5px] border-momo/15 rounded-[10px] text-sm bg-[#f5edf2]/40 text-gray-900 mb-2 outline-none focus:border-momo/40 transition-colors'
  const btnPrimary = 'w-full bg-momo text-white border-none rounded-xl py-[13px] px-6 text-sm font-bold cursor-pointer shadow-[0_4px_16px_rgba(174,0,112,0.25)] disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80'
  const card = 'bg-white/96 rounded-2xl px-4 py-[18px] shadow-[0_2px_16px_rgba(174,0,112,0.06)] border border-white/80'

  if (authed === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#fff8fb]">
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
        <div className="relative min-h-[100dvh] bg-gradient-to-br from-[#fff0f7] via-[#fce4f0] to-[#f5edf2]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[360px] bg-white rounded-[20px] px-7 py-9 shadow-[0_20px_60px_rgba(174,0,112,0.12)] flex flex-col items-center">
            <img src="/Main.png" alt="" className="w-12 h-12 rounded-xl mb-4" />
            <h1 className="text-xl font-extrabold text-gray-900 mb-1.5">Nhập mật khẩu để tiếp tục</h1>
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

  const stepIdx = step === 'amount' ? 0 : 1
  const STEPS = ['Thông tin', 'Scan QR']

  return (
    <>
      <Head>
        <title>CỔNG THANH TOÁN QR CÁ NHÂN</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&display=swap" />
      </Head>
      <div className="min-h-[100dvh] flex flex-col bg-gradient-to-br from-[#fff0f7] via-[#fce4f0] to-[#f5edf2]">

        {/* Header — nút reload giờ = Kiểm tra giao dịch khi đang ở step scan */}
        <div className="sticky top-0 z-[100] flex-shrink-0 bg-white/92 backdrop-blur-xl border-b border-momo/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/Main.png" alt="" className="w-[26px] h-[26px] rounded-md" />
            <span className="font-extrabold text-momo text-base">MoMo POS SCAN</span>
          </div>

          {/* Nút góc phải: khi step=scan → Kiểm tra GD (không reload nữa); khi step=amount → nút trống */}
          {step === 'scan' ? (
            <button
              onClick={checkOrder}
              disabled={!currentOrderId || isChecking}
              title="Kiểm tra trạng thái giao dịch hiện tại"
              className="h-[34px] px-3 rounded-lg border border-blue-200 bg-blue-50 cursor-pointer text-blue-600 flex items-center gap-1.5 text-[12px] font-bold active:opacity-80 disabled:opacity-40"
            >
              {isChecking ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              )}
              Kiểm tra GD
            </button>
          ) : (
            <div className="w-[34px]" />
          )}
        </div>

        {/* Step bar */}
        <div className="flex flex-shrink-0 justify-center items-center pt-3.5 px-6 max-w-[480px] w-full mx-auto">
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

        <div className={`flex-1 flex flex-col max-w-[480px] w-full mx-auto px-4 pb-10 pt-4 gap-3 ${step === 'amount' ? 'justify-center' : ''}`}>

          {/* STEP 1: CHỜ ĐƠN TỪ LINK */}
          {step === 'amount' && (
            <div className={`${card} text-center py-9`}>
              {(!router.isReady || (urlAmount && !currentOrderId)) ? (
                <>
                  <div className="inline-block w-9 h-9 border-4 border-momo/30 border-t-momo rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[15px] font-bold text-momo">Đang khởi tạo giao dịch...</p>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">🔗</div>
                  <h3 className="text-[15px] font-bold text-gray-700 mb-1.5">Chưa có giao dịch nào</h3>
                  <p className="text-[13px] text-gray-500 mb-5 leading-relaxed">
                    Trang này chỉ nhận đơn từ link do quầy thu ngân tạo.<br />
                    Vui lòng tạo giao dịch mới để lấy link/QR.
                  </p>
                  <button
                    onClick={() => router.push('/admin/create-transaction')}
                    className={btnPrimary}
                  >
                    + Tạo giao dịch mới
                  </button>
                </>
              )}
            </div>
          )}

          {/* STEP 2: SCAN */}
          {step === 'scan' && (
            <div className={card}>
              <h3 className="text-[13px] font-bold text-gray-700 mb-3">📷 Quy trình nhận mã thanh toán MoMo</h3>

              {/* Tóm tắt đơn hàng */}
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

              {/* Input mã + Nút xác nhận */}
              <div className="mb-4 p-3.5 bg-[#f9f0f5] rounded-[10px] border border-momo/15">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                  MÃ THANH TOÁN MOMO
                </p>
                <input
                  autoFocus
                  placeholder="Scan mã QR trên MoMo"
                  value={manualCode}
                  onChange={e => { setManualCode(e.target.value); setManualErr('') }}
                  onKeyDown={handleManualCodeKey}
                  className={`${inputBase} bg-white ${manualErr ? 'mb-1' : 'mb-2'}`}
                  disabled={isSubmitting}
                />
                {manualErr && <p className="text-xs text-red-600 mb-2">⚠ {manualErr}</p>}

                <button
                  onClick={submitManualCode}
                  disabled={!manualCode.trim() || isSubmitting}
                  className="w-full bg-momo text-white border-none rounded-lg py-2 px-4 text-[13px] font-bold cursor-pointer mt-1 disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80"
                >
                  {isSubmitting ? 'Đang xử lý...' : '✓ Xác nhận thanh toán'}
                </button>

                {/* Nút gửi lại khi server lỗi */}
                {isServerErr && !submitting.current && (
                  <button
                    onClick={submitManualCode}
                    className="w-full bg-amber-500 text-white border-none rounded-lg py-2.5 px-4 text-[13px] font-bold cursor-pointer mt-1.5 shadow-[0_4px_12px_rgba(245,158,11,0.2)] active:opacity-80"
                  >
                    ⚡ Gửi lại dữ liệu
                  </button>
                )}
              </div>

              {/* Camera chạy ngầm LUÔN LUÔN — ẩn khỏi UI nhưng vẫn quét */}
              {scanning && (
                <div className="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none">
                  <video ref={setVideoRef} playsInline muted className="w-full" />
                  <canvas ref={canvasRef} />
                </div>
              )}

              {/* Kết quả kiểm tra inline (chỉ hiện khi PENDING) */}
              {checkResult && (
                <div className={`mb-3 rounded-xl px-3.5 py-3 text-[13px] border ${
                  checkResult.error
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  {checkResult.error
                    ? `⚠ ${checkResult.error}`
                    : `⏳ ${checkResult.status || 'Đang chờ'} — ${checkResult.message || 'Chưa có kết quả từ MoMo'}`
                  }
                </div>
              )}

              {/* Trạng thái đang xử lý */}
              {isSubmitting && (
                <div className="py-7 px-5 text-center bg-[#f9f0f5] rounded-xl mt-3">
                  <div className="inline-block w-9 h-9 border-4 border-momo/30 border-t-momo rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[15px] font-bold text-momo">Đang xử lý thanh toán...</p>
                  <p className="text-[13px] text-gray-500">Vui lòng không đóng trang</p>
                </div>
              )}

              {/* Nút hủy — chỉ hiện khi không đang submit */}
              {!isSubmitting && (
                <div className="flex gap-3 mt-3 border-t border-gray-100 pt-3.5">
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="flex-1 bg-white text-slate-500 border border-slate-300 rounded-lg py-2.5 px-3.5 text-[13px] font-semibold cursor-pointer active:opacity-80"
                  >
                    ← Hủy & Quay lại
                  </button>
                </div>
              )}
            </div>
          )}

          {/* POPUP XÁC NHẬN HỦY */}
          {showCancelModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4">
              <div className="bg-white rounded-2xl w-full max-w-[350px] p-[22px] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]">
                <div className="text-[15px] font-bold text-slate-800 mb-1.5 text-center">
                  Xác nhận hủy giao dịch?
                </div>
                <p className="text-[13px] text-slate-500 text-center mb-4 leading-relaxed">
                  Hành động này sẽ hủy bỏ và đánh dấu thất bại cho đơn hàng{' '}
                  <span className="font-mono font-semibold">{currentOrderId}</span>.
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

          {/* TOAST kết quả từ tab /result (thay vì reload) */}
          {resultToast && (
            <div
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-semibold"
              style={{
                background: resultToast.status === 'success' ? '#16a34a' : '#dc2626',
                color: '#fff',
                animation: 'fadein 0.2s ease',
              }}
            >
              {resultToast.status === 'success' ? '✅' : '❌'}
              {resultToast.status === 'success' ? 'Thanh toán thành công' : 'Thanh toán thất bại'} — {resultToast.orderId}
            </div>
          )}

          {/* TOAST link nhanh */}
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