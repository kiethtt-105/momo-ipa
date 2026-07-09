// pages/pay/[orderId].js
//
// Trang thanh toán công khai cho khách quét mã:
//   - QR: lấy THẲNG ảnh PNG từ /api/momo/qr-extract?orderId=... (ảnh do
//     MoMo tự vẽ trên trang thanh toán của họ, đã hỗ trợ quét được bằng cả
//     app MoMo lẫn app ngân hàng bất kỳ theo chuẩn VietQR/NAPAS 247).
//     KHÔNG tự vẽ lại QR thứ 2 nữa — chỉ 1 mã QR duy nhất.
//   - Thông tin chuyển khoản (ngân hàng, số tài khoản, số tiền, nội dung)
//     + nút sao chép: lấy từ /api/momo/vietqr-pay, gọi ĐÚNG 1 LẦN lúc
//     mount. Route này kéo theo cả chuỗi qr-extract (Puppeteer) nên tuyệt
//     đối không gọi lại theo interval.
//   - Trạng thái đơn hàng: poll /api/momo/status?orderId=... mỗi 1 giây —
//     route này chỉ đọc Redis (kèm verify thật với MoMo khi gần hết hạn),
//     rất nhẹ, an toàn để poll liên tục. Tự dừng polling khi đơn đã có kết
//     luận cuối (PAID/FAILED/EXPIRED).
//
// LƯU Ý: dùng CSS Module (styles/pay.module.css) thay vì `<style jsx>` —
// bản trước dùng styled-jsx bị lỗi "Cannot find module 'styled-jsx/style.js'"
// trên môi trường Turbopack của project này.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Redis } from '@upstash/redis'
import styles from '../../styles/pay.module.css'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const POLL_INTERVAL_MS = 1000
// Đơn đã có 1 trong các trạng thái này coi như kết luận cuối -> dừng poll.
const TERMINAL_STATUSES = ['PAID', 'FAILED', 'EXPIRED']

export async function getServerSideProps({ params }) {
  const orderId = (params.orderId || '').toString().trim()
  if (!orderId) return { notFound: true }

  let order
  try {
    const raw = await redis.hget('momo:orders', orderId)
    if (!raw) {
      console.warn('[pay/orderId] SSR: không tìm thấy đơn trong Redis', { orderId })
      return { notFound: true }
    }
    order = typeof raw === 'string' ? JSON.parse(raw) : raw
    console.log('[pay/orderId] SSR: đã lấy đơn từ Redis', {
      orderId,
      status: order.status,
      amount: order.amount,
    })
  } catch (err) {
    console.error('[pay/orderId] getServerSideProps lỗi:', err)
    return {
      props: {
        order: null,
        loadError: 'Không đọc được dữ liệu đơn hàng (lỗi kết nối Redis). Vui lòng thử lại sau.',
      },
    }
  }

  return {
    props: {
      order: {
        orderId: order.orderId || orderId,
        amount: order.amount ?? null,
        orderInfo: order.orderInfo || '',
        storeName: order.storeName || '',
        status: order.status || 'PENDING',
        // Cần cho đếm ngược ở client — createdAt phải khớp với giá trị
        // status.js dùng để tính "age" (age = Date.now() - createdAt), nếu
        // thiếu thì coi như "vừa tạo" (Date.now()) để không đếm ngược âm.
        createdAt: order.createdAt || new Date().toISOString(),
      },
      // Phải khớp EXPIRE_MINUTES bên status.js / admin-dashboard.js — cùng
      // đọc từ 1 biến env để 2 nơi không bao giờ lệch nhau.
      expireMinutes: parseInt(process.env.MOMO_EXPIRE_MINUTES || '10', 10),
      loadError: null,
    },
  }
}

function formatVnd(amount) {
  const n = Number(amount)
  if (Number.isNaN(n)) return String(amount ?? '')
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
}

// mm:ss từ số giây còn lại, không âm.
function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function statusLabel(status) {
  switch (status) {
    case 'PAID':
      return { text: 'Thanh toán thành công', tone: 'success' }
    case 'FAILED':
      return { text: 'Thanh toán thất bại', tone: 'error' }
    case 'EXPIRED':
      return { text: 'Đơn hàng đã hết hạn', tone: 'error' }
    default:
      return { text: 'Đang chờ thanh toán…', tone: 'pending' }
  }
}

// Ô thông tin có nút sao chép — dùng chung cho ngân hàng / STK / số tiền / nội dung.
// `copyValue` là giá trị THỰC SỰ sẽ được chép vào clipboard, có thể khác với
// `value` hiển thị (vd: hiển thị "1.454 đ" nhưng chép số thô "1454" để dán
// vào app ngân hàng không bị lỗi định dạng).
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn('[pay/orderId] navigator.clipboard lỗi, thử fallback execCommand', err)
    }
  }
  // Fallback cho webview trong app MoMo/Zalo/Facebook — các webview này
  // thường không cấp quyền Clipboard API dù đang chạy trên HTTPS.
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (err) {
    console.error('[pay/orderId] Fallback copy cũng lỗi', err)
    return false
  }
}

function CopyField({ label, value, copyValue, mono = true }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!value) return null

  async function handleCopy() {
    const text = String(copyValue ?? value)
    const ok = await copyToClipboard(text)
    if (ok) {
      console.log('[pay/orderId] Đã sao chép', { label })
      setFailed(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      console.warn('[pay/orderId] Không sao chép được (clipboard bị chặn)', { label })
      setFailed(true)
      setTimeout(() => setFailed(false), 2000)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        background: '#f7f7f9',
        marginBottom: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={String(value)}
        >
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          flexShrink: 0,
          border: 'none',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          background: failed ? '#dc2626' : copied ? '#22c55e' : '#111',
          color: '#fff',
          transition: 'background 0.15s',
        }}
      >
        {failed ? 'Lỗi, thử lại' : copied ? 'Đã chép' : 'Sao chép'}
      </button>
    </div>
  )
}

// ==== Phiếu chuyển khoản ====
// Trình bày lại toàn bộ khối thông tin ngân hàng dưới dạng "biên lai" —
// chịu được dữ liệu thiếu (bank null, accountNumber rỗng...) và tách riêng
// giá trị hiển thị / giá trị copy cho trường số tiền.
function BankTransferSlip({ payInfo }) {
  // Hook phải gọi TRƯỚC mọi early return (Rules of Hooks) — bản trước gọi
  // useState sau `if (!payInfo) return null` nên khi payInfo chuyển từ
  // null -> có dữ liệu, React sẽ crash "Rendered fewer hooks than expected".
  const [copiedAll, setCopiedAll] = useState(false)

  if (!payInfo) return null

  const bank = payInfo.bank || {}
  const bankLabel = bank.fullName || bank.name || 'Ngân hàng'
  const bankCode = bank.code || bank.bin || '—'
  const initials = (bank.code || bank.name || '??').slice(0, 2).toUpperCase()

  const rawAmount = payInfo.amount != null ? String(payInfo.amount).replace(/[^\d]/g, '') : ''
  const displayAmount = rawAmount ? formatVnd(rawAmount) : null

  const fullSlipText = [
    `Ngân hàng: ${bankLabel}${bank.code ? ` (${bank.code})` : ''}`,
    payInfo.accountNumber ? `Số tài khoản: ${payInfo.accountNumber}` : null,
    displayAmount ? `Số tiền: ${displayAmount}` : null,
    payInfo.content ? `Nội dung: ${payInfo.content}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  async function handleCopyAll() {
    const ok = await copyToClipboard(fullSlipText)
    if (ok) {
      console.log('[pay/orderId] Đã sao chép toàn bộ phiếu chuyển khoản')
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    }
  }

  return (
    <div
      style={{
        border: '1px dashed #d1d5db',
        borderRadius: 14,
        padding: '16px 16px 14px',
        marginBottom: 4,
        background: '#fcfcfd',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: '1px dashed #e5e7eb',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#0ea5a4',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{bankLabel}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Mã ngân hàng: {bankCode}</div>
        </div>
      </div>

      <CopyField label="Số tài khoản" value={payInfo.accountNumber} />
      {displayAmount && (
        <CopyField label="Số tiền" value={displayAmount} copyValue={rawAmount} />
      )}
      <CopyField label="Nội dung chuyển khoản" value={payInfo.content} />

      <button
        type="button"
        onClick={handleCopyAll}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'center',
          background: 'transparent',
          border: '1px solid #0ea5a4',
          color: copiedAll ? '#0ea5a4' : '#0ea5a4',
          fontWeight: 700,
          fontSize: 13,
          padding: '9px 0',
          borderRadius: 9,
          cursor: 'pointer',
          marginTop: 4,
        }}
      >
        {copiedAll ? '✓ Đã sao chép toàn bộ' : 'Sao chép tất cả thông tin'}
      </button>
    </div>
  )
}

export default function PayPage({ order: initialOrder, expireMinutes, loadError }) {
  const router = useRouter()
  const [order, setOrder] = useState(initialOrder)
  const [payInfo, setPayInfo] = useState(null)
  const [payInfoError, setPayInfoError] = useState('')
  const [loadingPayInfo, setLoadingPayInfo] = useState(true)
  const [remainingMs, setRemainingMs] = useState(null)
  const [manualChecking, setManualChecking] = useState(false)
  // Tăng token này để ép effect lấy vietqr-pay chạy lại (dùng cho nút "Thử
  // lại" khi lần gọi trước bị lỗi hoặc quá thời gian chờ).
  const [payInfoRetryToken, setPayInfoRetryToken] = useState(0)
  const pollRef = useRef(null)
  const redirectRef = useRef(null)
  // Dùng chung 1 hàm check status cho cả vòng poll tự động lẫn nút bấm thủ
  // công, để không lặp code và đảm bảo 2 nơi xử lý kết quả giống hệt nhau.
  const checkStatusRef = useRef(null)

  // Điều hướng sang /result — chờ 1.2s để khách kịp thấy dòng "Thanh toán
  // thành công" ngay trên trang /pay, sau đó mới chuyển qua /result để xem
  // chi tiết đầy đủ (transId, thời gian thanh toán...). /result sẽ tự gọi
  // lại /api/momo/status với orderId này, lúc đó đơn đã PAID sẵn nên resolve
  // ngay ở lần poll đầu, không phải chờ thêm.
  function goToResult(orderId) {
    if (redirectRef.current) return // tránh điều hướng 2 lần
    redirectRef.current = true
    console.log('[pay/orderId] Chuẩn bị chuyển sang /result', { orderId })
    setTimeout(() => {
      console.log('[pay/orderId] Đang chuyển sang /result', { orderId })
      router.replace(`/result?orderId=${encodeURIComponent(orderId)}`)
    }, 1200)
  }

  // Trường hợp trang được mở/refresh khi đơn ĐÃ SẴN PAID từ SSR (ví dụ khách
  // bấm back rồi forward, hoặc mở lại link cũ) — không có vòng poll nào chạy
  // để bắt sự kiện chuyển trạng thái nữa, nên phải điều hướng ngay ở đây.
  useEffect(() => {
    if (initialOrder && initialOrder.status === 'PAID') {
      console.log('[pay/orderId] Đơn đã PAID sẵn từ SSR, chuyển thẳng sang /result', {
        orderId: initialOrder.orderId,
      })
      goToResult(initialOrder.orderId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mốc hết hạn tính 1 lần từ createdAt + expireMinutes — không phụ thuộc
  // đồng hồ máy khách chạy nhanh/chậm vì vẫn so với Date.now() mỗi tick,
  // chỉ lệch nếu đồng hồ máy khách sai hẳn (chấp nhận được, vì status.js
  // ở server mới là nguồn xác thực cuối cùng, đếm ngược chỉ mang tính UX).
  const expireAtMs = initialOrder
    ? new Date(initialOrder.createdAt).getTime() + expireMinutes * 60 * 1000
    : null

  // 3) Đếm ngược mỗi giây tới mốc hết hạn — chỉ để hiển thị UX, KHÔNG tự ý
  // kết luận EXPIRED ở client (việc đó do status.js/poll quyết định, vì
  // server còn verify thật với MoMo trước khi kết luận).
  useEffect(() => {
    if (!initialOrder || !expireAtMs) return
    if (TERMINAL_STATUSES.includes(initialOrder.status)) return

    function tick() {
      setRemainingMs(expireAtMs - Date.now())
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [initialOrder, expireAtMs])

  // 1) Lấy thông tin chuyển khoản (vietqr-pay) — CHỈ 1 LẦN lúc mount.
  useEffect(() => {
    if (!initialOrder) return
    let cancelled = false
    const controller = new AbortController()
    // vietqr-pay kéo theo cả Puppeteer (qua qr-extract) nên có thể chậm,
    // nhưng không được để khách kẹt ở "Đang tải..." vô thời hạn nếu route bị
    // treo/nghẽn — 45s là dưới maxDuration=60s của route để luôn có phản hồi
    // rõ ràng (thành công hoặc lỗi) thay vì chờ vô ích.
    const timeoutId = setTimeout(() => controller.abort(), 45000)

    async function loadPayInfo() {
      setLoadingPayInfo(true)
      setPayInfoError('')
      console.log('[pay/orderId] Gọi vietqr-pay lấy thông tin chuyển khoản', {
        orderId: initialOrder.orderId,
        retry: payInfoRetryToken,
      })
      try {
        const r = await fetch(
          `/api/momo/vietqr-pay?orderId=${encodeURIComponent(initialOrder.orderId)}`,
          { signal: controller.signal }
        )
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Không lấy được thông tin chuyển khoản')
        console.log('[pay/orderId] Đã lấy thông tin chuyển khoản', {
          orderId: initialOrder.orderId,
          bank: data.bank?.code,
        })
        if (!cancelled) setPayInfo(data)
      } catch (err) {
        console.error('[pay/orderId] Lỗi lấy vietqr-pay', { orderId: initialOrder.orderId, err })
        if (!cancelled) {
          const msg =
            err.name === 'AbortError'
              ? 'Lấy thông tin chuyển khoản quá lâu, vui lòng thử lại.'
              : err.message || 'Có lỗi xảy ra, thử lại sau'
          setPayInfoError(msg)
        }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setLoadingPayInfo(false)
      }
    }

    loadPayInfo()
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [initialOrder, payInfoRetryToken])

  // 2) Poll trạng thái đơn hàng mỗi 1s (route nhẹ, tự verify với MoMo khi
  // gần hết hạn) — tự dừng khi đơn đã có kết luận cuối.
  useEffect(() => {
    if (!initialOrder) return
    if (TERMINAL_STATUSES.includes(initialOrder.status)) return // đã kết luận từ SSR, khỏi poll

    // silent = true khi gọi từ vòng poll tự động (không hiện spinner trên
    // nút, không set lỗi ra UI — lỗi tạm thời cứ để lần poll 1s sau tự thử
    // lại). silent = false khi khách chủ động bấm nút "Kiểm tra giao dịch".
    async function checkStatus({ silent } = { silent: true }) {
      console.log('[pay/orderId] Poll status', { orderId: initialOrder.orderId, silent })
      try {
        const r = await fetch(`/api/momo/status?orderId=${encodeURIComponent(initialOrder.orderId)}`)
        const data = await r.json()
        if (!r.ok) {
          console.warn('[pay/orderId] Poll status trả về lỗi HTTP', {
            orderId: initialOrder.orderId,
            httpStatus: r.status,
          })
          return false // lỗi tạm thời, thử lại ở lần poll/bấm sau
        }
        console.log('[pay/orderId] Poll status kết quả', {
          orderId: initialOrder.orderId,
          status: data.status,
        })
        setOrder((prev) => ({ ...prev, ...data }))
        if (TERMINAL_STATUSES.includes(data.status)) {
          console.log('[pay/orderId] Đơn đã có kết luận cuối, dừng poll', {
            orderId: initialOrder.orderId,
            status: data.status,
          })
          clearInterval(pollRef.current)
          // Thanh toán thành công -> trả khách về trang /result để xem kết
          // quả đầy đủ. FAILED/EXPIRED vẫn ở lại trang /pay như cũ vì khách
          // có thể cần thử quét lại hoặc chờ đơn mới.
          if (data.status === 'PAID') {
            goToResult(initialOrder.orderId)
          }
        }
        return true
      } catch (err) {
        // Lỗi mạng tạm thời (kể cả khi server đang nghẽn) — bỏ qua, vòng
        // poll 1s tự thử lại; nếu khách vừa bấm nút thủ công thì coi như
        // lần bấm đó không lấy được gì, khách có thể bấm lại.
        console.error('[pay/orderId] Poll status lỗi mạng', { orderId: initialOrder.orderId, err })
        return false
      }
    }

    // Cho phép nút "Kiểm tra giao dịch" ở phần render bên dưới gọi lại đúng
    // hàm này, thay vì phải viết riêng 1 bản fetch khác.
    checkStatusRef.current = checkStatus

    checkStatus({ silent: true }) // gọi ngay lần đầu, không đợi hết 1s mới có dữ liệu
    pollRef.current = setInterval(() => checkStatus({ silent: true }), POLL_INTERVAL_MS)
    return () => clearInterval(pollRef.current)
  }, [initialOrder])

  // Trường hợp server/route status.js đang nghẽn (Puppeteer/MoMo phản hồi
  // chậm...) khiến vòng poll 1s bị trễ hoặc rớt vài nhịp — khách có thể chủ
  // động bấm nút này để ép kiểm tra ngay lập tức thay vì ngồi chờ.
  async function handleManualCheck() {
    if (manualChecking || !checkStatusRef.current) return
    console.log('[pay/orderId] Khách bấm nút kiểm tra giao dịch thủ công', {
      orderId: initialOrder?.orderId,
    })
    setManualChecking(true)
    try {
      await checkStatusRef.current({ silent: false })
    } finally {
      setManualChecking(false)
    }
  }

  if (!initialOrder) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.errorBanner}>{loadError || 'Không tải được đơn hàng.'}</div>
        </div>
      </div>
    )
  }

  const { text: statusText, tone } = statusLabel(order.status)
  const toneColor = tone === 'success' ? '#16a34a' : tone === 'error' ? '#dc2626' : '#d97706'

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.badge}>Đơn hàng</div>
          <div className={styles.storeName}>{order.storeName || 'Thanh toán'}</div>
          <div className={styles.orderId}>#{order.orderId}</div>
        </div>

        <div className={styles.amountBlock}>
          <div className={styles.amount}>{formatVnd(order.amount)}</div>
          {order.orderInfo && <div className={styles.orderInfo}>{order.orderInfo}</div>}
        </div>

        <div
          style={{
            textAlign: 'center',
            fontWeight: 600,
            color: toneColor,
            marginBottom: order.status === 'PENDING' && remainingMs != null ? 4 : 16,
          }}
        >
          {statusText}
        </div>

        {order.status === 'PENDING' && remainingMs != null && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 13,
              color: remainingMs > 0 ? '#888' : '#dc2626',
              marginBottom: 12,
            }}
          >
            {remainingMs > 0
              ? `Còn lại ${formatCountdown(remainingMs)}`
              : 'Đã hết thời gian — đang kiểm tra kết quả…'}
          </div>
        )}

        {/* Hệ thống đã tự poll /api/momo/status mỗi 1s ở trên rồi — nút này
            dành cho lúc server nghẽn (route status.js phải verify thật với
            MoMo nên đôi khi chậm), khách vừa chuyển khoản xong có thể bấm để
            ép kiểm tra ngay thay vì ngồi chờ vòng poll tự động. */}
        {order.status === 'PENDING' && (
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={manualChecking}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              background: 'transparent',
              border: '1px solid #d1d5db',
              color: manualChecking ? '#aaa' : '#374151',
              fontWeight: 600,
              fontSize: 14,
              padding: '10px 0',
              borderRadius: 10,
              cursor: manualChecking ? 'default' : 'pointer',
              marginBottom: 16,
            }}
          >
            {manualChecking ? 'Đang kiểm tra…' : '🔄 Kiểm tra giao dịch'}
          </button>
        )}

        {/* Chỉ hiện QR + thông tin chuyển khoản khi đơn còn đang chờ —
            đã có kết luận cuối thì quét cũng vô nghĩa. */}
        {order.status === 'PENDING' && (
          <>
            <div className={styles.qrFrame} style={{ margin: '0 auto 16px', maxWidth: 280 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.qrImg}
                src={`/api/momo/qr-extract?orderId=${encodeURIComponent(order.orderId)}`}
                alt="Mã QR thanh toán"
              />
            </div>
            <div className={styles.qrSub} style={{ textAlign: 'center', marginBottom: 12 }}>
              Mở app MoMo hoặc app ngân hàng bất kỳ hỗ trợ VietQR để quét
            </div>

            {/* Dành cho khách đang xem trang này TRÊN ĐIỆN THOẠI (đã có sẵn
                app MoMo) — bấm thẳng vào deeplink thay vì phải quét QR.
                Tận dụng route /api/momo/status?open=1 đã có sẵn: route này
                tự tra Redis lấy deeplink/payUrl rồi redirect, đồng thời ẩn
                luôn link MoMo thật (dài, lộ thông tin) khỏi thanh địa chỉ
                cho tới lúc bấm. */}
            <a
              href={`/api/momo/status?orderId=${encodeURIComponent(order.orderId)}&open=1`}
              style={{
                display: 'block',
                textAlign: 'center',
                background: '#d82d8b',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                padding: '12px 0',
                borderRadius: 10,
                textDecoration: 'none',
                marginBottom: 20,
              }}
            >
              Tiếp tục với App MoMo
            </a>

            <div>
              {loadingPayInfo && (
                <div style={{ textAlign: 'center', color: '#888', padding: '12px 0' }}>
                  Đang tải thông tin chuyển khoản…
                </div>
              )}
              {!loadingPayInfo && payInfoError && (
                <div className={styles.errorBanner} style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 8 }}>{payInfoError}</div>
                  <button
                    type="button"
                    onClick={() => setPayInfoRetryToken((t) => t + 1)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      background: 'transparent',
                      border: '1px solid #dc2626',
                      color: '#dc2626',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '8px 0',
                      borderRadius: 9,
                      cursor: 'pointer',
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {!loadingPayInfo && !payInfoError && payInfo && (
                <BankTransferSlip payInfo={payInfo} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}