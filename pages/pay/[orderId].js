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
    if (!raw) return { notFound: true }
    order = typeof raw === 'string' ? JSON.parse(raw) : raw
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
      },
      loadError: null,
    },
  }
}

function formatVnd(amount) {
  const n = Number(amount)
  if (Number.isNaN(n)) return String(amount ?? '')
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
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
function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Trình duyệt chặn clipboard (hiếm, thường do không phải HTTPS hoặc
      // thiếu permission) — bỏ qua, người dùng vẫn tự bôi đen copy được.
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
            fontFamily: '"JetBrains Mono", monospace',
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
          background: copied ? '#22c55e' : '#111',
          color: '#fff',
          transition: 'background 0.15s',
        }}
      >
        {copied ? 'Đã chép' : 'Sao chép'}
      </button>
    </div>
  )
}

export default function PayPage({ order: initialOrder, loadError }) {
  const [order, setOrder] = useState(initialOrder)
  const [payInfo, setPayInfo] = useState(null)
  const [payInfoError, setPayInfoError] = useState('')
  const [loadingPayInfo, setLoadingPayInfo] = useState(true)
  const pollRef = useRef(null)

  // 1) Lấy thông tin chuyển khoản (vietqr-pay) — CHỈ 1 LẦN lúc mount.
  useEffect(() => {
    if (!initialOrder) return
    let cancelled = false

    async function loadPayInfo() {
      setLoadingPayInfo(true)
      setPayInfoError('')
      try {
        const r = await fetch(`/api/momo/vietqr-pay?orderId=${encodeURIComponent(initialOrder.orderId)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Không lấy được thông tin chuyển khoản')
        if (!cancelled) setPayInfo(data)
      } catch (err) {
        if (!cancelled) setPayInfoError(err.message || 'Có lỗi xảy ra, thử lại sau')
      } finally {
        if (!cancelled) setLoadingPayInfo(false)
      }
    }

    loadPayInfo()
    return () => {
      cancelled = true
    }
  }, [initialOrder])

  // 2) Poll trạng thái đơn hàng mỗi 1s (route nhẹ, tự verify với MoMo khi
  // gần hết hạn) — tự dừng khi đơn đã có kết luận cuối.
  useEffect(() => {
    if (!initialOrder) return
    if (TERMINAL_STATUSES.includes(initialOrder.status)) return // đã kết luận từ SSR, khỏi poll

    async function tick() {
      try {
        const r = await fetch(`/api/momo/status?orderId=${encodeURIComponent(initialOrder.orderId)}`)
        const data = await r.json()
        if (!r.ok) return // lỗi tạm thời, thử lại ở lần poll sau
        setOrder((prev) => ({ ...prev, ...data }))
        if (TERMINAL_STATUSES.includes(data.status)) {
          clearInterval(pollRef.current)
        }
      } catch {
        // Lỗi mạng tạm thời — bỏ qua, lần poll sau (1s tới) thử lại.
      }
    }

    tick() // gọi ngay lần đầu, không đợi hết 1s mới có dữ liệu
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS)
    return () => clearInterval(pollRef.current)
  }, [initialOrder])

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
            marginBottom: 16,
          }}
        >
          {statusText}
        </div>

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
            <div className={styles.qrSub} style={{ textAlign: 'center', marginBottom: 20 }}>
              Mở app MoMo hoặc app ngân hàng bất kỳ hỗ trợ VietQR để quét
            </div>

            <div>
              {loadingPayInfo && (
                <div style={{ textAlign: 'center', color: '#888', padding: '12px 0' }}>
                  Đang tải thông tin chuyển khoản…
                </div>
              )}
              {!loadingPayInfo && payInfoError && (
                <div className={styles.errorBanner}>{payInfoError}</div>
              )}
              {!loadingPayInfo && !payInfoError && payInfo && (
                <>
                  <CopyField label="Ngân hàng" value={payInfo.bank?.fullName || payInfo.bank?.name} />
                  <CopyField label="Số tài khoản" value={payInfo.accountNumber} />
                  <CopyField label="Số tiền" value={payInfo.amount ? formatVnd(payInfo.amount) : null} />
                  <CopyField label="Nội dung chuyển khoản" value={payInfo.content} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}