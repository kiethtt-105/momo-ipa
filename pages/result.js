import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
// Phải trùng với TX_BASE_URL trong admin/create-transaction.js — dùng để
// bắn THẲNG vào API tạo giao dịch khi admin bấm "Thử thanh toán lại",
// không cần quay lại trang create-transaction nữa.
const TX_BASE_URL = 'https://kiehtt.vercel.app'

// vì giờ P2P mở TAB RIÊNG (không phải tab create-transaction nữa), trang này
// không tự redirect về /admin/create-transaction sau khi có kết quả nữa —
// tránh mở thêm 1 bản create-transaction mới mỗi lần thanh toán xong.
// Admin tự bấm "Xác nhận giao dịch" (success) hoặc "Đóng tab này" (failed/
// pending/error) để đóng tab, kết quả vẫn được báo về tab create-transaction
// qua BroadcastChannel (notifyOtherTabs) như cũ.

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
  // Gọi ĐỒNG THỜI 2 nguồn:
  // 1. /api/momo/query  → hỏi MoMo server-to-server (resultCode, transId, payType, responseTime...)
  // 2. /api/momo/status → đọc Redis của HỆ THỐNG MÌNH (source, orderInfo gốc...)
  // MoMo KHÔNG biết & KHÔNG trả field "source"/"orderInfo" của hệ thống mình,
  // nên nếu chỉ dùng (1) thì info.source luôn undefined → buildRetryUrl() ở
  // dưới không bao giờ nhận ra được đơn là 'pos'/'scan' hay 'p2p', cứ rơi về
  // nhánh mặc định P2P (đúng lỗi đang gặp).
  const [momoFull, ourRecord] = await Promise.all([
    fetch('/api/momo/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).then(r => r.json()).catch(e => { console.error('[result] /api/momo/query lỗi:', e); return null }),

    fetch(`/api/momo/status?orderId=${encodeURIComponent(orderId)}`)
      .then(r => r.json()).catch(e => { console.error('[result] /api/momo/status lỗi:', e); return null }),
  ])

  // ourRecord làm NỀN (có source, orderInfo gốc) — đè lên bằng field tươi từ
  // MoMo (resultCode/transId/message...) vì MoMo là nguồn sự thật cho trạng thái giao dịch.
  if (!momoFull && !ourRecord) return null
  return { ...(ourRecord || {}), ...(momoFull || {}) }
}

// Sinh orderInfo cho lần thử lại — giữ NGUYÊN gốc của orderInfo cũ, chỉ thêm/
// tăng hậu tố "_N" ở cuối (vd: iPOS123 → iPOS123_2, lần thử lại tiếp theo của
// CHÍNH đơn _2 đó → iPOS123_3...). Vẫn tránh trùng đơn nhưng nhìn vào vẫn biết
// đây là đơn thử lại của đơn nào, không phải sinh 1 mã ngẫu nhiên mới hoàn toàn.
function appendRetrySuffix(orderInfo) {
  const m = orderInfo.match(/^(.*)_(\d+)$/)
  if (m) {
    const base = m[1]
    const next = parseInt(m[2], 10) + 1
    return `${base}_${next}`
  }
  return `${orderInfo}_2`
}

// Xây URL "Thử lại" — bắn THẲNG vào API tạo giao dịch (giống hệt hành vi của
// nút "Xác nhận tạo giao dịch" ở trang create-transaction: mở luôn, không cần
// quay lại trang đó xem/sửa rồi bấm thêm 1 lần nữa). Giữ nguyên amount/method
// của đơn cũ, chỉ đổi orderInfo (thêm hậu tố _N) để không bị lỗi trùng đơn.
function buildRetryUrl(info) {
  if (!info || !info.amount) return '/admin' // thiếu dữ liệu → fallback về dashboard

  const amt = info.amount
  const source = info.source || ''
  const method = (source === 'pos' || source === 'scan') ? 'scan' : 'p2p'
  const baseOrderInfo = info.orderInfo || `iPOS${Date.now()}`
  const retryOrderInfo = appendRetrySuffix(baseOrderInfo)

  if (method === 'p2p') {
    return `${TX_BASE_URL}/api/momo/redirect?amount=${amt}&orderInfo=${encodeURIComponent(retryOrderInfo)}`
  }
  return `${TX_BASE_URL}/api/admin/scan-quick?amount=${amt}&orderInfo=${encodeURIComponent(retryOrderInfo)}`
}

// True khi buildRetryUrl() trả về URL API thật (mở tab mới ngay), false khi
// rơi về fallback '/admin/create-transaction' (thiếu dữ liệu, cần admin tự nhập).
function isDirectRetry(info) {
  return !!(info && info.amount)
}

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [info, setInfo] = useState(null)
  // Đánh dấu đã có kết quả cuối (success/failed) — để effect không xử lý lại
  // khi cleanUrlBar() đổi router.query và làm effect tự chạy lại lần nữa.
  const resolvedRef = useRef(false)

  // ── TỰ CO/GIÃN CARD CHO VỪA KHÍT MÀN HÌNH (desktop) ────────
  // Đo kích thước THẬT của card (ở scale 1) so với window.innerWidth/Height,
  // rồi tự áp transform: scale() nhỏ lại vừa đủ để thấy hết toàn bộ trong 1
  // màn hình, không cần người dùng tự bấm zoom out trình duyệt. Tự đo lại mỗi
  // khi đổi kích thước cửa sổ hoặc khi có thêm dữ liệu (info đổi → card cao
  // thêm do fetchFullInfo trả về nhiều field hơn).
  const cardRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const MARGIN = 32 // chừa lề quanh card
    const MIN_SCALE = 0.6 // không co nhỏ hơn mức này, đỡ chữ bé khó đọc
    const MOBILE_BREAKPOINT = 768 // dưới breakpoint này: cho cuộn tự nhiên, không auto-scale

    const fit = () => {
      const el = cardRef.current
      if (!el) return
      if (window.innerWidth < MOBILE_BREAKPOINT) {
        setScale(1)
        return
      }
      el.style.transform = 'scale(1)' // reset để đo kích thước thật trước
      const rect = el.getBoundingClientRect()
      const availW = window.innerWidth - MARGIN * 2
      const availH = window.innerHeight - MARGIN * 2
      const s = Math.min(1, availW / rect.width, availH / rect.height)
      setScale(Math.max(MIN_SCALE, s))
    }

    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [status, info])

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

  // (Đã bỏ effect tự redirect ngược về create-transaction — xem comment đầu file)

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')
  const fmtTime = ms => {
    if (!ms) return null
    const d = new Date(parseInt(ms))
    return isNaN(d.getTime()) ? null : d.toLocaleString('vi-VN')
  }

  // ── HIỂN THỊ TOÀN BỘ FIELD CÓ TRONG `info` ─────────────────
  // Không liệt kê cứng — bất kể field nào info có (từ MoMo query, từ Redis
  // hệ thống mình, hay field lạ phát sinh sau này) đều tự hiện ra. Field quen
  // có nhãn tiếng Việt đẹp; field lạ thì dùng luôn tên field làm nhãn.
  const FIELD_LABELS = {
    orderId: 'Mã đơn hàng',
    orderInfo: 'Nội dung đơn hàng',
    transId: 'Mã giao dịch MoMo',
    requestId: 'Request ID',
    payType: 'Hình thức thanh toán',
    orderType: 'Loại đơn hàng',
    partnerCode: 'Partner Code',
    resultCode: 'Result Code',
    message: 'Thông báo từ MoMo',
    localMessage: 'Thông báo (local)',
    responseTime: 'Thời gian MoMo phản hồi',
    extraData: 'Extra Data',
    signature: 'Signature',
    lang: 'Ngôn ngữ',
    source: 'Nguồn tạo đơn (hệ thống)',
    status: 'Trạng thái lưu (hệ thống)',
    createdAt: 'Thời gian tạo đơn',
    paidAt: 'Thời gian thanh toán',
    refundTrans: 'Số lần hoàn tiền',
  }
  const FIELD_ORDER = [
    'orderId', 'orderInfo', 'transId', 'requestId', 'payType', 'orderType',
    'partnerCode', 'resultCode', 'message', 'localMessage', 'responseTime',
    'extraData', 'signature', 'lang', 'source', 'status', 'createdAt', 'paidAt', 'refundTrans',
  ]
  const MONO_FIELDS = new Set(['requestId', 'signature', 'extraData', 'transId'])
  const FULL_FIELDS = new Set(['orderInfo', 'signature', 'extraData', 'message', 'localMessage'])

  const formatFieldValue = (key, value) => {
    if (Array.isArray(value)) return value.length ? `${value.length} lần` : null
    if (typeof value === 'object' && value !== null) return JSON.stringify(value)
    if (key === 'amount') return value > 0 ? `${fmt(value)} ₫` : null
    if (key === 'responseTime') return fmtTime(value) || String(value)
    if (key === 'createdAt' || key === 'paidAt') {
      const d = new Date(value)
      return isNaN(d.getTime()) ? String(value) : d.toLocaleString('vi-VN')
    }
    return String(value)
  }

  // Trả về danh sách [{key, label, value, mono, full}] đã sắp theo FIELD_ORDER,
  // field lạ không nằm trong danh sách quen thì xếp cuối, sort theo tên.
  // skipKeys: field không muốn lặp lại (vd 'amount' nếu đã có hero box riêng).
  const buildFieldRows = (data, skipKeys = []) => {
    const skip = new Set(skipKeys)
    const keys = Object.keys(data || {}).filter(k => {
      if (skip.has(k)) return false
      const v = data[k]
      return v !== undefined && v !== null && v !== ''
    })
    const ordered = [
      ...FIELD_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !FIELD_ORDER.includes(k)).sort(),
    ]
    return ordered
      .map(key => ({
        key,
        label: FIELD_LABELS[key] || key,
        value: formatFieldValue(key, data[key]),
        mono: MONO_FIELDS.has(key),
        full: FULL_FIELDS.has(key),
      }))
      .filter(row => row.value)
  }

  const META = {
    loading: { spin: true,  title: 'Đang xác nhận…',          sub: 'Vui lòng không đóng trang',              accent: '#ae0070', bg: '#fdf5f9' },
    success: { icon: '✓',   title: 'Thanh toán thành công!',   sub: 'Giao dịch đã được MoMo xác nhận',        accent: '#16a34a', bg: 'rgba(232, 245, 233, 0.85)' },
    failed:  { icon: '✕',   title: 'Giao dịch thất bại',       sub: null,                                      accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
    pending: { icon: '⏳',  title: 'Đang chờ xác nhận',        sub: 'MoMo chưa phản hồi, kiểm tra lại sau',   accent: '#d97706', bg: 'rgba(255, 243, 224, 0.85)' },
    error:   { icon: '!',   title: 'Không tìm thấy đơn hàng',  sub: 'Link không hợp lệ hoặc đã hết hạn',      accent: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
  }
  const m = META[status] || META.loading

  const InfoTile = ({ label, value, full, mono }) => (
    <div
      className={`rounded-xl border border-[rgba(174,0,112,0.08)] bg-white/60 px-4 py-3 ${
        full ? 'col-span-full' : ''
      }`}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`break-all font-bold text-[var(--text)] ${
          mono ? 'font-mono text-xs' : 'text-sm'
        }`}
      >
        {value}
      </p>
    </div>
  )

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/png" href="/result.png" /> 
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

        <div
          ref={cardRef}
          className="relative z-[2] grid w-full max-w-[clamp(340px,94vw,1180px)] grid-cols-1 overflow-hidden rounded-[20px] border border-white/70 bg-[var(--surface)] shadow-[0_30px_60px_rgba(174,0,112,0.1),0_1px_2px_rgba(0,0,0,0.02)] backdrop-blur-[25px] will-change-transform md:grid-cols-[0.8fr_1.2fr] md:rounded-3xl"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
        >
          <div className="absolute inset-x-0 top-0 z-[3] h-1 bg-gradient-to-r from-[#ff9cb7] via-[var(--mm)] to-[#dfb2ea]" />
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
              <div className="mb-6 space-y-4">
                {info.amount > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-[#fff0f6] to-[#ffe3ef] px-5 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Số tiền
                    </p>
                    <p className="text-3xl font-black text-[var(--mm)]">
                      {fmt(info.amount)} <span className="text-xl">₫</span>
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {buildFieldRows(info, ['amount']).map(row => (
                    <InfoTile key={row.key} label={row.label} value={row.value} mono={row.mono} full={row.full} />
                  ))}
                </div>
              </div>
            )}

            {status === 'failed' && info?.resultCode && (
              <div className="mb-6 space-y-4">
                <div className="rounded-2xl bg-gradient-to-br from-[#fff1f1] to-[#ffe2e2] px-5 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Mã lỗi hệ thống
                  </p>
                  <p className="text-2xl font-black text-[#dc2626]">{info.resultCode}</p>
                </div>

                {info.message && (
                  <div className="rounded-2xl border border-[#fecaca] bg-[#fff5f5] px-5 py-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#dc2626]">
                      Nguyên nhân
                    </p>
                    <p className="text-sm font-medium leading-relaxed text-[var(--text)]">
                      {info.message}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {buildFieldRows(info, ['message']).map(row => (
                    <InfoTile key={row.key} label={row.label} value={row.value} mono={row.mono} full={row.full} />
                  ))}
                </div>
              </div>
            )}

            {status === 'loading' && (
              <div className="px-0 py-5 text-center text-sm text-[var(--muted)]">
                <p>Đang đồng bộ dữ liệu kết quả từ MoMo...</p>
              </div>
            )}

            {status === 'success' && (
              <button
                type="button"
                onClick={() => window.close()}
                className="flex w-full items-center justify-center rounded-2xl bg-[var(--mm)] py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-0.5 hover:bg-[var(--mm-dark)] hover:shadow-[0_12px_28px_rgba(174,0,112,0.3)]"
              >
                Xác nhận giao dịch
              </button>
            )}

            {status === 'failed' && (
              <a
                href={buildRetryUrl(info)}
                className="flex w-full items-center justify-center rounded-2xl bg-[var(--mm)] py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-0.5 hover:bg-[var(--mm-dark)] hover:shadow-[0_12px_28px_rgba(174,0,112,0.3)]"
              >
                Thử thanh toán lại
              </a>
            )}

            {(status === 'failed' || status === 'pending' || status === 'error') && (
              <button
                type="button"
                onClick={() => window.close()}
                className="mt-3 w-full text-center text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
              >
                Đóng tab này
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}