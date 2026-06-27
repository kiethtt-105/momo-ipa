// pages/index.js
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useEffect, useRef } from 'react'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://kiehtt.vercel.app'

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

function useCountUp(target, duration = 1200) {
  const [val, setVal] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (started.current || target === 0) return
    started.current = true
    const start = performance.now()
    const step = now => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * ease))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return val
}

// ─── Components ──────────────────────────────────────────────────────────────

function Orbs() {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:0, overflow:'hidden', pointerEvents:'none' }} aria-hidden>
      <div style={{ position:'absolute', width:'55vw', height:'55vw', borderRadius:'50%', background:'#ae0070', opacity:.06, top:'-10%', left:'-12%', filter:'blur(60px)', animation:'om1 18s ease-in-out infinite alternate' }} />
      <div style={{ position:'absolute', width:'45vw', height:'45vw', borderRadius:'50%', background:'#ae0070', opacity:.04, bottom:'-8%', right:'-8%', filter:'blur(55px)', animation:'om2 22s ease-in-out infinite alternate' }} />
      <div style={{ position:'absolute', width:'30vw', height:'30vw', borderRadius:'50%', background:'#dfb2ea', opacity:.07, top:'35%', left:'60%', filter:'blur(50px)', animation:'om3 26s ease-in-out infinite alternate' }} />
    </div>
  )
}

function StatBadge({ label, value, prefix = '', suffix = '' }) {
  const count = useCountUp(value)
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:28, fontWeight:900, color:'#ae0070', letterSpacing:'-1px', lineHeight:1 }}>
        {prefix}{fmt(count)}{suffix}
      </div>
      <div style={{ fontSize:11, fontWeight:700, color:'#9b4470', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
    </div>
  )
}

function MethodCard({ icon, title, desc, tag, onClick, primary }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display:'flex', flexDirection:'column', alignItems:'flex-start', gap:14,
        width:'100%', padding:'24px 22px', borderRadius:20, border:'none', cursor:'pointer',
        background: primary
          ? (hover ? '#91005d' : '#ae0070')
          : (hover ? '#fff0f7' : 'rgba(255,255,255,0.88)'),
        color: primary ? '#fff' : '#1a0413',
        boxShadow: primary
          ? '0 12px 40px rgba(174,0,112,0.3)'
          : '0 4px 24px rgba(174,0,112,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        border: primary ? 'none' : '1px solid rgba(174,0,112,0.08)',
        transition:'all .18s cubic-bezier(.34,1.2,.64,1)',
        transform: hover ? 'translateY(-2px)' : 'none',
        backdropFilter:'blur(12px)',
        textAlign:'left',
      }}
    >
      <div style={{ fontSize:28 }}>{icon}</div>
      {tag && (
        <span style={{
          fontSize:10, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase',
          padding:'2px 8px', borderRadius:20,
          background: primary ? 'rgba(255,255,255,0.2)' : '#fff0f7',
          color: primary ? '#fff' : '#ae0070',
        }}>{tag}</span>
      )}
      <div>
        <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-.2px', marginBottom:5, color: primary ? '#fff' : '#1a0413' }}>{title}</div>
        <div style={{ fontSize:13, lineHeight:1.6, color: primary ? 'rgba(255,255,255,0.78)' : '#614655', fontWeight:500 }}>{desc}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:700, color: primary ? 'rgba(255,255,255,0.9)' : '#ae0070', marginTop:'auto' }}>
        Bắt đầu
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </button>
  )
}

// ─── Amount Quick Input ───────────────────────────────────────────────────────

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000]

function AmountPanel({ onP2P, onScan }) {
  const [raw, setRaw] = useState('')
  const [err, setErr] = useState('')

  const parsed = parseInt(raw.replace(/\D/g, '')) || 0

  const handleChange = v => {
    const digits = v.replace(/\D/g, '')
    setRaw(digits ? parseInt(digits).toLocaleString('vi-VN') : '')
    setErr('')
  }

  const validate = () => {
    if (!parsed) { setErr('Vui lòng nhập số tiền'); return false }
    if (parsed < 1000) { setErr('Tối thiểu 1.000 ₫'); return false }
    if (parsed > 50_000_000) { setErr('Tối đa 50.000.000 ₫'); return false }
    return true
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Input */}
      <div style={{ position:'relative' }}>
        <input
          type="text" inputMode="numeric"
          placeholder="Nhập số tiền..."
          value={raw}
          onChange={e => handleChange(e.target.value)}
          style={{
            width:'100%', padding:'14px 52px 14px 16px', borderRadius:14,
            border: err ? '1.5px solid #dc2626' : '1.5px solid rgba(174,0,112,0.15)',
            background:'rgba(255,255,255,0.7)', fontSize:17, fontWeight:700,
            color:'#1a0413', outline:'none', backdropFilter:'blur(8px)',
            fontFamily:'inherit', boxSizing:'border-box',
            transition:'border-color .15s, box-shadow .15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#ae0070'; e.target.style.boxShadow = '0 0 0 4px rgba(174,0,112,0.08)' }}
          onBlur={e => { e.target.style.borderColor = err ? '#dc2626' : 'rgba(174,0,112,0.15)'; e.target.style.boxShadow = 'none' }}
        />
        <span style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', fontSize:14, fontWeight:700, color:'#9b4470' }}>₫</span>
      </div>
      {err && <div style={{ fontSize:12, color:'#dc2626', fontWeight:600, marginTop:-8 }}>⚠ {err}</div>}

      {/* Quick amounts */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {QUICK_AMOUNTS.map(a => (
          <button key={a} onClick={() => { handleChange(String(a)); setErr('') }}
            style={{
              padding:'5px 12px', borderRadius:20, border:'1px solid rgba(174,0,112,0.15)',
              background: parsed === a ? '#ae0070' : 'rgba(255,255,255,0.7)',
              color: parsed === a ? '#fff' : '#9b4470',
              fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .12s',
              backdropFilter:'blur(6px)',
            }}>
            {fmt(a)}₫
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:4 }}>
        <button
          onClick={() => { if (validate()) onP2P(parsed) }}
          style={{
            padding:'13px', borderRadius:14, border:'none', cursor:'pointer',
            background:'#ae0070', color:'#fff', fontSize:14, fontWeight:800,
            boxShadow:'0 6px 20px rgba(174,0,112,0.25)', transition:'all .15s',
            fontFamily:'inherit',
          }}
          onMouseEnter={e => { e.target.style.background='#91005d'; e.target.style.transform='translateY(-1px)' }}
          onMouseLeave={e => { e.target.style.background='#ae0070'; e.target.style.transform='none' }}
        >
          📱 Tạo QR P2P
        </button>
        <button
          onClick={() => { if (validate()) onScan(parsed) }}
          style={{
            padding:'13px', borderRadius:14, border:'1px solid rgba(174,0,112,0.2)', cursor:'pointer',
            background:'rgba(255,255,255,0.8)', color:'#ae0070', fontSize:14, fontWeight:800,
            transition:'all .15s', fontFamily:'inherit',
          }}
          onMouseEnter={e => { e.target.style.background='#fff0f7'; e.target.style.transform='translateY(-1px)' }}
          onMouseLeave={e => { e.target.style.background='rgba(255,255,255,0.8)'; e.target.style.transform='none' }}
        >
          📷 Scan POS
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IndexPage() {
  const router = useRouter()
  const [stats, setStats] = useState({ total: 0, paid: 0, revenue: 0 })

  useEffect(() => {
    fetch('/api/momo/orders').then(r => r.json()).then(data => {
      const orders = Array.isArray(data) ? data : (data.orders || [])
      const paid = orders.filter(o => o.status === 'PAID')
      setStats({
        total: orders.length,
        paid: paid.length,
        revenue: paid.reduce((s, o) => s + parseInt(o.amount || 0), 0),
      })
    }).catch(() => {})
  }, [])

  const goP2P = amt => {
    window.location.href = `${BASE_URL}/api/momo/create-p2p?amount=${amt}`
  }

  const goScan = amt => {
    router.push(`/admin/scan?amount=${amt}&quick=true`)
  }

  const year = new Date().getFullYear()

  return (
    <>
      <Head>
        <title>IPA · Thanh toán MoMo</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Be Vietnam Pro', sans-serif; }
          html, body { height: 100%; background: #f5edf2; }
          @keyframes om1 { 0%{transform:translate(0,0)scale(1)} 50%{transform:translate(8vw,4vh)scale(1.1)} 100%{transform:translate(-4vw,7vh)scale(.9)} }
          @keyframes om2 { 0%{transform:translate(0,0)scale(1.1)} 50%{transform:translate(-10vw,-6vh)scale(.9)} 100%{transform:translate(6vw,4vh)scale(1.1)} }
          @keyframes om3 { 0%{transform:translate(0,0)scale(.9)} 50%{transform:translate(-5vw,7vh)scale(1.2)} 100%{transform:translate(7vw,-4vh)scale(1)} }
          @keyframes pop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
          @keyframes slideup { from{transform:translateY(16px);opacity:0} to{transform:none;opacity:1} }
          input { outline: none; }
          button { cursor: pointer; }
          button:active { opacity: .85; }
          ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(174,0,112,.2); border-radius: 4px; }
        `}</style>
      </Head>

      <div style={{ position:'relative', minHeight:'100dvh', display:'flex', flexDirection:'column' }}>
        <Orbs />

        {/* Header */}
        <header style={{ position:'sticky', top:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 24px', background:'rgba(245,237,242,0.88)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(174,0,112,0.08)', boxShadow:'0 1px 16px rgba(174,0,112,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <img src="/Main.png" alt="IPA" style={{ width:32, height:32, borderRadius:8, objectFit:'contain' }} />
            <div style={{ lineHeight:1.1 }}>
              <div style={{ fontSize:15, fontWeight:900, color:'#ae0070', letterSpacing:'-.3px' }}>IPA Payment</div>
              <div style={{ fontSize:10, fontWeight:600, color:'#9b4470' }}>Powered by MoMo</div>
            </div>
          </div>
          <button
            onClick={() => router.push('/admin')}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, background:'rgba(174,0,112,0.07)', border:'1px solid rgba(174,0,112,0.12)', color:'#ae0070', fontSize:13, fontWeight:700, transition:'all .15s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(174,0,112,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(174,0,112,0.07)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Quản lý
          </button>
        </header>

        {/* Main */}
        <main style={{ position:'relative', zIndex:1, flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'32px 16px 48px', maxWidth:900, margin:'0 auto', width:'100%' }}>

          {/* Hero */}
          <div style={{ textAlign:'center', marginBottom:36, animation:'slideup .4s ease both' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:20, background:'rgba(174,0,112,0.08)', border:'1px solid rgba(174,0,112,0.12)', marginBottom:16 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', display:'inline-block' }} />
              <span style={{ fontSize:12, fontWeight:700, color:'#ae0070' }}>Hệ thống đang hoạt động</span>
            </div>
            <h1 style={{ fontSize:'clamp(28px,6vw,48px)', fontWeight:900, color:'#1a0413', letterSpacing:'-1.5px', lineHeight:1.05, marginBottom:12 }}>
              Thanh toán nhanh<br />
              <span style={{ color:'#ae0070' }}>IPA Coffee</span>
            </h1>
            <p style={{ fontSize:15, color:'#614655', fontWeight:500, maxWidth:360, margin:'0 auto', lineHeight:1.6 }}>
              Tạo đơn thanh toán MoMo trong vài giây — QR động hoặc quét mã tại quầy
            </p>
          </div>

          {/* Stats */}
          {stats.total > 0 && (
            <div style={{ display:'flex', gap:32, justifyContent:'center', marginBottom:36, padding:'18px 32px', borderRadius:20, background:'rgba(255,255,255,0.7)', border:'1px solid rgba(174,0,112,0.08)', backdropFilter:'blur(12px)', animation:'slideup .4s .1s ease both', flexWrap:'wrap' }}>
              <StatBadge label="Tổng đơn hôm nay" value={stats.total} />
              <div style={{ width:1, background:'rgba(174,0,112,0.1)' }} />
              <StatBadge label="Thành công" value={stats.paid} />
              <div style={{ width:1, background:'rgba(174,0,112,0.1)' }} />
              <StatBadge label="Doanh thu (₫)" value={stats.revenue} />
            </div>
          )}

          {/* Quick Pay Panel */}
          <div style={{ width:'100%', maxWidth:480, marginBottom:28, borderRadius:24, background:'rgba(255,255,255,0.9)', border:'1px solid rgba(174,0,112,0.1)', padding:'24px 22px', boxShadow:'0 8px 40px rgba(174,0,112,0.08)', backdropFilter:'blur(16px)', animation:'pop .35s cubic-bezier(.34,1.56,.64,1) .15s both' }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#9b4470', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>⚡ Thanh toán nhanh</div>
            <AmountPanel onP2P={goP2P} onScan={goScan} />
          </div>

          {/* Method Cards */}
          <div style={{ width:'100%', maxWidth:480, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, animation:'slideup .4s .25s ease both' }}>
            <MethodCard
              primary
              icon="📱"
              tag="P2P · QR động"
              title="Tạo đơn P2P"
              desc="Khách quét QR bằng MoMo hoặc app ngân hàng"
              onClick={() => router.push('/admin/create-transaction')}
            />
            <MethodCard
              icon="📷"
              tag="POS · Tại quầy"
              title="Quét mã POS"
              desc="Thu ngân quét mã MoMo từ điện thoại khách"
              onClick={() => router.push('/admin/scan')}
            />
          </div>

          {/* Admin shortcut */}
          <div style={{ marginTop:20, animation:'slideup .4s .35s ease both' }}>
            <button
              onClick={() => router.push('/admin')}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 20px', borderRadius:12, background:'transparent', border:'1px solid rgba(174,0,112,0.15)', color:'#9b4470', fontSize:13, fontWeight:700, transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(174,0,112,0.06)'; e.currentTarget.style.color='#ae0070' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#9b4470' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              Xem lịch sử giao dịch
            </button>
          </div>
        </main>

        {/* Footer */}
        <footer style={{ position:'relative', zIndex:1, textAlign:'center', padding:'16px', borderTop:'1px solid rgba(174,0,112,0.06)' }}>
          <p style={{ fontSize:11, color:'#c4a0b4', fontWeight:500 }}>
            © {year} IPA Coffee · Powered by{' '}
            <span style={{ color:'#ae0070', fontWeight:700 }}>MoMo Business</span>
          </p>
        </footer>
      </div>
    </>
  )
}