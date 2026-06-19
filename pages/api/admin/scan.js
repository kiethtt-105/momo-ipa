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
  const streamRef   = useRef(null)
  const detectorRef = useRef(null)
  const rafRef      = useRef(null)

  const [scanning,     setScanning]     = useState(false)
  const [paymentCode,  setPaymentCode]  = useState('')
  const [manualCode,   setManualCode]   = useState('')
  const [cameraError,  setCameraError]  = useState('')

  // Order form
  const [amount,    setAmount]    = useState('')
  const [orderInfo, setOrderInfo] = useState('Thanh toán tại quầy')

  // Result
  const [loading, setLoading]   = useState(false)
  const [result,  setResult]    = useState(null) // { success, data }

  // ── AUTH CHECK ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

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

  // ── CAMERA ─────────────────────────────────────────────────
  async function startCamera() {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // BarcodeDetector API (Chrome 83+, Edge, Android)
      if ('BarcodeDetector' in window) {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] })
        setScanning(true)
        scanLoop()
      } else {
        setCameraError('Trình duyệt không hỗ trợ quét mã tự động. Nhập mã thủ công bên dưới.')
        setScanning(true) // still show camera for manual reference
      }
    } catch (err) {
      setCameraError('Không thể truy cập camera. Kiểm tra quyền trình duyệt hoặc nhập mã thủ công.')
    }
  }

  async function scanLoop() {
    if (!videoRef.current || !detectorRef.current) return
    try {
      const codes = await detectorRef.current.detect(videoRef.current)
      if (codes.length > 0) {
        const raw = codes[0].rawValue
        handleCodeDetected(raw)
        return // stop loop after detection
      }
    } catch {}
    rafRef.current = requestAnimationFrame(scanLoop)
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  function handleCodeDetected(raw) {
    stopCamera()
    setPaymentCode(raw)
  }

  useEffect(() => () => stopCamera(), [])

  // ── SUBMIT ─────────────────────────────────────────────────
  async function submit() {
    const code = paymentCode || manualCode.trim()
    const amt  = parseInt(amount)

    if (!code)          return alert('Chưa có mã thanh toán')
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
    } catch (err) {
      setResult({ success: false, data: { message: 'Lỗi kết nối server' } })
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setResult(null)
    setPaymentCode('')
    setManualCode('')
    setAmount('')
  }

  // ── RENDER: AUTH CHECK ──────────────────────────────────────
  if (authed === null) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff8fb' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ae0070', animation: 'pulse 0.8s infinite' }} />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  )

  if (!authed) return (
    <>
      <Head><title>Admin · Đăng nhập</title></Head>
      <div style={S.bg}>
        <div style={S.loginCard}>
          <img src="/Main.png" alt="" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 16 }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111', marginBottom: 6 }}>Quản trị viên</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Thanh toán tại quầy · MoMo POS</p>
          <input
            type="password" placeholder="Mật khẩu"
            value={password} autoFocus
            onChange={e => { setPassword(e.target.value); setPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ ...S.input, borderColor: pwError ? '#dc2626' : 'rgba(174,0,112,0.2)' }}
          />
          {pwError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>⚠ Mật khẩu không đúng</p>}
          <button onClick={login} style={S.btnPrimary}>Đăng nhập</button>
        </div>
      </div>
    </>
  )

  // ── RENDER: RESULT ──────────────────────────────────────────
  if (result) return (
    <>
      <Head><title>Kết quả thanh toán</title></Head>
      <div style={S.bg}>
        <div style={S.card}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{result.success ? '✅' : '❌'}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: result.success ? '#16a34a' : '#dc2626', marginBottom: 8 }}>
            {result.success ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
          </h2>
          {result.success && (
            <div style={{ fontSize: 28, fontWeight: 800, color: '#ae0070', marginBottom: 8 }}>
              {fmt(amount)} ₫
            </div>
          )}
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{result.data.message}</p>
          {result.data.transId && (
            <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#374151', marginBottom: 4 }}>
              Mã GD: {result.data.transId}
            </p>
          )}
          {result.data.resultCode !== undefined && !result.success && (
            <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 4 }}>
              Result code: {result.data.resultCode}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button onClick={reset} style={S.btnPrimary}>
              Thu tiếp
            </button>
            <button onClick={() => router.push('/admin')} style={S.btnSecondary}>
              Về Admin
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // ── RENDER: MAIN ────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Admin · Quét QR MoMo</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div style={S.bg}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
          input:focus { outline: none; }
          button:active { opacity: 0.85; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes scan-line {
            0%   { top: 10%; }
            50%  { top: 85%; }
            100% { top: 10%; }
          }
        `}</style>

        {/* Header */}
        <div style={S.header}>
          <button onClick={() => router.push('/admin')} style={S.backBtn}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/Main.png" alt="" style={{ width: 26, height: 26, borderRadius: 6 }} />
            <span style={{ fontWeight: 800, color: '#ae0070', fontSize: 16 }}>Quét QR · MoMo POS</span>
          </div>
          <div style={{ width: 32 }} />
        </div>

        <div style={S.content}>

          {/* ── CAMERA SECTION ── */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>📷 Mã thanh toán</h3>

            {paymentCode ? (
              /* Code detected */
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Đã quét thành công</p>
                <div style={{
                  background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
                  padding: '10px 14px', fontFamily: 'monospace', fontSize: 12,
                  color: '#15803d', wordBreak: 'break-all', marginBottom: 12,
                }}>
                  {paymentCode}
                </div>
                <button onClick={() => { setPaymentCode(''); setManualCode('') }} style={S.btnSecondary}>
                  Quét lại
                </button>
              </div>
            ) : scanning ? (
              /* Camera active */
              <div>
                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 12 }}>
                  <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
                  {/* Scan overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {/* Corner brackets */}
                    {[
                      { top: '20%', left: '20%', borderTop: '3px solid #ae0070', borderLeft: '3px solid #ae0070' },
                      { top: '20%', right: '20%', borderTop: '3px solid #ae0070', borderRight: '3px solid #ae0070' },
                      { bottom: '20%', left: '20%', borderBottom: '3px solid #ae0070', borderLeft: '3px solid #ae0070' },
                      { bottom: '20%', right: '20%', borderBottom: '3px solid #ae0070', borderRight: '3px solid #ae0070' },
                    ].map((s, i) => (
                      <div key={i} style={{ position: 'absolute', width: 24, height: 24, borderRadius: 2, ...s }} />
                    ))}
                    {/* Scan line */}
                    <div style={{
                      position: 'absolute', left: '20%', right: '20%', height: 2,
                      background: 'linear-gradient(90deg, transparent, #ae0070, transparent)',
                      animation: 'scan-line 2s ease-in-out infinite',
                    }} />
                  </div>
                </div>
                {cameraError && (
                  <p style={{ fontSize: 12, color: '#d97706', background: '#fef3c7', padding: '8px 12px', borderRadius: 8, marginBottom: 10 }}>
                    ⚠ {cameraError}
                  </p>
                )}
                <button onClick={stopCamera} style={S.btnSecondary}>Dừng camera</button>
              </div>
            ) : (
              /* Idle */
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 20, background: '#fff0f7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 36, margin: '0 auto 16px',
                }}>📱</div>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                  Yêu cầu khách mở app MoMo → Mã thanh toán, rồi quét màn hình khách
                </p>
                <button onClick={startCamera} style={S.btnPrimary}>
                  Mở camera quét
                </button>
              </div>
            )}

            {/* Manual input */}
            {!paymentCode && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Hoặc nhập mã thủ công
                </p>
                <input
                  placeholder="MM561918531775222861"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  style={{ ...S.input, fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>
            )}
          </div>

          {/* ── AMOUNT SECTION ── */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>💰 Số tiền</h3>

            {/* Quick amounts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  onClick={() => setAmount(String(a))}
                  style={{
                    ...S.quickBtn,
                    background: amount === String(a) ? '#ae0070' : '#f9f0f5',
                    color: amount === String(a) ? '#fff' : '#ae0070',
                  }}
                >
                  {fmt(a)}
                </button>
              ))}
            </div>

            <input
              type="number" placeholder="Nhập số tiền khác..."
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={S.input}
              min={1000} max={5000000}
            />
            {amount && parseInt(amount) >= 1000 && (
              <p style={{ fontSize: 13, color: '#ae0070', fontWeight: 700, marginTop: 4 }}>
                = {fmt(amount)} ₫
              </p>
            )}
          </div>

          {/* ── ORDER INFO ── */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>📝 Nội dung</h3>
            <input
              placeholder="Nội dung đơn hàng"
              value={orderInfo}
              onChange={e => setOrderInfo(e.target.value)}
              style={S.input}
            />
          </div>

          {/* ── SUBMIT ── */}
          <button
            onClick={submit}
            disabled={loading || (!paymentCode && !manualCode.trim()) || !amount}
            style={{
              ...S.btnPrimary,
              width: '100%',
              padding: '16px',
              fontSize: 16,
              opacity: loading || (!paymentCode && !manualCode.trim()) || !amount ? 0.5 : 1,
              cursor: loading || (!paymentCode && !manualCode.trim()) || !amount ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                  Đang xử lý...
                </span>
              : `Thu ${amount ? fmt(amount) + ' ₫' : 'tiền'}`
            }
          </button>

          {/* Back link */}
          <button onClick={() => router.push('/admin')} style={{ ...S.btnSecondary, width: '100%', marginTop: 8 }}>
            ← Về trang Admin
          </button>

        </div>
      </div>
    </>
  )
}

// ── STYLES ──────────────────────────────────────────────────
const S = {
  bg: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #fff0f7 0%, #fce4f0 50%, #f5edf2 100%)',
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(174,0,112,0.1)',
    padding: '12px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 8,
    border: '1px solid rgba(174,0,112,0.15)',
    background: 'white', cursor: 'pointer',
    fontSize: 16, color: '#ae0070',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  content: {
    maxWidth: 480, margin: '0 auto',
    padding: '16px 16px 32px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  card: {
    background: 'rgba(255,255,255,0.95)',
    borderRadius: 16, padding: '18px 16px',
    boxShadow: '0 2px 16px rgba(174,0,112,0.06)',
    border: '1px solid rgba(255,255,255,0.8)',
  },
  loginCard: {
    background: 'white', borderRadius: 20, padding: '36px 28px',
    width: '100%', maxWidth: 380,
    boxShadow: '0 20px 60px rgba(174,0,112,0.1)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', zIndex: 10,
    // center in bg
    margin: 'auto',
    position: 'absolute',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: '#374151',
    marginBottom: 14,
  },
  input: {
    width: '100%', padding: '11px 14px',
    border: '1.5px solid rgba(174,0,112,0.15)',
    borderRadius: 10, fontSize: 14,
    background: 'rgba(245,237,242,0.4)', color: '#111',
    transition: 'all 0.2s',
    marginBottom: 4,
  },
  quickBtn: {
    padding: '9px 4px', borderRadius: 10, border: 'none',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  btnPrimary: {
    background: '#ae0070', color: '#fff',
    border: 'none', borderRadius: 12,
    padding: '12px 24px', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', width: '100%',
    boxShadow: '0 4px 16px rgba(174,0,112,0.25)',
  },
  btnSecondary: {
    background: 'white', color: '#374151',
    border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12,
    padding: '11px 24px', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', width: '100%',
  },
}