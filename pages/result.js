import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [info, setInfo] = useState(null)
  const resolvedRef = useRef(false)

  useEffect(() => {
    if (!router.isReady) return
    if (resolvedRef.current) return

    const fullQuery = { ...router.query }
    let { orderId, resultCode, transId, amount, payType, message } = fullQuery
    const code = parseInt(resultCode)

    if (!orderId && typeof window !== 'undefined') {
      orderId = sessionStorage.getItem('momo_current_order_id')
    }

    if (!orderId) { setStatus('error'); resolvedRef.current = true; return }

    const cleanUrlBar = () => {
      setTimeout(() => {
        router.replace('/result', undefined, { shallow: true })
      }, 500)
    }

    if (resultCode !== undefined) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('momo_current_order_id', orderId)
      }

      if (code === 0) {
        setStatus('success')
        resolvedRef.current = true
        setInfo({ orderId, transId, amount: parseInt(amount), payType, message })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: 0 }),
        }).then(() => cleanUrlBar()).catch(() => cleanUrlBar())
      } else {
        setStatus('failed')
        resolvedRef.current = true
        setInfo({ orderId, message, resultCode: code })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: code }),
        }).then(() => cleanUrlBar()).catch(() => cleanUrlBar())
      }
    } else {
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID') {
            setStatus('success'); resolvedRef.current = true; setInfo(data)
            clearInterval(poll); cleanUrlBar()
          } else if (data.status === 'FAILED') {
            setStatus('failed'); resolvedRef.current = true; setInfo(data)
            clearInterval(poll); cleanUrlBar()
          } else if (++attempts >= 10) {
            setStatus('pending'); resolvedRef.current = true
            clearInterval(poll); cleanUrlBar()
          }
        } catch {
          resolvedRef.current = true; clearInterval(poll); cleanUrlBar()
        }
      }, 1500)
      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const META = {
    loading: { spin: true,  title: 'Đang xác nhận…',         sub: 'Vui lòng không đóng trang',             accent: '#ae0070', iconBg: '#fdf5f9' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',  sub: 'Giao dịch đã được MoMo xác nhận',       accent: '#16a34a', iconBg: 'rgba(232,245,233,0.9)' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',      sub: null,                                     accent: '#dc2626', iconBg: 'rgba(255,235,235,0.9)' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',       sub: 'MoMo chưa phản hồi, kiểm tra lại sau',  accent: '#d97706', iconBg: 'rgba(255,243,224,0.9)' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng', sub: 'Link không hợp lệ hoặc đã hết hạn',    accent: '#dc2626', iconBg: 'rgba(255,235,235,0.9)' },
  }
  const m = META[status] || META.loading

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        @keyframes orbMove1 { 0%{transform:translate3d(0,0,0)scale(1)} 50%{transform:translate3d(8vw,4vh,0)scale(1.15)} 100%{transform:translate3d(-4vw,7vh,0)scale(0.9)} }
        @keyframes orbMove2 { 0%{transform:translate3d(0,0,0)scale(1.1)} 50%{transform:translate3d(-10vw,-6vh,0)scale(0.9)} 100%{transform:translate3d(6vw,4vh,0)scale(1.1)} }
        @keyframes orbMove3 { 0%{transform:translate3d(0,0,0)scale(0.9)} 50%{transform:translate3d(-5vw,7vh,0)scale(1.2)} 100%{transform:translate3d(7vw,-4vh,0)scale(1)} }
        @keyframes scaleUp  { from{transform:scale(0.7);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes spin     { to{transform:rotate(360deg)} }
      `}</style>

      <div
        className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#f6eff2] px-4 py-6"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
      >
        {/* Orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[5%] -top-[5%] h-[50vw] w-[50vw] rounded-full bg-[#ff9cb7] opacity-65 blur-[55px]"
            style={{ animation: 'orbMove1 5s infinite alternate ease-in-out' }} />
          <div className="absolute -bottom-[5%] -right-[5%] h-[60vw] w-[60vw] rounded-full bg-[#b0bec5] opacity-65 blur-[55px]"
            style={{ animation: 'orbMove2 7s infinite alternate ease-in-out' }} />
          <div className="absolute -right-[5%] top-[25%] h-[45vw] w-[45vw] rounded-full bg-[#dfb2ea] opacity-65 blur-[55px]"
            style={{ animation: 'orbMove3 6s infinite alternate ease-in-out' }} />
          <div className="absolute -bottom-[5%] left-[5%] h-[40vw] w-[40vw] rounded-full bg-[#80cbc4] opacity-65 blur-[55px]"
            style={{ animation: 'orbMove1 6.5s infinite alternate ease-in-out' }} />
        </div>

        {/* Card container */}
        <div
          className="relative z-10 w-full max-w-[860px] overflow-hidden rounded-3xl border border-white/70 shadow-[0_25px_50px_rgba(174,0,112,0.04),0_1px_2px_rgba(0,0,0,0.01)]"
          style={{
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
            background: 'rgba(255,255,255,0.85)',
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.9fr',
          }}
        >
          {/* LEFT — status section */}
          <div
            className="relative flex flex-col items-center justify-center px-10 py-[50px] text-center"
            style={{ borderRight: '1px dashed rgba(174,0,112,0.12)', background: 'rgba(255,255,255,0.2)' }}
          >
            {/* Brand */}
            <div className="absolute left-8 top-6 flex items-center gap-2.5">
              <img src="/Main.png" alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
              <span className="text-[14px] font-extrabold tracking-[-0.2px] text-[#1a0413]">IPA</span>
            </div>

            {m.spin ? (
              <div
                className="mb-6 h-[70px] w-[70px] rounded-full border-[5px] border-[rgba(174,0,112,0.1)] border-t-[#ae0070]"
                style={{ animation: 'spin 0.8s linear infinite' }}
              />
            ) : (
              <div
                className="mb-6 flex h-[100px] w-[100px] items-center justify-center rounded-full text-[42px] font-black"
                style={{ backgroundColor: m.iconBg, color: m.accent, animation: 'scaleUp 0.4s cubic-bezier(.34,1.56,.64,1) both' }}
              >
                {m.icon}
              </div>
            )}

            <h1 className="mb-3 text-[26px] font-extrabold leading-snug text-[#1a0413]"
              style={{ color: m.spin ? '#1a0413' : m.accent }}>
              {m.title}
            </h1>
            <p className="max-w-[300px] text-sm leading-relaxed text-[#614655]">
              {m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}
            </p>
          </div>

          {/* RIGHT — details section */}
          <div className="flex flex-col justify-center px-10 py-[50px]">
            {(status === 'success' || status === 'failed') && (
              <h2 className="mb-5 text-[17px] font-extrabold tracking-[-0.3px] text-[#1a0413]">
                Thông tin đơn hàng
              </h2>
            )}

            {status === 'success' && info && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-[rgba(174,0,112,0.08)] bg-white/60">
                {info.amount > 0 && (
                  <InfoItem label="Số tiền" value={
                    <span className="text-2xl font-black text-[#ae0070]">{fmt(info.amount)} ₫</span>
                  } />
                )}
                <InfoItem label="Mã đơn hàng" value={info.orderId} />
                {info.transId && <InfoItem label="Mã GD MoMo" value={info.transId} />}
                {info.payType && <InfoItem label="Hình thức" value={info.payType} />}
              </div>
            )}

            {status === 'failed' && info?.resultCode && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-[rgba(174,0,112,0.08)] bg-white/60">
                <InfoItem label="Mã lỗi hệ thống"
                  value={<span className="text-[#dc2626]">{info.resultCode}</span>} />
                <InfoItem label="Đơn hàng số" value={info.orderId} />
                {info.message && <InfoItem label="Nguyên nhân" value={info.message} />}
              </div>
            )}

            {status === 'loading' && (
              <p className="py-5 text-center text-sm text-[#614655]">
                Đang đồng bộ dữ liệu kết quả từ MoMo...
              </p>
            )}

            {status !== 'loading' && (
              <Link
                href="/"
                className="flex w-full items-center justify-center rounded-[14px] bg-[#ae0070] py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(174,0,112,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#91005d] hover:shadow-[0_12px_28px_rgba(174,0,112,0.3)]"
              >
                {status === 'failed' ? 'Thử thanh toán lại' : 'Quay lại trang chủ'}
              </Link>
            )}
          </div>
        </div>

        {/* Mobile override */}
        <style>{`
          @media (max-width: 768px) {
            .result-card { grid-template-columns: 1fr !important; max-width: 400px !important; }
            .result-left { border-right: none !important; border-bottom: 1px dashed rgba(174,0,112,0.15) !important; padding: 45px 24px 35px !important; }
            .result-right { padding: 35px 24px !important; }
          }
        `}</style>
      </div>
    </>
  )
}

function InfoItem({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-0">
      <span className="font-medium text-[#614655]">{label}</span>
      <span className="max-w-[60%] break-all text-right font-bold text-[#1a0413]">{value}</span>
    </div>
  )
}