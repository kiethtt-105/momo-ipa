import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

// Bắn tín hiệu sang các tab khác cùng domain (ví dụ /admin/scan đang mở
// riêng) để báo "đã có kết quả cuối cùng cho đơn hàng này" — tab đó sẽ tự
// reload lại để admin thấy trạng thái mới nhất ngay, không cần bấm tay.
function notifyOtherTabs(orderId, status) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return
  try {
    const ch = new BroadcastChannel('momo-result')
    ch.postMessage({ type: 'momo-result-done', orderId, status })
    ch.close()
  } catch (e) {
    console.error('Không gửi được tín hiệu BroadcastChannel:', e)
  }
}

// Gọi API tra cứu chính thức của MoMo (pages/api/momo/query.js) để lấy
// TOÀN BỘ field có thể có cho 1 đơn hàng — đầy đủ hơn nhiều so với chỉ
// vài field bắn về qua URL redirect (transId, payType, requestId,
// orderInfo, orderType, responseTime, extraData, refundTrans...).
// Hàm này không throw — nếu lỗi/timeout thì chỉ log, trang vẫn hiển thị
// được info cơ bản đã có trước đó.
async function fetchFullInfo(orderId) {
  try {
    const res = await fetch('/api/momo/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[result] /api/momo/query lỗi:', data?.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[result] Không gọi được /api/momo/query:', e)
    return null
  }
}
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [info, setInfo] = useState(null)
  // Đánh dấu đã có kết quả cuối (success/failed) — để effect không xử lý lại
  // khi cleanUrlBar() đổi router.query và làm effect tự chạy lại lần nữa.
  const resolvedRef = useRef(false)

useEffect(() => {
    if (!router.isReady) return
    if (resolvedRef.current) return // đã có kết quả cuối — bỏ qua lần effect chạy lại do cleanUrlBar

    // 1. Đọc thông tin từ URL bắn về — lấy TOÀN BỘ query (không chỉ vài field)
    //    vì save.js cần đủ field (kể cả signature) để xác minh chữ ký MoMo.
    const fullQuery = { ...router.query }
    let { orderId, resultCode, transId, amount, payType, message, orderInfo } = fullQuery
    const code = parseInt(resultCode)

    // 2. MẸO CHỐNG F5: Nếu URL trống, lục tìm đơn hàng trong bộ nhớ đệm trình duyệt
    if (!orderId && typeof window !== 'undefined') {
      orderId = sessionStorage.getItem('momo_current_order_id')
    }

    // Nếu cả URL và bộ nhớ đều trống thì mới báo lỗi thực sự
    if (!orderId) { setStatus('error'); resolvedRef.current = true; return }

    // Hàm phụ để dọn dẹp thanh địa chỉ URL sau 500ms cho sạch đẹp
    const cleanUrlBar = () => {
      setTimeout(() => {
        router.replace('/result', undefined, { shallow: true })
      }, 500)
    }

    // 3. Nếu có thông tin đơn mới từ URL, tiến hành lưu và ghi nhớ id
    if (resultCode !== undefined) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('momo_current_order_id', orderId) // Lưu lại để F5 không bị quên
      }

      if (code === 0) {
        setStatus('success')
        resolvedRef.current = true
        setInfo({ orderId, transId, amount: parseInt(amount), payType, message })
        notifyOtherTabs(orderId, 'success')
        fetchFullInfo(orderId).then(full => {
          if (full) setInfo(prev => ({ ...prev, ...full }))
        })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: 0 }),
        })
        .then(() => cleanUrlBar())
        .catch(() => cleanUrlBar())
      } else {
        setStatus('failed')
        resolvedRef.current = true
        setInfo({ orderId, message, resultCode: code })
        notifyOtherTabs(orderId, 'failed')
        fetchFullInfo(orderId).then(full => {
          if (full) setInfo(prev => ({ ...prev, ...full }))
        })
        fetch('/api/momo/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fullQuery, resultCode: code }),
        })
        .then(() => cleanUrlBar())
        .catch(() => cleanUrlBar())
      }
    } else {
      // 4. LUỒNG KHI NHẤN F5: Tự động gọi API hỏi server trạng thái đơn hàng đã lưu ngầm
      let attempts = 0
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/momo/status?orderId=${orderId}`)
          const data = await res.json()
          if (data.status === 'PAID') { 
            setStatus('success')
            resolvedRef.current = true
            setInfo(data)
            notifyOtherTabs(orderId, 'success')
            fetchFullInfo(orderId).then(full => {
              if (full) setInfo(prev => ({ ...prev, ...full }))
            })
            clearInterval(poll)
            cleanUrlBar()
          }
          else if (data.status === 'FAILED') { 
            setStatus('failed')
            resolvedRef.current = true
            setInfo(data)
            notifyOtherTabs(orderId, 'failed')
            fetchFullInfo(orderId).then(full => {
              if (full) setInfo(prev => ({ ...prev, ...full }))
            })
            clearInterval(poll)
            cleanUrlBar()
          }
          else if (++attempts >= 10) { 
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
  const fmtTime = ms => {
    if (!ms) return null
    const d = new Date(parseInt(ms))
    return isNaN(d.getTime()) ? null : d.toLocaleString('vi-VN')
  }

  const META = {
    loading: { spin: true,  title: 'Đang xác nhận…',          sub: 'Vui lòng không đóng trang',              accent: '#ae0070', bg: '#fdf5f9' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',   sub: 'Giao dịch đã được MoMo xác nhận',        accent: '#16a34a', bg: 'rgba(232, 245, 233, 0.85)' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',       sub: null,                                      accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',        sub: 'MoMo chưa phản hồi, kiểm tra lại sau',   accent: '#d97706', bg: 'rgba(255, 243, 224, 0.85)' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng',  sub: 'Link không hợp lệ hoặc đã hết hạn',      accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
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

      <div className="relative grid min-h-dvh w-screen place-items-center content-center overflow-y-auto overflow-x-hidden bg-[#f6eff2] px-4 py-6 font-[var(--font)]">
        <div
          className="pointer-events-none absolute inset-0 z-[1] opacity-50"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3e%3cfilter id='noiseFilter'%3e%3ccolorMatrix type='matrix' values='0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.15 0 0 0 0 0 0.05 0'/%3e%3cturbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3e%3c/filter%3e%3crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3e%3c/svg%3e\")",
          }}
        />
        <div
          className="pointer-events-none absolute left-[-5%] top-[-5%] z-0 h-[50vw] w-[50vw] rounded-full bg-[#ff9cb7] opacity-65 blur-[55px]"
          style={{ animation: 'om1 5s infinite alternate ease-in-out' }}
        />
        <div
          className="pointer-events-none absolute bottom-[-5%] right-[-5%] z-0 h-[60vw] w-[60vw] rounded-full bg-[#b0bec5] opacity-65 blur-[55px]"
          style={{ animation: 'om2 7s infinite alternate ease-in-out' }}
        />
        <div
          className="pointer-events-none absolute right-[-5%] top-[25%] z-0 h-[45vw] w-[45vw] rounded-full bg-[#dfb2ea] opacity-65 blur-[55px]"
          style={{ animation: 'om3 6s infinite alternate ease-in-out' }}
        />
        <div
          className="pointer-events-none absolute bottom-[-5%] left-[5%] z-0 h-[40vw] w-[40vw] rounded-full bg-[#80cbc4] opacity-65 blur-[55px]"
          style={{ animation: 'om1 6.5s infinite alternate ease-in-out' }}
        />

        <div className="relative z-[2] grid w-full max-w-[clamp(340px,92vw,860px)] grid-cols-1 overflow-hidden rounded-[20px] border border-white/70 bg-[var(--surface)] shadow-[0_25px_50px_rgba(174,0,112,0.04),0_1px_2px_rgba(0,0,0,0.01)] backdrop-blur-[25px] will-change-transform md:grid-cols-[1.1fr_0.9fr] md:rounded-3xl">
          {/* Status section */}
          <div className="relative flex flex-col items-center justify-center border-b border-dashed border-[rgba(174,0,112,0.15)] bg-white/20 px-6 pb-9 pt-11 text-center md:border-b-0 md:border-r md:border-dashed md:border-[rgba(174,0,112,0.12)] md:px-10 md:py-12">
            <div className="absolute left-5 top-4 flex items-center gap-2.5 md:left-8 md:top-6">
              <img src="/Main.png" alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
              <span className="text-sm font-extrabold tracking-[-0.2px] text-[var(--text)]">IPA</span>
            </div>

            {m.spin ? (
              <div
                className="mb-6 h-[clamp(56px,14vw,70px)] w-[clamp(56px,14vw,70px)] rounded-full border-[5px] border-[rgba(174,0,112,0.1)] border-t-[var(--mm)]"
                style={{ animation: 'rot 0.8s linear infinite' }}
              />
            ) : (
              <div
                className="mb-6 mt-5 flex h-[clamp(70px,18vw,100px)] w-[clamp(70px,18vw,100px)] items-center justify-center rounded-full text-[clamp(28px,7vw,42px)] font-black"
                style={{ backgroundColor: m.bg, color: m.accent, animation: 'scaleup 0.4s cubic-bezier(.34,1.56,.64,1) both' }}
              >
                {m.icon}
              </div>
            )}

            <h1
              className="mb-3 text-[clamp(20px,5vw,26px)] font-extrabold leading-[1.3]"
              style={{ color: m.spin ? 'var(--text)' : m.accent }}
            >
              {m.title}
            </h1>
            <p className="max-w-[clamp(240px,80vw,300px)] text-sm leading-relaxed text-[var(--muted)]">
              {m.sub || (status === 'failed' ? info?.message || 'Giao dịch không thành công' : '')}
            </p>
          </div>

          {/* Details section */}
          <div className="flex flex-col justify-center px-6 py-9 md:px-10 md:py-12">
            {(status === 'success' || status === 'failed') && (
              <h2 className="mb-5 text-[17px] font-extrabold tracking-[-0.3px] text-[var(--text)]">
                Thông tin đơn hàng
              </h2>
            )}

            {status === 'success' && info && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-[rgba(174,0,112,0.08)] bg-white/60">
                {info.amount > 0 && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm">
                    <span className="font-medium text-[var(--muted)]">Số tiền</span>
                    <span className="max-w-[60%] break-all text-right text-2xl font-black text-[var(--mm)]">{fmt(info.amount)} ₫</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                  <span className="font-medium text-[var(--muted)]">Mã đơn hàng</span>
                  <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.orderId}</span>
                </div>
                {info.transId && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Mã GD MoMo</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.transId}</span>
                  </div>
                )}
                {info.payType && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Hình thức</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.payType}</span>
                  </div>
                )}
                {info.orderType && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Loại đơn hàng</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.orderType}</span>
                  </div>
                )}
                {info.orderInfo && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Nội dung</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.orderInfo}</span>
                  </div>
                )}
                {info.requestId && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Request ID</span>
                    <span className="max-w-[60%] break-all text-right font-mono text-xs font-bold text-[var(--text)]">{info.requestId}</span>
                  </div>
                )}
                {fmtTime(info.responseTime) && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Thời gian phản hồi</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{fmtTime(info.responseTime)}</span>
                  </div>
                )}
                {info.extraData && info.extraData !== '' && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Extra Data</span>
                    <span className="max-w-[60%] break-all text-right font-mono text-xs font-bold text-[var(--text)]">{info.extraData}</span>
                  </div>
                )}
                {Array.isArray(info.refundTrans) && info.refundTrans.length > 0 && (
                  <div className="flex items-center justify-between px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Giao dịch hoàn tiền</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.refundTrans.length} lần</span>
                  </div>
                )}
              </div>
            )}

            {status === 'failed' && info?.resultCode && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-[rgba(174,0,112,0.08)] bg-white/60">
                <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm">
                  <span className="font-medium text-[var(--muted)]">Mã lỗi hệ thống</span>
                  <span className="max-w-[60%] break-all text-right font-bold text-[#dc2626]">{info.resultCode}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                  <span className="font-medium text-[var(--muted)]">Đơn hàng số</span>
                  <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.orderId}</span>
                </div>
                {info.message && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Nguyên nhân</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.message}</span>
                  </div>
                )}
                {info.amount > 0 && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Số tiền</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{fmt(info.amount)} ₫</span>
                  </div>
                )}
                {info.transId && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Mã GD MoMo</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.transId}</span>
                  </div>
                )}
                {info.payType && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Hình thức</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.payType}</span>
                  </div>
                )}
                {info.orderInfo && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Nội dung</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{info.orderInfo}</span>
                  </div>
                )}
                {info.requestId && (
                  <div className="flex items-center justify-between border-b border-[rgba(174,0,112,0.04)] px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Request ID</span>
                    <span className="max-w-[60%] break-all text-right font-mono text-xs font-bold text-[var(--text)]">{info.requestId}</span>
                  </div>
                )}
                {fmtTime(info.responseTime) && (
                  <div className="flex items-center justify-between px-5 py-4 text-sm last:border-b-0">
                    <span className="font-medium text-[var(--muted)]">Thời gian phản hồi</span>
                    <span className="max-w-[60%] break-all text-right font-bold text-[var(--text)]">{fmtTime(info.responseTime)}</span>
                  </div>
                )}
              </div>
            )}

            {status === 'loading' && (
              <div className="px-0 py-5 text-center text-sm text-[var(--muted)]">
                <p>Đang đồng bộ dữ liệu kết quả từ MoMo...</p>
              </div>
            )}

            {status !== 'loading' && (
              <Link
                href="/"
                className="flex w-full items-center justify-center rounded-2xl bg-[var(--mm)] py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-0.5 hover:bg-[var(--mm-dark)] hover:shadow-[0_12px_28px_rgba(174,0,112,0.3)]"
              >
                {status === 'failed' ? 'Thử thanh toán lại' : 'Quay lại trang chủ'}
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  )
}