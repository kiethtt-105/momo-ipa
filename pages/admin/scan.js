import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')
const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000]

export default function ScanPage() {
  const router = useRouter()

  // Auth
  const [authed, setAuthed]     = useState(null)
  const [password, setPassword] = useState('')
  const [pwError, setPwError]   = useState(false)

  // Scanner
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const rafRef      = useRef(null)
  const jsQRRef     = useRef(null)

  const [scanning,    setScanning]    = useState(false)
  const [paymentCode, setPaymentCode] = useState('')
  const [manualCode,  setManualCode]  = useState('')
  const [cameraError, setCameraError] = useState('')
  const [jsqrLoaded,  setJsqrLoaded]  = useState(false)

  // Order
  const [amount,    setAmount]    = useState('')
  const [orderInfo, setOrderInfo] = useState('Thanh toán tại quầy')

  // Result
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)

  // ── Load jsQR from CDN ──────────────────────────────────────
  useEffect(() => {
    if (window.jsQR) { jsQRRef.current = window.jsQR; setJsqrLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    script.onload = () => { jsQRRef.current = window.jsQR; setJsqrLoaded(true) }
    script.onerror = () => setCameraError('Không tải được thư viện quét QR. Kiểm tra kết nối mạng.')
    document.head.appendChild(script)
  }, [])

  // ── Auth check ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

  // ── Camera ──────────────────────────────────────────────────
  async function startCamera() {
    setCameraError('')
    if (!jsqrLoaded) {
      setCameraError('Thư viện QR chưa sẵn sàng, thử lại sau 1 giây.')
      return
    }
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      video.setAttribute('playsinline', true)
      await video.play()
      setScanning(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      console.error(err)
      if (err.name === 'NotAllowedError') {
        setCameraError('Bị từ chối quyền camera. Vào Settings → trình duyệt → cho phép Camera.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('Không tìm thấy camera trên thiết bị này.')
      } else {
        setCameraError(`Lỗi camera: ${err.message}`)
      }
    }
  }

  function tick() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== 4) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQRRef.current?.(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })
    if (code?.data) {
      handleDetected(code.data)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleDetected(raw) {
    stopCamera()
    setPaymentCode(raw)
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  useEffect(() => () => stopCamera(), [])

  // ── Submit ──────────────────────────────────────────────────
  async function submit() {
    const code = paymentCode || manualCode.trim()
    const amt  = parseInt(amount)
    if (!code)              return alert('Chưa có mã thanh toán')
    if (!amt || amt < 1000) return alert('Số tiền tối thiểu 1,000 ₫')
    if (amt > 5_000_000)    return alert('Số tiền tối đa 5,000,000 ₫')

    setLoading(true)
    setResult(null)
    const orderId = `POS${Date.now()}`
    try {
      const res = await fetch('/api/momo/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount: amt, orderInfo, paymentCode: code }),
      })
      const data = await res.json()
      setResult({ success: data.resultCode === 0, data })
    } catch {
      setResult({ success: false, data: { message: 'Lỗi kết nối server' } })
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setResult(null); setPaymentCode(''); setManualCode(''); setAmount('')
  }

  // ── Render: loading auth ────────────────────────────────────
  if (authed === null) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff8fb' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <div style={{ width:10, height:10, borderRadius:'50%', background:'#ae0070', animation:'pulse 0.8s infinite' }} />
    </div>
  )

  // ── Render: login ───────────────────────────────────────────
  if (!authed) return (
    <>
      <Head><title>Admin · Đăng nhập</title></Head>
      <style>{BASE_CSS}</style>
      <div style={S.bg}>
        <div style={S.loginCard}>
          <img src="/Main.png" alt="" style={{ width:48, height:48, borderRadius:12, marginBottom:16 }} />
          <h1 style={{ fontSize:20, fontWeight:800, color:'#111', marginBottom:6 }}>Quản trị viên</h1>
          <p style={{ fontSize:13, color:'#6b7280', marginBottom:24 }}>MoMo POS · Quét mã thanh toán</p>
          <input
            type="password" placeholder="Mật khẩu" value={password} autoFocus
            onChange={e => { setPassword(e.target.value); setPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ ...S.input, borderColor: pwError ? '#dc2626' : 'rgba(174,0,112,0.2)', marginBottom:8 }}
          />
          {pwError && <p style={{ color:'#dc2626', fontSize:13, marginBottom:10 }}>⚠ Mật khẩu không đúng</p>}
          <button onClick={login} style={S.btnPrimary}>Đăng nhập</button>
        </div>
      </div>
    </>
  )

  async function login() {
    setPwError(false)
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) { setAuthed(true); setPassword('') }
    else { setPwError(true); setPassword('') }
  }

  // ── Render: result ──────────────────────────────────────────
  if (result) return (
    <>
      <Head><title>Kết quả thanh toán</title></Head>
      <style>{BASE_CSS}</style>
      <div style={S.bg}>
        <div style={S.card}>
          <div style={{ fontSize:52, marginBottom:12 }}>{result.success ? '✅' : '❌'}</div>
          <h2 style={{ fontSize:22, fontWeight:800, color: result.success ? '#16a34a' : '#dc2626', marginBottom:8 }}>
            {result.success ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
          </h2>
          {result.success && (
            <div style={{ fontSize:28, fontWeight:800, color:'#ae0070', marginBottom:8 }}>{fmt(amount)} ₫</div>
          )}
          <p style={{ fontSize:13, color:'#6b7280', marginBottom:4 }}>{result.data.message}</p>
          {result.data.transId && (
            <p style={{ fontSize:12, fontFamily:'monospace', color:'#374151', marginBottom:4 }}>Mã GD: {result.data.transId}</p>
          )}
          {!result.success && result.data.resultCode !== undefined && (
            <p style={{ fontSize:12, color:'#dc2626' }}>Result code: {result.data.resultCode}</p>
          )}
          <div style={{ display:'flex', gap:10, marginTop:24, width:'100%' }}>
            <button onClick={reset} style={S.btnPrimary}>Thu tiếp</button>
            <button onClick={() => router.push('/admin')} style={S.btnSecondary}>Về Admin</button>
          </div>
        </div>
      </div>
    </>
  )

  // ── Render: main ────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Admin · Quét QR MoMo</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <style>{BASE_CSS}</style>
      <div style={S.bg}>

        {/* Header */}
        <div style={S.header}>
          <button onClick={() => router.push('/admin')} style={S.backBtn}>←</button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <img src="/Main.png" alt="" style={{ width:26, height:26, borderRadius:6 }} />
            <span style={{ fontWeight:800, color:'#ae0070', fontSize:16 }}>Quét QR · MoMo POS</span>
          </div>
          <div style={{ width:32 }} />
        </div>

        <div style={S.content}>

          {/* Camera section */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>📷 Mã thanh toán</h3>

            {paymentCode ? (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
                <p style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Đã quét thành công</p>
                <div style={{
                  background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10,
                  padding:'10px 14px', fontFamily:'monospace', fontSize:12,
                  color:'#15803d', wordBreak:'break-all', marginBottom:12,
                }}>{paymentCode}</div>
                <button onClick={() => { setPaymentCode(''); setManualCode('') }} style={{ ...S.btnSecondary, width:'auto', padding:'8px 20px' }}>
                  Quét lại
                </button>
              </div>
            ) : scanning ? (
              <div>
                {/* Video + canvas overlay */}
                <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'#000', marginBottom:10 }}>
                  <video ref={videoRef} playsInline muted style={{ width:'100%', display:'block', maxHeight:300, objectFit:'cover' }} />
                  {/* Hidden canvas for jsQR */}
                  <canvas ref={canvasRef} style={{ display:'none' }} />
                  {/* Scan overlay */}
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                    <div style={{ position:'relative', width:'60%', paddingTop:'60%' }}>
                      {[
                        { top:0, left:0, borderTop:'3px solid #ae0070', borderLeft:'3px solid #ae0070' },
                        { top:0, right:0, borderTop:'3px solid #ae0070', borderRight:'3px solid #ae0070' },
                        { bottom:0, left:0, borderBottom:'3px solid #ae0070', borderLeft:'3px solid #ae0070' },
                        { bottom:0, right:0, borderBottom:'3px solid #ae0070', borderRight:'3px solid #ae0070' },
                      ].map((s, i) => (
                        <div key={i} style={{ position:'absolute', width:24, height:24, borderRadius:2, ...s }} />
                      ))}
                      <div className="scan-line" />
                    </div>
                  </div>
                </div>
                {cameraError && (
                  <p style={{ fontSize:12, color:'#d97706', background:'#fef3c7', padding:'8px 12px', borderRadius:8, marginBottom:10 }}>
                    ⚠ {cameraError}
                  </p>
                )}
                <button onClick={stopCamera} style={{ ...S.btnSecondary, width:'auto', padding:'8px 20px' }}>Dừng camera</button>
              </div>
            ) : (
              <div style={{ textAlign:'center' }}>
                <div style={{
                  width:72, height:72, borderRadius:18, background:'#fff0f7',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:32, margin:'0 auto 14px',
                }}>📱</div>
                <p style={{ fontSize:13, color:'#6b7280', marginBottom:16, lineHeight:1.6 }}>
                  Khách mở app MoMo → chọn <b>Mã thanh toán</b><br/>Admin dùng camera quét màn hình khách
                </p>
                {cameraError && (
                  <p style={{ fontSize:12, color:'#dc2626', background:'#fff5f5', padding:'8px 12px', borderRadius:8, marginBottom:12 }}>
                    ⚠ {cameraError}
                  </p>
                )}
                <button onClick={startCamera} style={S.btnPrimary} disabled={!jsqrLoaded}>
                  {jsqrLoaded ? '📷 Mở camera quét' : 'Đang tải...'}
                </button>
              </div>
            )}

            {/* Manual input */}
            {!paymentCode && (
              <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid #f3f4f6' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#9ca3af', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>
                  Hoặc nhập mã thủ công
                </p>
                <input
                  placeholder="MM561918531775222861"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  style={{ ...S.input, fontFamily:'monospace', fontSize:13 }}
                />
              </div>
            )}
          </div>

          {/* Amount */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>💰 Số tiền</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
              {QUICK_AMOUNTS.map(a => (
                <button key={a} onClick={() => setAmount(String(a))} style={{
                  padding:'9px 4px', borderRadius:10, border:'none',
                  fontSize:13, fontWeight:700, cursor:'pointer',
                  background: amount === String(a) ? '#ae0070' : '#f9f0f5',
                  color:      amount === String(a) ? '#fff'    : '#ae0070',
                }}>{fmt(a)}</button>
              ))}
            </div>
            <input
              type="number" placeholder="Nhập số tiền khác..."
              value={amount} onChange={e => setAmount(e.target.value)}
              style={S.input} min={1000} max={5000000}
            />
            {amount && parseInt(amount) >= 1000 && (
              <p style={{ fontSize:13, color:'#ae0070', fontWeight:700, marginTop:4 }}>= {fmt(amount)} ₫</p>
            )}
          </div>

          {/* Order info */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>📝 Nội dung</h3>
            <input
              placeholder="Nội dung đơn hàng"
              value={orderInfo} onChange={e => setOrderInfo(e.target.value)}
              style={S.input}
            />
          </div>

          {/* Submit */}
          <button
            onClick={submit}
            disabled={loading || (!paymentCode && !manualCode.trim()) || !amount}
            style={{
              ...S.btnPrimary, padding:'15px', fontSize:16,
              opacity: (loading || (!paymentCode && !manualCode.trim()) || !amount) ? 0.45 : 1,
              cursor:  (loading || (!paymentCode && !manualCode.trim()) || !amount) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span className="spinner" /> Đang xử lý...
                </span>
              : `Thu ${amount ? fmt(amount) + ' ₫' : 'tiền'}`
            }
          </button>

          <button onClick={() => router.push('/admin')} style={{ ...S.btnSecondary, marginTop:4 }}>
            ← Về trang Admin
          </button>
        </div>
      </div>
    </>
  )
}

const S = {
  bg: {
    minHeight:'100vh',
    background:'linear-gradient(135deg,#fff0f7 0%,#fce4f0 50%,#f5edf2 100%)',
    fontFamily:"'Inter',sans-serif",
  },
  header: {
    position:'sticky', top:0, zIndex:100,
    background:'rgba(255,255,255,0.92)',
    backdropFilter:'blur(20px)',
    borderBottom:'1px solid rgba(174,0,112,0.1)',
    padding:'12px 16px',
    display:'flex', alignItems:'center', justifyContent:'space-between',
  },
  backBtn: {
    width:34, height:34, borderRadius:8,
    border:'1px solid rgba(174,0,112,0.15)',
    background:'white', cursor:'pointer',
    fontSize:18, color:'#ae0070',
    display:'flex', alignItems:'center', justifyContent:'center',
  },
  content: {
    maxWidth:480, margin:'0 auto',
    padding:'16px 16px 40px',
    display:'flex', flexDirection:'column', gap:12,
  },
  card: {
    background:'rgba(255,255,255,0.96)',
    borderRadius:16, padding:'18px 16px',
    boxShadow:'0 2px 16px rgba(174,0,112,0.06)',
    border:'1px solid rgba(255,255,255,0.8)',
  },
  loginCard: {
    background:'white', borderRadius:20, padding:'36px 28px',
    width:'100%', maxWidth:360,
    boxShadow:'0 20px 60px rgba(174,0,112,0.12)',
    display:'flex', flexDirection:'column', alignItems:'center',
    position:'absolute', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
  },
  sectionTitle: { fontSize:13, fontWeight:700, color:'#374151', marginBottom:14 },
  input: {
    width:'100%', padding:'11px 14px',
    border:'1.5px solid rgba(174,0,112,0.15)',
    borderRadius:10, fontSize:14,
    background:'rgba(245,237,242,0.4)', color:'#111',
    marginBottom:4,
  },
  btnPrimary: {
    background:'#ae0070', color:'#fff',
    border:'none', borderRadius:12,
    padding:'12px 24px', fontSize:14, fontWeight:700,
    cursor:'pointer', width:'100%',
    boxShadow:'0 4px 16px rgba(174,0,112,0.25)',
  },
  btnSecondary: {
    background:'white', color:'#374151',
    border:'1px solid rgba(0,0,0,0.1)', borderRadius:12,
    padding:'11px 24px', fontSize:14, fontWeight:600,
    cursor:'pointer', width:'100%',
  },
}

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
  input { outline: none; }
  button { transition: opacity 0.15s; }
  button:active { opacity: 0.8; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes scan-line { 0%,100% { top: 5%; } 50% { top: 90%; } }
  .spinner {
    display: inline-block; width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  .scan-line {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, #ae0070, transparent);
    animation: scan-line 2s ease-in-out infinite;
  }
`