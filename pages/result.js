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
    let { orderId, resultCode, transId, amount, payType, message, orderInfo } = fullQuery
    const code = parseInt(resultCode)

    if (!orderId && typeof window !== 'undefined') {
      orderId = sessionStorage.getItem('momo_current_order_id')
    }

    if (!orderId) {
      setStatus('error')
      resolvedRef.current = true
      return
    }

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
        }).then(cleanUrlBar).catch(cleanUrlBar)
      } else {
        setStatus('failed')
        resolvedRef.current = true
        setInfo({ orderId, message, resultCode: code })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: code }),
        }).then(cleanUrlBar).catch(cleanUrlBar)
      }
    } else {
      // Polling cho F5
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()

          if (data.status === 'PAID') {
            setStatus('success')
            resolvedRef.current = true
            setInfo(data)
            clearInterval(poll)
            cleanUrlBar()
          } else if (data.status === 'FAILED') {
            setStatus('failed')
            resolvedRef.current = true
            setInfo(data)
            clearInterval(poll)
            cleanUrlBar()
          } else if (++attempts >= 10) {
            setStatus('pending')
            resolvedRef.current = true
            clearInterval(poll)
            cleanUrlBar()
          }
        } catch {
          resolvedRef.current = true
          clearInterval(poll)
          cleanUrlBar()
        }
      }, 1500)

      return () => clearInterval(poll)
    }
  }, [router.isReady, router.query])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')

  const META = {
    loading: { spin: true, title: 'Đang xác nhận…', sub: 'Vui lòng không đóng trang', accent: '#ae0070', bg: '#fdf5f9' },
    success: { icon: '✓', title: 'Thanh toán thành công!', sub: 'Giao dịch đã được MoMo xác nhận', accent: '#16a34a', bg: 'rgba(232, 245, 233, 0.85)' },
    failed: { icon: '✕', title: 'Giao dịch thất bại', sub: null, accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
    pending: { icon: '⏳', title: 'Đang chờ xác nhận', sub: 'MoMo chưa phản hồi, kiểm tra lại sau', accent: '#d97706', bg: 'rgba(255, 243, 224, 0.85)' },
    error: { icon: '!', title: 'Không tìm thấy đơn hàng', sub: 'Link không hợp lệ hoặc đã hết hạn', accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
  }

  const m = META[status] || META.loading

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>

      <div className="min-h-screen bg-[#f3e9ed] flex items-center justify-center p-4 overflow-hidden relative font-['Be_Vietnam_Pro',sans-serif]">
        {/* Orbs Background */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />

        {/* Noise Overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%270%200%20200%20200%27 xmlns=%27http://www.w3.org/2000/svg%27%3e%3cfilter id=%27noiseFilter%27%3e%3ccolorMatrix type=%27matrix%27 values=%270.15%200%200%200%200%200%200.15%200%200%200%200%200%200.15%200%200%200%200%200%200.05%200%27/%3e%3cturbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3e%3c/filter%3e%3crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noiseFilter)%27/%3e%3c/svg%27)] opacity-50 pointer-events-none" />

        <div className="relative z-10 w-full max-w-[860px] bg-white/90 backdrop-blur-2xl border border-white/70 rounded-3xl shadow-2xl overflow-hidden grid md:grid-cols-[1.1fr,0.9fr]">

          {/* Left - Status Section */}
          <div className="bg-white/20 p-10 md:p-12 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-[#ae0070]/10">
            <div className="absolute top-6 left-8 flex items-center gap-3">
              <img src="/Main.png" alt="Logo" className="w-8 h-8 rounded-xl" />
              <span className="font-bold text-lg tracking-tight text-[#1a0413]">IPA</span>
            </div>

            {m.spin ? (
              <div className="w-[70px] h-[70px] border-4 border-[#ae0070]/20 border-t-[#ae0070] rounded-full animate-spin mb-8" />
            ) : (
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center text-6xl font-black mb-8 shadow-xl animate-[scaleUp_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
                style={{ backgroundColor: m.bg, color: m.accent }}
              >
                {m.icon}
              </div>
            )}

            <h1 className="text-3xl md:text-[28px] font-black leading-tight mb-4" style={{ color: m.spin ? '#1a0413' : m.accent }}>
              {m.title}
            </h1>

            <p className="text-[#614655] text-[15px] max-w-[300px] leading-relaxed">
              {m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}
            </p>
          </div>

          {/* Right - Details Section */}
          <div className="p-10 md:p-12 flex flex-col justify-center">
            {(status === 'success' || status === 'failed') && (
              <h2 className="text-xl font-bold text-[#1a0413] mb-6">Thông tin đơn hàng</h2>
            )}

            {status === 'success' && info && (
              <div className="bg-white/70 border border-[#ae0070]/10 rounded-2xl overflow-hidden mb-8">
                {info.amount > 0 && (
                  <div className="flex justify-between items-center px-6 py-5 border-b border-[#ae0070]/5">
                    <span className="text-[#614655] font-medium">Số tiền</span>
                    <span className="text-3xl font-black text-[#ae0070]">{fmt(info.amount)} ₫</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-6 py-5 border-b border-[#ae0070]/5">
                  <span className="text-[#614655] font-medium">Mã đơn hàng</span>
                  <span className="font-bold text-right break-all">{info.orderId}</span>
                </div>
                {info.transId && (
                  <div className="flex justify-between items-center px-6 py-5 border-b border-[#ae0070]/5">
                    <span className="text-[#614655] font-medium">Mã GD MoMo</span>
                    <span className="font-bold">{info.transId}</span>
                  </div>
                )}
                {info.payType && (
                  <div className="flex justify-between items-center px-6 py-5">
                    <span className="text-[#614655] font-medium">Hình thức</span>
                    <span className="font-bold">{info.payType}</span>
                  </div>
                )}
              </div>
            )}

            {status === 'failed' && info && (
              <div className="bg-white/70 border border-red-200 rounded-2xl overflow-hidden mb-8">
                <div className="flex justify-between items-center px-6 py-5 border-b border-red-100">
                  <span className="text-[#614655] font-medium">Mã lỗi</span>
                  <span className="font-bold text-red-600">{info.resultCode}</span>
                </div>
                <div className="flex justify-between items-center px-6 py-5 border-b border-red-100">
                  <span className="text-[#614655] font-medium">Đơn hàng</span>
                  <span className="font-bold break-all">{info.orderId}</span>
                </div>
                {info.message && (
                  <div className="flex justify-between items-center px-6 py-5">
                    <span className="text-[#614655] font-medium">Nguyên nhân</span>
                    <span className="font-medium text-right text-red-600">{info.message}</span>
                  </div>
                )}
              </div>
            )}

            {status === 'loading' && (
              <div className="text-center py-12 text-[#614655]">
                Đang đồng bộ dữ liệu từ MoMo...
              </div>
            )}

            {status !== 'loading' && (
              <Link
                href="/"
                className="mt-auto block w-full py-4 text-center bg-[#ae0070] hover:bg-[#91005d] text-white font-bold text-base rounded-2xl shadow-xl hover:shadow-2xl transition-all active:scale-95"
              >
                {status === 'failed' ? 'Thử thanh toán lại' : 'Quay lại trang chủ'}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Tailwind Orbs Styles */}
      <style jsx>{`
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(55px);
          opacity: 0.65;
          z-index: 0;
          pointer-events: none;
        }
        .orb-1 { top: -5%; left: -5%; width: 50vw; height: 50vw; background: #ff9cb7; animation: orbMove1 5s infinite alternate ease-in-out; }
        .orb-2 { bottom: -5%; right: -5%; width: 60vw; height: 60vw; background: #b0bec5; animation: orbMove2 7s infinite alternate ease-in-out; }
        .orb-3 { top: 25%; right: -5%; width: 45vw; height: 45vw; background: #dfb2ea; animation: orbMove3 6s infinite alternate ease-in-out; }
        .orb-4 { bottom: -5%; left: 5%; width: 40vw; height: 40vw; background: #80cbc4; animation: orbMove1 6.5s infinite alternate ease-in-out; }

        @keyframes orbMove1 { 0% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(8vw,4vh,0) scale(1.15); } 100% { transform: translate3d(-4vw,7vh,0) scale(0.9); } }
        @keyframes orbMove2 { 0% { transform: translate3d(0,0,0) scale(1.1); } 50% { transform: translate3d(-10vw,-6vh,0) scale(0.9); } 100% { transform: translate3d(6vw,4vh,0) scale(1.1); } }
        @keyframes orbMove3 { 0% { transform: translate3d(0,0,0) scale(0.9); } 50% { transform: translate3d(-5vw,7vh,0) scale(1.2); } 100% { transform: translate3d(7vw,-4vh,0) scale(1); } }

        @keyframes scaleUp {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  )
}