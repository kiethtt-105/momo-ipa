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

  const [authed,   setAuthed]   = useState(null)
  const [password, setPassword] = useState('')
  const [pwError,  setPwError]  = useState(false)

  const [step, setStep] = useState('amount')

  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const submitting = useRef(false)

  const [ready,    setReady]    = useState(false)
  const [scanning, setScanning] = useState(false)
  const [camError, setCamError] = useState('')

  const [amount,    setAmount]    = useState('')
  const [orderInfo, setOrderInfo] = useState('')
  const [result,    setResult]    = useState(null)

  const [manualCode, setManualCode] = useState('')
  const [manualErr,  setManualErr]  = useState('')

  const [currentOrderId, setCurrentOrderId] = useState(null)

  const { amount: urlAmount, orderInfo: urlOrderInfo, quick } = router.query
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Load jsQR
  useEffect(() => {
    if (window.jsQR) { setReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload  = () => setReady(true)
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

  // Load amount và orderInfo từ query params
  useEffect(() => {
    if (urlAmount) {
      setAmount(urlAmount)
    }
    if (urlOrderInfo) {
      setOrderInfo(urlOrderInfo)
    }
    if (quick === 'true' && urlAmount && !currentOrderId && !submitting.current) {
          const generatedId = `POS${Date.now()}`;
          setCurrentOrderId(generatedId);
          setStep('scan');

          // Tự động gọi API tạo log PENDING ngầm luôn
          fetch('/api/momo/save-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              orderId: generatedId, 
              amount: parseInt(urlAmount), 
              orderInfo: urlOrderInfo || generatedId
            }),
          }).catch(e => console.error("Lỗi đơn quét nhanh:", e));
        }
  }, [urlAmount, urlOrderInfo, quick])

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
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return }
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
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
    const orderId = currentOrderId || `POS${Date.now()}`

    try {
      const res = await fetch('/api/momo/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount: amt, orderInfo, paymentCode: code }),
      })
      const data = await res.json()
      setResult({ success: data.resultCode === 0, data, amount: amt, orderId })
    } catch {
      setResult({ success: false, data: { message: 'Lỗi kết nối server' }, amount: amt, orderId })
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
        setStep('scan')
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
    submitting.current = true;
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
      });
    } catch (e) {
      console.error(e);
    } finally {
      submitting.current = false;
      setAmount('');
      setOrderInfo('');
      setCurrentOrderId(null);
      setManualCode('');
      setManualErr('');
      setStep('amount');
    }
  }

  if (authed === null) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff8fb' }}>
        <style>{`@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#ae0070', animation:'p .8s infinite' }} />
      </div>
    )
  }

  if (!authed) {
    async function login() {
      setPwError(false)
      const res = await fetch('/api/admin/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password }),
      })
      if (res.ok) { setAuthed(true); setPassword('') }
      else { setPwError(true); setPassword('') }
    }
    return (
      <>
        <Head><title>Admin · Đăng nhập</title></Head>
        <style>{CSS}</style>
        <div style={{ ...S.bg, position:'relative' }}>
          <div style={S.loginCard}>
            <img src="/Main.png" alt="" style={{ width:48, height:48, borderRadius:12, marginBottom:16 }} />
            <h1 style={{ fontSize:20, fontWeight:800, color:'#111', marginBottom:6 }}>Quản trị viên</h1>
            <p style={{ fontSize:13, color:'#6b7280', marginBottom:24 }}>MoMo POS · Thu tiền tại quầy</p>
            <input type="password" placeholder="Mật khẩu" value={password} autoFocus
              onChange={e => { setPassword(e.target.value); setPwError(false) }}
              onKeyDown={e => e.key === 'Enter' && login()}
              style={{ ...S.input, borderColor: pwError ? '#dc2626' : 'rgba(174,0,112,0.2)', marginBottom:8 }}
            />
            {pwError && <p style={{ color:'#dc2626', fontSize:13, marginBottom:10 }}>⚠ Sai mật khẩu</p>}
            <button onClick={login} style={S.btnPrimary}>Đăng nhập</button>
          </div>
        </div>
      </>
    )
  }

  if (result) {
    const isSuccess = result.success;

    return (
      <>
        <Head><title>Kết quả thanh toán</title></Head>
        <style>{CSS}</style>
        <div style={S.bg}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:20 }}>
            <div style={{ ...S.card, maxWidth:420, width:'100%', textAlign:'center', padding:'40px 24px' }}>
              <div style={{ fontSize:56, marginBottom:12 }}>{isSuccess ? '✅' : '❌'}</div>
              
              <h2 style={{ fontSize:22, fontWeight:800, color: isSuccess ? '#16a34a' : '#dc2626', marginBottom:8 }}>
                {isSuccess ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
              </h2>
              
              <div style={{ fontSize:28, fontWeight:800, color:'#ae0070', marginBottom:8 }}>
                {fmt(result.amount)} ₫
              </div>

              <p style={{ fontSize:13, color:'#6b7280', marginBottom:4 }}>{result.data.message}</p>
              {result.data.transId && (
                <p style={{ fontSize:12, fontFamily:'monospace', color:'#374151', marginTop:4 }}>
                  Mã GD: {result.data.transId}
                </p>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:32 }}>
                {!isSuccess && (
                  <button 
                    onClick={() => {
                      setResult(null);
                      setManualCode('');
                      setManualErr('');
                      submitting.current = false;
                    }}
                    style={{ ...S.btnPrimary, background: '#f59e0b' }}
                  >
                    🔄 Thử thanh toán lại
                  </button>
                )}

                <button onClick={resetAll} style={S.btnPrimary}>
                  {isSuccess ? 'Giao Dịch Mới' : 'Nhập số tiền mới'}
                </button>

                <button onClick={() => router.push('/admin')} style={S.btnSecondary}>
                  ← Về Admin
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const stepIdx = step === 'amount' ? 0 : 1
  const STEPS   = ['Thông tin ', 'Scan QR']

  return (
    <>
      <Head>
        <title>POS · MoMo IPA</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <style>{CSS}</style>
      <div style={S.bg}>

        {/* Header */}
        <div style={S.header}>
          <button
            onClick={() => {
              // Nếu đang ở màn hình scan, chặn lại để hiện popup hủy giao dịch
              if (step === 'scan') {
                setShowCancelModal(true);
              } else {
                router.push('/admin');
              }
            }}
            style={S.backBtn}
          >←</button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <img src="/Main.png" alt="" style={{ width:26, height:26, borderRadius:6 }} />
            <span style={{ fontWeight:800, color:'#ae0070', fontSize:16 }}>MoMo POS</span>
          </div>
          <div style={{ width:34 }} />
        </div>

        {/* Step bar */}
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'14px 24px 0', gap:0, maxWidth:480, margin:'0 auto' }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', flex: i < STEPS.length-1 ? 1 : 'none' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{
                  width:28, height:28, borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:800, transition:'all .3s',
                  background: i <= stepIdx ? '#ae0070' : '#e5e7eb',
                  color:      i <= stepIdx ? '#fff'    : '#9ca3af',
                }}>{i < stepIdx ? '✓' : i + 1}</div>
                <span style={{ fontSize:10, fontWeight:600, whiteSpace:'nowrap', color: i <= stepIdx ? '#ae0070' : '#9ca3af' }}>{label}</span>
              </div>
              {i < STEPS.length-1 && (
                <div style={{ flex:1, height:2, margin:'0 8px', marginBottom:18, transition:'all .3s', background: i < stepIdx ? '#ae0070' : '#e5e7eb' }} />
              )}
            </div>
          ))}
        </div>

        <div style={S.content}>

          {/* STEP 1: AMOUNT */}
          {step === 'amount' && (
            <div style={S.card}>
              <h3 style={S.sectionTitle}>💰 Nhập số tiền </h3>
              <input
                type="number" placeholder="Nhập số tiền..."
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={handleEnterKey}
                style={S.input} min={1000} max={5000000} autoFocus 
                step={1000}
                disabled={quick === 'true'}
              />

              <div style={{ paddingTop:12, borderTop:'1px solid #f3f4f6', marginBottom:14 }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Nội dung thanh toán</p>
                <input
                  placeholder="Nhập mã đơn hàng "
                  value={orderInfo} onChange={e => setOrderInfo(e.target.value)}
                  onKeyDown={handleEnterKey}
                  style={S.input}
                  disabled={quick === 'true'}
                />
              </div>
              <button
                onClick={async () => {
                  const generatedId = `POS${Date.now()}`;
                  setCurrentOrderId(generatedId);
                  submitting.current = true; 
                  try {
                    await fetch('/api/momo/save-pending', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        orderId: generatedId, 
                        amount: parseInt(amount), 
                        orderInfo: orderInfo || generatedId
                      }),
                    });
                  } catch (e) {
                    console.error("Lỗi tạo log đơn hàng nháp:", e);
                  } finally {
                    submitting.current = false;
                    setStep('scan');
                  }
                }}
                disabled={!amount || parseInt(amount) < 1000 || submitting.current}
                style={{ ...S.btnPrimary, opacity: (!amount || parseInt(amount) < 1000) ? 0.4 : 1 }}
              >
                {submitting.current ? 'Đang tạo đơn...' : 'Xác nhận  →'}
              </button>
            </div>
          )}

          {/* STEP 2: SCAN */}
          {step === 'scan' && (
            <div style={S.card}>
              <h3 style={{ ...S.sectionTitle, marginBottom:12 }}>📷 Quy trình nhận mã thanh toán MoMo</h3>

              {/* TÓM TẮT ĐƠN HÀNG ĐẦY ĐỦ */}
              {(amount || orderInfo || currentOrderId) && (
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:'16px', marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:12, textTransform:'uppercase' }}>
                    THÔNG TIN ĐƠN HÀNG TẠI QUẦY
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
                    <span style={{ color:'#475569', fontSize: 13 }}>Mã đơn hàng (Log ID):</span>
                    <span style={{ fontWeight:700, fontFamily:'monospace', color:'#111827', background:'#e2e8f0', padding:'2px 6px', borderRadius:4 }}>
                      {currentOrderId || 'Chưa khởi tạo'}
                    </span>
                  </div>

                  <div style={{ display:'flex', justifyBounding:'space-between', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{color:'#475569'}}>Số tiền thanh toán</span>
                    <span style={{ fontSize:28, fontWeight:800, color:'#ae0070' }}>{fmt(amount)} ₫</span>
                  </div>

                  {orderInfo && (
                    <>
                      <div style={{ height:1, background:'#e2e8f0', margin:'12px 0' }} />
                      <div>
                        <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Nội dung thanh toán</div>
                        <div style={{ fontSize:15, color:'#111827', fontWeight:500 }}>{orderInfo}</div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Input mã thủ công & Súng Quét */}
              <div style={{ marginBottom: 16, padding:'14px', background:'#f9f0f5', borderRadius:10, border:'1px solid rgba(174,0,112,0.15)' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
                  MÃ THANH TOÁN MOMO (DÙNG SÚNG QUÉT / NHẬP TAY)
                </p>
                <input
                  autoFocus
                  placeholder="Bắn mã QR hoặc điền 18 số vào đây..."
                  value={manualCode}
                  onChange={e => { setManualCode(e.target.value); setManualErr('') }}
                  onKeyDown={handleManualCodeKey}
                  style={{ ...S.input, marginBottom: manualErr ? 4 : 8, background: '#fff' }}
                  disabled={submitting.current}
                />
                {manualErr && <p style={{ fontSize:12, color:'#dc2626', marginBottom:8 }}>⚠ {manualErr}</p>}
                {/* Chỉ hiện khi server bị đơ hoặc lỗi kết nối mạng */}
                {isServerErr && !submitting.current && (
                  <button
                    onClick={submitManualCode}
                    style={{
                      background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      width: '100%', marginTop: 8, transition: 'background .15s',
                      boxShadow: '0 4px 12px rgba(245,158,11,0.2)'
                    }}
                  >
                    ⚡ Gửi lại dữ liệu (Kiểm tra giao dịch)
                  </button>
                )}
                {/* Nút xác nhận thanh toán nhỏ, gọn gàng đặt ngay dưới chân ô input */}
                <button
                  onClick={submitManualCode}
                  disabled={!manualCode.trim() || submitting.current}
                  style={{
                    background: '#ae0070', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    width: '100%', marginTop: 4, transition: 'background .15s'
                  }}
                >
                  {submitting.current ? 'Đang xử lý...' : '✓ Xác nhận thanh toán'}
                </button>
              </div>

              {/* Camera chạy ngầm không gây vỡ/xấu giao diện */}
              {!submitting.current && (
                <>
                  {scanning ? (
                    <div style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                      <video ref={setVideoRef} playsInline muted style={{ width: '100%' }} />
                      <canvas ref={canvasRef} />
                    </div>
                  ) : null}

                  <div style={{ textAlign: 'center', padding: '4px 0', marginBottom: 12 }}>
                    {scanning ? (
                      <div style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 500 }}>
                        <span style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%', display: 'inline-block', animation: 'p .8s infinite' }} />
                        Hệ thống nhận diện tự động đang chạy ngầm...
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setCamError(''); setScanning(true) }}
                        style={{ ...S.btnSecondary, width: 'auto', padding: '6px 14px', fontSize: 12, borderColor: 'rgba(174,0,112,0.2)', color: '#ae0070' }} 
                        disabled={!ready}
                      >
                        📷 Kích hoạt quét Camera dự phòng
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* CỤM NÚT DIỀU HƯỚNG DƯỚI ĐÁY ĐƯỢC THU NHỎ GỌN GÀNG HÀNG NGANG */}
              {!submitting.current && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    style={{
                      background: '#fff', color: '#64748b', border: '1px solid #cbd5e1',
                      borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', flex: 1
                    }}
                  >
                    ← Hủy & Quay lại
                  </button>

                  <button
                    onClick={() => { setManualCode(''); setManualErr(''); }}
                    style={{
                      background: '#fff', color: '#ae0070', border: '1px solid rgba(174,0,112,0.25)',
                      borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', flex: 1
                    }}
                  >
                    🔄 Xóa nhập lại
                  </button>
                </div>
              )}

              {/* POPUP MODAL XÁC NHẬN HỦY GIAO DỊCH CHẶN TREO ĐƠN */}
              {showCancelModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
                  <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 350, padding: 22, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6, textAlign: 'center' }}>
                      Xác nhận hủy giao dịch?
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 18, lineHeight: 1.5 }}>
                      Hành động này sẽ hủy bỏ và đánh dấu thất bại cho đơn hàng <span style={{fontFamily:'monospace', fontWeight:600}}>{currentOrderId}</span>.
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => setShowCancelModal(false)}
                        style={{ flex: 1, padding: '9px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Tiếp tục chờ
                      </button>
                      <button
                        onClick={async () => {
                          setShowCancelModal(false);
                          stopCamera();
                          await triggerCancelOrderBackend();
                        }}
                        style={{ flex: 1, padding: '9px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Đồng ý hủy đơn
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Trạng thái đang xử lý thanh toán */}
              {submitting.current && (
                <div style={{ padding: '30px 20px', textAlign: 'center', background: '#f9f0f5', borderRadius: 12, marginTop: 12 }}>
                  <div className="spinner" style={{ width:36, height:36, borderWidth:4, margin:'0 auto 12px' }} />
                  <p style={{ fontSize:15, fontWeight:700, color:'#ae0070' }}>Đang xử lý thanh toán...</p>
                  <p style={{ fontSize:13, color:'#6b7280' }}>Vui lòng không đóng trang</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                {result && !result.success && (
                  <button 
                    onClick={() => {
                      setResult(null);
                      setManualCode('');
                      setManualErr('');
                      submitting.current = false;
                      setScanning(true);
                    }}
                    style={{ ...S.btnSecondary, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, padding: '10px' }}
                  >
                    🔄 Thử lại
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

const S = {
  bg:        { minHeight:'100vh', background:'linear-gradient(135deg,#fff0f7 0%,#fce4f0 50%,#f5edf2 100%)', fontFamily:"'Inter',sans-serif" },
  header:    { position:'sticky', top:0, zIndex:100, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(174,0,112,0.1)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  backBtn:   { width:34, height:34, borderRadius:8, border:'1px solid rgba(174,0,112,0.15)', background:'white', cursor:'pointer', fontSize:18, color:'#ae0070', display:'flex', alignItems:'center', justifyContent:'center' },
  content:   { maxWidth:480, margin:'0 auto', padding:'16px 16px 40px', display:'flex', flexDirection:'column', gap:12 },
  card:      { background:'rgba(255,255,255,0.96)', borderRadius:16, padding:'18px 16px', boxShadow:'0 2px 16px rgba(174,0,112,0.06)', border:'1px solid rgba(255,255,255,0.8)' },
  loginCard: { background:'white', borderRadius:20, padding:'36px 28px', width:'100%', maxWidth:360, boxShadow:'0 20px 60px rgba(174,0,112,0.12)', display:'flex', flexDirection:'column', alignItems:'center', position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)' },
  sectionTitle: { fontSize:13, fontWeight:700, color:'#374151', marginBottom:14 },
  input:     { width:'100%', padding:'11px 14px', border:'1.5px solid rgba(174,0,112,0.15)', borderRadius:10, fontSize:14, background:'rgba(245,237,242,0.4)', color:'#111', marginBottom:8 },
  btnPrimary:   { background:'#ae0070', color:'#fff', border:'none', borderRadius:12, padding:'13px 24px', fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', boxShadow:'0 4px 16px rgba(174,0,112,0.25)' },
  btnSecondary: { background:'white', color:'#374151', border:'1px solid rgba(0,0,0,0.1)', borderRadius:12, padding:'12px 24px', fontSize:14, fontWeight:600, cursor:'pointer', width:'100%' },
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; font-family:'Inter',sans-serif; }
  input { outline:none; }
  button { transition:opacity .15s; }
  button:active { opacity:.8; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .spinner { display:inline-block; width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
`