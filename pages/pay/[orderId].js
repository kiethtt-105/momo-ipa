// pages/pay/[orderId].js
//
// Hiện song song 2 mã QR cho 1 đơn hàng:
//   - QR 1 "Quét bằng App MoMo": ảnh lấy thẳng từ /api/momo/qr-extract
//     (mã do MoMo tự vẽ trên trang thanh toán của họ).
//   - QR 2 "Quét bằng App ngân hàng": tự vẽ mới bằng thư viện `qrcode` từ
//     chuỗi EMV gốc (`raw`) đọc được ở /api/momo/vietqr-pay.
//
// LƯU Ý: dùng CSS Module (styles/pay.module.css) thay vì `<style jsx>`.
// Bản trước dùng styled-jsx và bị lỗi lúc chạy trên môi trường Turbopack
// của project này:
//   "Cannot find module 'styled-jsx/style.js'"
// CSS Module là tính năng built-in của Next.js (không cần cài thêm gói),
// nên tránh được lỗi thiếu dependency đó hoàn toàn.

import { useEffect, useState } from 'react'
import { Redis } from '@upstash/redis'
import QRCode from 'qrcode'
import styles from '../../styles/pay.module.css'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export async function getServerSideProps({ params }) {
  const orderId = (params.orderId || '').toString().trim()
  if (!orderId) return { notFound: true }

  // Bọc try/catch để nếu Redis lỗi (sai/thiếu env KV_REST_API_URL,
  // KV_REST_API_TOKEN, mất kết nối...) thì trang vẫn render ra thông báo
  // lỗi rõ ràng thay vì Next.js quăng 500 trắng không log gì cho người
  // dùng thấy. Chi tiết lỗi thật vẫn nằm trong Vercel Function Logs.
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
        status: order.status || 'UNKNOWN',
        payUrl: order.payUrl || '',
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

export default function PayPage({ order, loadError }) {
  const [payInfo, setPayInfo] = useState(null)
  const [payInfoError, setPayInfoError] = useState('')
  const [loadingPayInfo, setLoadingPayInfo] = useState(true)
  const [vietqrImg, setVietqrImg] = useState('')

  useEffect(() => {
    if (!order) return // trang đang ở trạng thái lỗi tải đơn hàng, không có gì để gọi tiếp
    let cancelled = false

    async function load() {
      setLoadingPayInfo(true)
      setPayInfoError('')
      try {
        const r = await fetch(`/api/momo/vietqr-pay?orderId=${encodeURIComponent(order.orderId)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Không lấy được thông tin VietQR')
        if (cancelled) return
        setPayInfo(data)

        if (data.raw) {
          const dataUrl = await QRCode.toDataURL(data.raw, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 400,
          })
          if (!cancelled) setVietqrImg(dataUrl)
        }
      } catch (err) {
        if (!cancelled) setPayInfoError(err.message || 'Có lỗi xảy ra, thử lại sau')
      } finally {
        if (!cancelled) setLoadingPayInfo(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [order])

  if (!order) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.errorBanner}>{loadError || 'Không tải được đơn hàng.'}</div>
        </div>
      </div>
    )
  }

  const isPending = order.status === 'PENDING'

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

        {!isPending && (
          <div className={styles.statusBanner}>
            Đơn hàng hiện ở trạng thái <b>{order.status}</b> — có thể đã hết hạn hoặc đã thanh toán.
          </div>
        )}

        <div className={styles.qrColumns}>
          <div className={styles.qrCol}>
            <div className={styles.qrLabel}>
              <span className={`${styles.dot} ${styles.momoDot}`} />
              Quét bằng App MoMo
            </div>
            <div className={styles.qrFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.qrImg}
                src={`/api/momo/qr-extract?orderId=${encodeURIComponent(order.orderId)}`}
                alt="Mã QR MoMo"
              />
            </div>
            <div className={styles.qrSub}>Mở app MoMo → Quét mã</div>
          </div>

          <div className={styles.qrCol}>
            <div className={styles.qrLabel}>
              <span className={`${styles.dot} ${styles.bankDot}`} />
              Quét bằng App ngân hàng
            </div>
            <div className={styles.qrFrame}>
              {loadingPayInfo && <div className={styles.qrPlaceholder}>Đang tải…</div>}
              {!loadingPayInfo && payInfoError && (
                <div className={`${styles.qrPlaceholder} ${styles.qrPlaceholderError}`}>{payInfoError}</div>
              )}
              {!loadingPayInfo && !payInfoError && vietqrImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.qrImg} src={vietqrImg} alt="Mã VietQR" />
              )}
            </div>
            <div className={styles.qrSub}>
              {payInfo?.bank?.name
                ? `App ngân hàng bất kỳ hỗ trợ VietQR · ${payInfo.bank.name}`
                : 'App ngân hàng bất kỳ hỗ trợ VietQR'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}