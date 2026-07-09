// pages/result.js
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── Helpers ────────────────────────────────────────────────────────────────

function notifyOtherTabs(orderId, status) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return
  try {
    const ch = new BroadcastChannel('momo-result')
    ch.postMessage({ type: 'momo-result-done', orderId, status })
    ch.close()
  } catch (e) {
    console.error('BroadcastChannel error:', e)
  }
}

// Trang này phục vụ cả KHÁCH lẫn ADMIN mở CHUNG một link kết quả, nhưng KHÔNG
// còn phân biệt quyền admin theo kiểu "cùng trình duyệt có cookie thì thấy
// thêm" nữa. Thay vào đó chia theo LUỒNG GIAO DỊCH:
//  - P2P (chuyển khoản): khách và admin xem THẤY GIỐNG NHAU — chỉ dữ liệu cần
//    thiết cho 1 đơn (qua /api/momo/status, endpoint public, an toàn cho khách).
//    KHÔNG gọi /api/momo/query cho luồng này nữa, dù người mở link có phải admin
//    hay không, để tránh việc admin vô tình thấy nhiều hơn khách trên cùng 1 đơn.
//  - Scan QR: trang kết quả trong luồng này trên thực tế CHỈ được mở bởi máy/trình
//    duyệt của admin (chính admin cầm máy quét), nên không cần kiểm tra quyền gì
//    thêm — cứ gọi /api/momo/query như bình thường, cookie phiên admin đã có sẵn
//    trên máy đó nên request tự thành công.
//  - Nếu vì lý do nào đó /query vẫn trả 401 (không phải admin), ta bỏ qua kết quả
//    một cách IM LẶNG, không throw, không hiện lỗi ra UI.
async function fetchFullInfo(query, { includeQuery = true } = {}) {
  const orderId = query.orderId
  if (!orderId) return null

  const statusPromise = fetch(`/api/momo/status?orderId=${encodeURIComponent(orderId)}`)
    .then(r => r.json())
    .catch(() => null)

  // Luồng P2P: không gọi /query — status.js là đủ và là TẤT CẢ những gì khách
  // lẫn admin nên thấy cho đơn P2P.
  if (!includeQuery) {
    const statusData = await statusPromise
    return statusData || null
  }

  // credentials mặc định của fetch same-origin đã tự gửi kèm cookie phiên (nếu có).
  const queryPromise = fetch(`/api/momo/query?orderId=${encodeURIComponent(orderId)}`)
    .then(r => (r.ok ? r.json() : null)) // 401 -> null, im lặng bỏ qua
    .catch(() => null)

  const [statusData, momoFull] = await Promise.all([statusPromise, queryPromise])
  if (!statusData && !momoFull) return null
  return { ...(statusData || {}), ...(momoFull || {}) }
}

// Xác định 1 đơn có phải luồng P2P (chuyển khoản) hay không, dựa trên payType
// hoặc source — dùng để quyết định có gọi /api/momo/query (admin-gated) hay không,
// và field nào được phép hiện trong "Thông tin chi tiết".
function isP2pFlow(data) {
  if (!data) return false
  if (data.payType === 'p2p' || data.payType === 'bank_transfer') return true
  const src = typeof data.source === 'string' ? data.source.toLowerCase() : ''
  if (src.includes('p2p')) return true
  return false
}

const fmt = n => {
  const num = parseInt(n)
  return isNaN(num) ? String(n) : num.toLocaleString('vi-VN')
}

const fmtTime = val => {
  if (val === undefined || val === null || val === '') return null
  const d = new Date(typeof val === 'number' || /^\d+$/.test(val) ? parseInt(val) : val)
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString('vi-VN')
}

const PAY_TYPE_LABEL = {
  wallet: 'Ví MoMo',
  napas: 'Thẻ ATM / Napas',
  credit: 'Thẻ tín dụng',
  pos: 'POS Scan',
  qr: 'Quét mã QR',
  scan: 'Quét mã QR',
  p2p: 'Chuyển khoản P2P',
  bank_transfer: 'Chuyển khoản ngân hàng',
  atm: 'Thẻ ATM nội địa',
}

// Các field đã được hiển thị "trang trọng" riêng ở phần trên của thẻ kết quả —
// không lặp lại chúng ở khu vực "Thông tin chi tiết" bên dưới.
const CURATED_KEYS = new Set(['orderId', 'orderInfo', 'transId', 'payType', 'amount', 'message', 'resultCode', 'paidAt'])

// Không bao giờ hiển thị các field nhạy cảm / nội bộ này ra UI.
const HIDDEN_KEYS = new Set(['signature', 'accessKey', 'secretKey', 'partnerAccessToken', 'raw', 'lang', 'ipnUrl', 'redirectUrl'])

// Luồng P2P: khách và admin xem GIỐNG NHAU, chỉ hiện field thật sự cần thiết
// cho 1 đơn (không hiện field nội bộ như storeId, terminalId, merchantName,
// requestId, partnerCode... dù ai đang xem đi nữa).
const P2P_EXTRA_ALLOWED_KEYS = new Set(['payUrl', 'qrCodeImage', 'status', 'createdAt', 'source'])

const TIME_KEYS = new Set(['responseTime', 'paidAt', 'createdAt', 'updatedAt', 'requestTime', 'transDate', 'payDate'])

const FIELD_LABELS = {
  orderId: 'Mã đơn hàng',
  requestId: 'Mã yêu cầu',
  partnerCode: 'Mã đối tác',
  transId: 'Mã giao dịch MoMo',
  orderInfo: 'Nội dung',
  orderType: 'Loại đơn hàng',
  payType: 'Hình thức thanh toán',
  amount: 'Số tiền',
  resultCode: 'Mã kết quả',
  message: 'Thông báo',
  responseTime: 'Thời gian phản hồi',
  paidAt: 'Thời gian thanh toán',
  createdAt: 'Thời gian tạo',
  updatedAt: 'Cập nhật lúc',
  extraData: 'Dữ liệu bổ sung',
  bankCode: 'Ngân hàng',
  cardType: 'Loại thẻ',
  storeId: 'Mã cửa hàng',
  storeName: 'Cửa hàng',
  terminalId: 'Mã máy POS',
  merchantName: 'Merchant',
  status: 'Trạng thái',
  transType: 'Loại giao dịch',
  refundTrans: 'Giao dịch hoàn tiền',
  payUrl: 'Link thanh toán',
  qrCodeImage: 'Mã QR',
}

// Các field cần render đặc biệt (không phải text thường) trong ExtraInfo.
const SPECIAL_RENDER_KEYS = new Set(['payUrl', 'qrCodeImage'])

// camelCase / snake_case -> "Camel Case" khi gặp field lạ không có trong FIELD_LABELS
function humanizeKey(key) {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function looksLikeId(key) {
  return /id$|code$|trans|signature|token/i.test(key)
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  if (TIME_KEYS.has(key) || /At$|Time$|Date$/.test(key)) {
    const t = fmtTime(value)
    if (t) return t
  }
  if (key === 'amount' || /amount$/i.test(key)) {
    return `${fmt(value)} ₫`
  }
  return String(value)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ResultPage() {
  const router = useRouter()
  const [status, setStatus] = useState('loading') // loading | success | failed | pending | expired | error
  const [info, setInfo] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const resolvedRef = useRef(false)
  const pollRef = useRef(null)
  const lastQueryRef = useRef({})
  // Giữ bản sao "info" mới nhất ngoài state, để đọc được NGAY (không bị stale
  // do closure) ở những nơi cần biết luồng P2P hay không trước khi setState kịp áp dụng.
  const infoRef = useRef(null)
  const updateInfo = useCallback((updater) => {
    setInfo(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      infoRef.current = next
      return next
    })
  }, [])

  // ── Main logic: đọc query / poll (redirect flow lẫn P2P / quét QR) ──
  useEffect(() => {
    if (!router.isReady) return
    if (resolvedRef.current) return

    const fullQuery = { ...router.query }
    let { orderId, requestId, partnerCode, resultCode, transId, amount, payType, message } = fullQuery
    const code = resultCode !== undefined ? parseInt(resultCode) : undefined

    // Với luồng P2P / quét QR, có thể không có orderId ngay trong URL —
    // dùng requestId hoặc lấy lại từ sessionStorage đã lưu lúc tạo đơn.
    if (!orderId && typeof window !== 'undefined') {
      orderId = sessionStorage.getItem('momo_current_order_id')
    }
    if (!requestId && typeof window !== 'undefined') {
      requestId = requestId || sessionStorage.getItem('momo_current_request_id')
    }
    if (!orderId && !requestId) {
      setStatus('error'); resolvedRef.current = true; return
    }

    const trackingId = orderId || requestId
    const mergedQuery = { ...fullQuery, orderId: orderId || fullQuery.orderId, requestId }
    lastQueryRef.current = mergedQuery

    const cleanUrl = () => setTimeout(() => router.replace('/result', undefined, { shallow: true }), 500)

    const resolve = (st, infoData) => {
      resolvedRef.current = true
      setStatus(st)
      // Giữ lại mọi field đã có trong query (kể cả field lạ của P2P/QR) rồi mới
      // merge dữ liệu chi tiết trả về từ API, để không mất bất kỳ thông tin nào.
      updateInfo(prev => ({ ...mergedQuery, ...(prev || {}), ...infoData }))
      notifyOtherTabs(trackingId, st === 'success' ? 'success' : 'failed')
      // P2P: bỏ qua /api/momo/query (admin-gated) — khách và admin chỉ nên thấy
      // dữ liệu từ /status, giống hệt nhau. Scan QR: gọi như bình thường vì trên
      // thực tế chỉ admin (máy quét) mở trang này.
      const skipAdminQuery = isP2pFlow({ ...mergedQuery, ...infoData })
      fetchFullInfo(mergedQuery, { includeQuery: !skipAdminQuery }).then(full => { if (full) updateInfo(prev => ({ ...prev, ...full })) })
    }

    if (code !== undefined) {
      // ── Luồng redirect trực tiếp (ví MoMo, thẻ, và cả P2P/QR khi MoMo
      // redirect kèm resultCode) ──
      if (typeof window !== 'undefined') {
        if (orderId) sessionStorage.setItem('momo_current_order_id', orderId)
        if (requestId) sessionStorage.setItem('momo_current_request_id', requestId)
      }
      const infoData = {
        ...mergedQuery,
        orderId,
        transId,
        amount: amount !== undefined ? parseInt(amount) : undefined,
        payType,
        message,
        resultCode: code,
      }
      resolve(code === 0 ? 'success' : 'failed', infoData)
      fetch('/api/momo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fullQuery, resultCode: code === 0 ? 0 : code }),
      }).finally(cleanUrl)
    } else {
      // ── Luồng không có resultCode ngay: đơn được tạo bằng mã QR / P2P và
      // trang phải poll trạng thái. KHÔNG tự đóng, KHÔNG dừng hẳn sau vài lần —
      // chuyển sang "pending" sau pha nhanh rồi tiếp tục poll nền chậm hơn để
      // vẫn tự cập nhật khi khách quét/chuyển khoản xong. ──
      let attempts = 0
      // Poll đều mỗi 1 giây trong suốt quá trình chờ — khớp với nhịp poll
      // 1s đang dùng ở /pay/[orderId] (status.js) và admin dashboard, để
      // kết quả hiện ra ngay khi có phản hồi thay vì phải đợi thêm.
      // FAST_ATTEMPTS chỉ còn tác dụng đổi UI text/màu sang "đang chờ" sau
      // ~10s đầu (poll vẫn tiếp tục đều đặn, không đổi nhịp).
      const FAST_ATTEMPTS = 10
      const FAST_INTERVAL = 1000
      const SLOW_INTERVAL = 1000

      const runPoll = async () => {
        try {
          // status.js chỉ đọc orderId từ query string — các field khác (requestId,
          // partnerCode...) không được backend dùng tới nên không cần gửi lên.
          const pollOrderId = mergedQuery.orderId
          if (!pollOrderId) return
          const res = await fetch(`/api/momo/status?orderId=${encodeURIComponent(pollOrderId)}`)
          const data = await res.json()

          if (data.status === 'PAID') {
            resolve('success', data); clearInterval(pollRef.current); cleanUrl(); return
          }
          if (data.status === 'FAILED') {
            resolve('failed', data); clearInterval(pollRef.current); cleanUrl(); return
          }
          if (data.status === 'EXPIRED') {
            resolvedRef.current = true
            updateInfo(prev => ({ ...mergedQuery, ...(prev || {}), ...data }))
            setStatus('expired')
            clearInterval(pollRef.current); cleanUrl(); return
          }

          attempts++
          if (attempts === FAST_ATTEMPTS) {
            // Không dừng poll, chỉ đổi UI sang "đang chờ" và poll chậm lại.
            updateInfo(prev => ({ ...mergedQuery, ...(prev || {}), ...data }))
            setStatus('pending')
            clearInterval(pollRef.current)
            pollRef.current = setInterval(runPoll, SLOW_INTERVAL)
          } else {
            updateInfo(prev => ({ ...mergedQuery, ...(prev || {}), ...data }))
          }
        } catch (e) {
          console.error('Poll error:', e)
        }
      }

      pollRef.current = setInterval(runPoll, FAST_INTERVAL)
      runPoll()
      return () => clearInterval(pollRef.current)
    }
  }, [router.isReady, router.query])

  // Nút "Kiểm tra lại" thủ công cho trạng thái pending/expired/error.
  const checkNow = useCallback(async () => {
    const q = lastQueryRef.current
    if (!q || (!q.orderId && !q.requestId)) return
    setRefreshing(true)
    try {
      const skipAdminQuery = isP2pFlow({ ...q, ...(infoRef.current || {}) })
      const full = await fetchFullInfo(q, { includeQuery: !skipAdminQuery })
      if (full) {
        updateInfo(prev => ({ ...(prev || {}), ...full }))
        if (full.status === 'PAID' || full.resultCode === 0) {
          setStatus('success')
          notifyOtherTabs(q.orderId || q.requestId, 'success')
          clearInterval(pollRef.current)
        } else if (full.status === 'FAILED') {
          setStatus('failed')
          notifyOtherTabs(q.orderId || q.requestId, 'failed')
          clearInterval(pollRef.current)
        } else if (full.status === 'EXPIRED') {
          setStatus('expired')
          clearInterval(pollRef.current)
        }
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  const handleClose = () => {
    if (typeof window === 'undefined') return
    try { window.close() } catch (e) { /* ignore */ }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isSuccess = status === 'success'
  const isFailed = status === 'failed'

  const accentColor = isSuccess ? '#16a34a' : isFailed ? '#dc2626' : status === 'pending' ? '#d97706' : '#ae0070'

  const isP2p = isP2pFlow(info)

  const extraEntries = info
    ? Object.entries(info).filter(([k, v]) => {
        if (HIDDEN_KEYS.has(k) || CURATED_KEYS.has(k)) return false
        if (v === undefined || v === null || v === '') return false
        // P2P: khách và admin thấy giống nhau, chỉ field thật sự cần thiết.
        if (isP2p && !P2P_EXTRA_ALLOWED_KEYS.has(k)) return false
        return true
      })
    : []

  return (
    <>
      <Head>
        <title>Kết quả giao dịch · MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/result.png" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Be Vietnam Pro', sans-serif; }
          html, body { height: 100%; background: #f4edf1; }

          @keyframes rot    { to { transform: rotate(360deg); } }
          @keyframes pop    { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes slideup{ from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
          @keyframes om1    { 0%{transform:translate(0,0)scale(1)}50%{transform:translate(8vw,4vh)scale(1.15)}100%{transform:translate(-4vw,7vh)scale(.9)} }
          @keyframes om2    { 0%{transform:translate(0,0)scale(1.1)}50%{transform:translate(-10vw,-6vh)scale(.9)}100%{transform:translate(6vw,4vh)scale(1.1)} }
          @keyframes om3    { 0%{transform:translate(0,0)scale(.9)}50%{transform:translate(-5vw,7vh)scale(1.2)}100%{transform:translate(7vw,-4vh)scale(1)} }

          .page   { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow: hidden; }
          .blob   { position: absolute; border-radius: 50%; filter: blur(55px); pointer-events: none; z-index: 0; }
          .card   { position: relative; z-index: 1; width: 100%; max-width: 420px; background: #fff; border-radius: 24px; box-shadow: 0 20px 60px rgba(174,0,112,.18); overflow: hidden; animation: pop .35s ease both; }
          .topbar { height: 4px; background: linear-gradient(90deg, #ae0070, #d6409f); }
          .body   { padding: 28px 24px 24px; }

          .spin-ring { width: 44px; height: 44px; border: 4px solid #f0d6e8; border-top-color: #ae0070; border-radius: 50%; margin: 0 auto 16px; animation: rot .8s linear infinite; }
          .spin-ring.sm { width: 16px; height: 16px; border-width: 2.5px; margin: 0; display: inline-block; vertical-align: middle; }

          .icon-wrap { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }

          .amount-box { background: #faf4f8; border-radius: 16px; padding: 16px; text-align: center; margin: 16px 0; }
          .amount-box .label { font-size: 12px; color: #9b4470; font-weight: 600; margin-bottom: 4px; }
          .amount-box .value { font-size: 28px; font-weight: 900; color: #1a0413; }
          .amount-box .value span { font-size: 16px; font-weight: 700; margin-left: 2px; }

          .info-list { margin: 16px 0; }
          .info-row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f4e6ee; font-size: 13px; }
          .info-row:last-child { border-bottom: none; }
          .info-row .k { color: #9b4470; flex-shrink: 0; padding-top: 6px; }
          .info-row .v { color: #1a0413; font-weight: 600; text-align: right; word-break: break-all; min-width: 0; }
          .info-row .v.mono { font-family: monospace; font-size: 12px; }

          .v-wrap { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; min-width: 0; }

          .copy-btn {
            flex-shrink: 0; width: 32px; height: 32px;
            display: inline-flex; align-items: center; justify-content: center;
            border: none; border-radius: 9px; background: #faf0f6; color: #ae0070;
            cursor: pointer; transition: background .15s ease, color .15s ease, transform .1s ease;
          }
          .copy-btn:hover  { background: #f4d9ec; }
          .copy-btn:active { transform: scale(.88); }
          .copy-btn.copied { background: #dcfce7; color: #16a34a; }
          .copy-btn:focus-visible { outline: 2px solid #ae0070; outline-offset: 2px; }

          .reveal { animation: slideup .35s ease both; }

          details.extra { margin-top: 4px; border-top: 1px dashed #f0d6e8; padding-top: 10px; }
          details.extra > summary { cursor: pointer; font-size: 12.5px; font-weight: 700; color: #ae0070; list-style: none; display: flex; align-items: center; gap: 6px; user-select: none; }
          details.extra > summary::-webkit-details-marker { display: none; }
          details.extra > summary::before { content: '▸'; transition: transform .15s ease; display: inline-block; }
          details.extra[open] > summary::before { transform: rotate(90deg); }
          details.extra .info-list { margin-top: 6px; }

          .btn-row { display: flex; gap: 10px; margin-top: 18px; }
          .btn { flex: 1; border: none; border-radius: 12px; padding: 12px 14px; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: transform .1s ease, opacity .15s ease; display: flex; align-items: center; justify-content: center; gap: 6px; }
          .btn:active { transform: scale(.97); }
          .btn:disabled { opacity: .6; cursor: default; }
          .btn.primary { background: #ae0070; color: #fff; }
          .btn.primary:hover { background: #97005f; }
          .btn.secondary { background: #faf0f6; color: #ae0070; }
          .btn.secondary:hover { background: #f4d9ec; }

          .hint { font-size: 11.5px; color: #9b4470; text-align: center; margin-top: 10px; line-height: 1.5; }

          /* ── payUrl row (buttons instead of raw link text) ── */
          .url-row { padding: 10px 0; border-bottom: 1px solid #f4e6ee; }
          .url-row .k { color: #9b4470; font-size: 13px; margin-bottom: 8px; display: block; }
          .url-actions { display: flex; gap: 8px; flex-wrap: wrap; }
          .url-btn {
            flex: 1; min-width: 120px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            border: none; border-radius: 10px; padding: 9px 12px; font-size: 12.5px; font-weight: 700;
            cursor: pointer; transition: background .15s ease, color .15s ease, transform .1s ease;
            background: #faf0f6; color: #ae0070;
          }
          .url-btn:hover { background: #f4d9ec; }
          .url-btn:active { transform: scale(.96); }
          .url-btn.copied { background: #dcfce7; color: #16a34a; }
          .url-btn.open { background: #ae0070; color: #fff; }
          .url-btn.open:hover { background: #97005f; }

          /* ── qrCodeImage row (render actual image, not base64 text) ── */
          .qr-row { padding: 10px 0; border-bottom: 1px solid #f4e6ee; text-align: center; }
          .qr-row .k { color: #9b4470; font-size: 13px; margin-bottom: 10px; display: block; text-align: left; }
          .qr-row img { width: 100%; max-width: 220px; border-radius: 12px; border: 1px solid #f4e6ee; padding: 8px; background: #fff; }

          /* ── Small phones (≤360px) — tighten spacing so nothing feels cramped ── */
          @media (max-width: 360px) {
            .page { padding: 14px; }
            .body { padding: 24px 18px 20px; }
            .amount-box .value { font-size: 25px; }
          }

          /* ── Tablet / desktop — a little more breathing room, same identity ── */
          @media (min-width: 640px) {
            .card { max-width: 460px; }
            .body { padding: 34px 32px 28px; }
            .amount-box .value { font-size: 30px; }
            .copy-btn:hover { background: #efc9e4; }
          }

          @media (prefers-reduced-motion: reduce) {
            .blob, .card, .reveal { animation: none !important; }
          }

          .err-box { background: #fef2f2; border-radius: 14px; padding: 14px; margin: 16px 0; }
          .err-box .err-code { font-size: 12px; font-weight: 700; color: #dc2626; margin-bottom: 4px; }
          .err-box .err-msg  { font-size: 13px; color: #7f1d1d; line-height: 1.5; }

          .pay-badge { display: inline-flex; align-items: center; gap: 5px; background: #faf0f6; color: #ae0070; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; margin: 0 auto 14px; }

          /* pending/error/loading */
          .center-msg { text-align: center; padding: 24px 0 8px; }
          .center-msg .icon { font-size: 40px; margin-bottom: 12px; }
          .center-msg h2  { font-size: 20px; font-weight: 800; color: #1a0413; margin-bottom: 8px; }
          .center-msg p   { font-size: 13px; color: #614655; line-height: 1.6; }

          /* logo row */
          .logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
          .logo-row img { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; }
          .logo-row span { font-size: 14px; font-weight: 800; color: #1a0413; letter-spacing: -.2px; }
        `}</style>
      </Head>

      <div className="page">
        {/* Blobs */}
        <div className="blob" style={{ width:'50vw', height:'50vw', top:'-8%', left:'-8%', background:'#ff9cb7', opacity:.55, animation:'om1 5s infinite alternate ease-in-out' }} />
        <div className="blob" style={{ width:'55vw', height:'55vw', bottom:'-8%', right:'-8%', background:'#b0bec5', opacity:.5, animation:'om2 7s infinite alternate ease-in-out' }} />
        <div className="blob" style={{ width:'40vw', height:'40vw', top:'25%', right:'-5%', background:'#dfb2ea', opacity:.55, animation:'om3 6s infinite alternate ease-in-out' }} />

        <div className="card">
          <div className="topbar" />
          <div className="body">

            {/* Logo */}
            <div className="logo-row">
              <img src="/Main.png" alt="Logo" />
              <span>IPA · Kết quả giao dịch</span>
            </div>

            {/* ── LOADING ── */}
            {status === 'loading' && (
              <div className="center-msg">
                <div className="spin-ring" />
                <h2 style={{ color: '#ae0070' }}>Đang xác nhận…</h2>
                <p style={{ marginTop: 8 }}>Vui lòng không đóng trang này</p>
              </div>
            )}

            {/* ── SUCCESS ── */}
            {isSuccess && (
              <div className="reveal">
                <div className="icon-wrap" style={{ background: 'rgba(220,252,231,.7)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#16a34a" opacity=".12"/>
                    <path d="M6 12.5l4 4 8-8" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ textAlign:'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>Thanh toán thành công!</div>
                  <div style={{ fontSize: 13, color: '#614655', marginTop: 4 }}>Giao dịch đã được MoMo xác nhận</div>
                </div>

                {info?.payType && (
                  <div style={{ textAlign: 'center' }}>
                    <span className="pay-badge">{PAY_TYPE_LABEL[info.payType] || info.payType}</span>
                  </div>
                )}

                {info?.amount > 0 && (
                  <div className="amount-box">
                    <div className="label">Số tiền thanh toán</div>
                    <div className="value">{fmt(info.amount)}<span>₫</span></div>
                  </div>
                )}

                <div className="info-list">
                  {info?.orderId && <InfoRow k="Mã đơn hàng" v={info.orderId} mono copyable />}
                  {info?.orderInfo && <InfoRow k="Nội dung" v={info.orderInfo} />}
                  {info?.transId && <InfoRow k="Mã giao dịch MoMo" v={String(info.transId)} mono copyable />}
                  {info?.payType && <InfoRow k="Hình thức" v={PAY_TYPE_LABEL[info.payType] || info.payType} />}
                  {info?.paidAt && <InfoRow k="Thời gian" v={fmtTime(info.paidAt)} />}
                </div>

                <ExtraInfo entries={extraEntries} />
                <ActionButtons onClose={handleClose} />
              </div>
            )}

            {/* ── FAILED ── */}
            {isFailed && (
              <div className="reveal">
                <div className="icon-wrap" style={{ background: 'rgba(254,226,226,.7)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#dc2626" opacity=".12"/>
                    <path d="M8 8l8 8M16 8l-8 8" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{ textAlign:'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>Giao dịch thất bại</div>
                </div>

                <div className="err-box">
                  {info?.resultCode !== undefined && <div className="err-code">#{info.resultCode}</div>}
                  <div className="err-msg">{info?.message || 'Giao dịch không thành công'}</div>
                </div>

                <div className="info-list">
                  {info?.orderId && <InfoRow k="Mã đơn hàng" v={info.orderId} mono copyable />}
                  {info?.orderInfo && <InfoRow k="Nội dung" v={info.orderInfo} />}
                  {info?.amount > 0 && <InfoRow k="Số tiền" v={`${fmt(info.amount)} ₫`} />}
                  {info?.payType && <InfoRow k="Hình thức" v={PAY_TYPE_LABEL[info.payType] || info.payType} />}
                </div>

                <ExtraInfo entries={extraEntries} />
                <ActionButtons onRetry={checkNow} retrying={refreshing} onClose={handleClose} />
              </div>
            )}

            {/* ── EXPIRED ── */}
            {status === 'expired' && (
              <div className="center-msg">
                <div className="icon">⏰</div>
                <h2 style={{ color: '#d97706' }}>Giao dịch đã hết hạn</h2>
                <p>Link/QR thanh toán này không còn hiệu lực.<br />Vui lòng tạo đơn hàng mới.</p>
                <div className="info-list">
                  {info?.orderId && <InfoRow k="Mã đơn hàng" v={info.orderId} mono copyable />}
                </div>
                <ExtraInfo entries={extraEntries} />
                <ActionButtons onRetry={checkNow} retrying={refreshing} onClose={handleClose} />
              </div>
            )}

            {/* ── PENDING (đang chờ quét QR / chuyển khoản P2P xác nhận) ── */}
            {status === 'pending' && (
              <div className="center-msg">
                <div className="spin-ring" style={{ borderTopColor: '#d97706' }} />
                <h2 style={{ color: '#d97706' }}>Đang chờ xác nhận</h2>
                <p>Hệ thống vẫn đang tự động kiểm tra giao dịch.<br />Nếu bạn vừa quét mã QR hoặc chuyển khoản P2P, vui lòng đợi trong giây lát.</p>
                <div className="info-list">
                  {info?.orderId && <InfoRow k="Mã đơn hàng" v={info.orderId} mono copyable />}
                  {info?.requestId && <InfoRow k="Mã yêu cầu" v={info.requestId} mono copyable />}
                  {info?.amount > 0 && <InfoRow k="Số tiền" v={`${fmt(info.amount)} ₫`} />}
                  {info?.payType && <InfoRow k="Hình thức" v={PAY_TYPE_LABEL[info.payType] || info.payType} />}
                </div>
                <ExtraInfo entries={extraEntries} />
                <ActionButtons onRetry={checkNow} retrying={refreshing} onClose={handleClose} />
                <div className="hint">Trang sẽ tự cập nhật khi có kết quả — bạn không cần tải lại.</div>
              </div>
            )}

            {/* ── ERROR ── */}
            {status === 'error' && (
              <div className="center-msg">
                <div className="icon">❗</div>
                <h2>Không tìm thấy đơn hàng</h2>
                <p>Link không hợp lệ hoặc đã hết hạn.</p>
                <ActionButtons onClose={handleClose} />
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function InfoRow({ k, v, mono, copyable }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleCopy = async () => {
    if (!v) return
    try {
      await navigator.clipboard.writeText(String(v))
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1400)
    } catch (e) {
      console.error('Không sao chép được:', e)
    }
  }

  return (
    <div className="info-row">
      <span className="k">{k}</span>
      <span className="v-wrap">
        <span className={`v${mono ? ' mono' : ''}`}>{v}</span>
        {copyable && (
          <button
            type="button"
            className={`copy-btn${copied ? ' copied' : ''}`}
            onClick={handleCopy}
            aria-label={copied ? `Đã sao chép ${k}` : `Sao chép ${k}`}
            title={copied ? 'Đã sao chép' : 'Sao chép'}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </button>
        )}
      </span>
    </div>
  )
}

// Hiển thị TẤT CẢ các field còn lại lấy được từ query / API mà chưa được
// hiển thị "trang trọng" ở trên — gấp gọn trong <details> để card không bị dài.
function ExtraInfo({ entries }) {
  if (!entries || entries.length === 0) return null
  return (
    <details className="extra">
      <summary>Thông tin chi tiết ({entries.length})</summary>
      <div className="info-list">
        {entries.map(([k, v]) => {
          const label = FIELD_LABELS[k] || humanizeKey(k)

          if (SPECIAL_RENDER_KEYS.has(k) && typeof v === 'string' && v) {
            if (k === 'payUrl') return <PayUrlRow key={k} label={label} url={v} />
            if (k === 'qrCodeImage') return <QrImageRow key={k} label={label} src={v} />
          }

          const display = formatValue(k, v)
          if (display === null) return null
          return (
            <InfoRow
              key={k}
              k={label}
              v={display}
              mono={looksLikeId(k)}
              copyable={looksLikeId(k)}
            />
          )
        })}
      </div>
    </details>
  )
}

// Link thanh toán (payUrl) -> hiện dạng 2 nút bấm thay vì chuỗi URL dài lê thê.
function PayUrlRow({ label, url }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1400)
    } catch (e) {
      console.error('Không sao chép được:', e)
    }
  }

  return (
    <div className="url-row">
      <span className="k">{label}</span>
      <div className="url-actions">
        <button type="button" className={`url-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
          {copied ? <IconCheck /> : <IconCopy />} {copied ? 'Đã sao chép' : 'Sao chép URL'}
        </button>
        <a className="url-btn open" href={url} target="_blank" rel="noopener noreferrer">
          Mở link ↗
        </a>
      </div>
    </div>
  )
}

// Mã QR (qrCodeImage) -> chuỗi giá trị chính là dữ liệu ảnh (base64), hiển thị
// trực tiếp thành ảnh QR để khách quét chuyển khoản P2P thay vì hiện text thô.
function QrImageRow({ label, src }) {
  const imgSrc = src.startsWith('data:') ? src : `data:image/png;base64,${src}`
  return (
    <div className="qr-row">
      <span className="k">{label}</span>
      <img src={imgSrc} alt="QR thanh toán" />
    </div>
  )
}

function ActionButtons({ onRetry, retrying, onClose }) {
  return (
    <div className="btn-row">
      {onRetry && (
        <button type="button" className="btn secondary" onClick={onRetry} disabled={retrying}>
          {retrying ? <span className="spin-ring sm" /> : '🔄'} Kiểm tra lại
        </button>
      )}
      <button type="button" className="btn primary" onClick={onClose}>
        Đóng trang
      </button>
    </div>
  )
}