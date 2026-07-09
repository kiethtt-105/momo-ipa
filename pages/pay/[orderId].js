// pages/pay/[orderId].js
//
// Bản UI đơn giản trước: hiện song song 2 mã QR cho 1 đơn hàng.
//   - QR 1 "Quét bằng App MoMo": ảnh lấy thẳng từ /api/momo/qr-extract
//     (mã do MoMo tự vẽ trên trang thanh toán của họ).
//   - QR 2 "Quét bằng App ngân hàng": KHÔNG lấy lại ảnh từ MoMo, mà tự vẽ
//     mới bằng thư viện `qrcode` từ chuỗi EMV gốc (`raw`) đã đọc/parse
//     được ở /api/momo/vietqr-pay. Cùng 1 nội dung QR, chỉ khác nguồn vẽ —
//     tách riêng để sau này có thể tối ưu (vd bỏ hẳn bước gọi qr-extract
//     cho luồng ngân hàng, không cần Puppeteer nữa).
//
// Chưa làm: chọn app ngân hàng / mở deeplink autofill — để bước sau,
// hiện tại tập trung UI hiển thị 2 mã trước theo yêu cầu.

import { useEffect, useState } from 'react'
import { Redis } from '@upstash/redis'
import QRCode from 'qrcode'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export async function getServerSideProps({ params }) {
  const orderId = (params.orderId || '').toString().trim()
  if (!orderId) return { notFound: true }

  const raw = await redis.hget('momo:orders', orderId)
  if (!raw) return { notFound: true }

  const order = typeof raw === 'string' ? JSON.parse(raw) : raw

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
    },
  }
}

function formatVnd(amount) {
  const n = Number(amount)
  if (Number.isNaN(n)) return String(amount ?? '')
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
}

export default function PayPage({ order }) {
  const [payInfo, setPayInfo] = useState(null)
  const [payInfoError, setPayInfoError] = useState('')
  const [loadingPayInfo, setLoadingPayInfo] = useState(true)
  const [vietqrImg, setVietqrImg] = useState('')

  useEffect(() => {
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
  }, [order.orderId])

  const isPending = order.status === 'PENDING'

  return (
    <div className="page">
      <div className="card">
        <div className="header">
          <div className="badge">Đơn hàng</div>
          <div className="storeName">{order.storeName || 'Thanh toán'}</div>
          <div className="orderId">#{order.orderId}</div>
        </div>

        <div className="amountBlock">
          <div className="amount">{formatVnd(order.amount)}</div>
          {order.orderInfo && <div className="orderInfo">{order.orderInfo}</div>}
        </div>

        {!isPending && (
          <div className="statusBanner">
            Đơn hàng hiện ở trạng thái <b>{order.status}</b> — có thể đã hết hạn hoặc đã thanh toán.
          </div>
        )}

        <div className="qrColumns">
          <div className="qrCol">
            <div className="qrLabel">
              <span className="dot momoDot" />
              Quét bằng App MoMo
            </div>
            <div className="qrFrame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="qrImg"
                src={`/api/momo/qr-extract?orderId=${encodeURIComponent(order.orderId)}`}
                alt="Mã QR MoMo"
              />
            </div>
            <div className="qrSub">Mở app MoMo → Quét mã</div>
          </div>

          <div className="qrCol">
            <div className="qrLabel">
              <span className="dot bankDot" />
              Quét bằng App ngân hàng
            </div>
            <div className="qrFrame">
              {loadingPayInfo && <div className="qrPlaceholder">Đang tải…</div>}
              {!loadingPayInfo && payInfoError && (
                <div className="qrPlaceholder error">{payInfoError}</div>
              )}
              {!loadingPayInfo && !payInfoError && vietqrImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="qrImg" src={vietqrImg} alt="Mã VietQR" />
              )}
            </div>
            <div className="qrSub">
              {payInfo?.bank?.name ? `App ngân hàng bất kỳ hỗ trợ VietQR · ${payInfo.bank.name}` : 'App ngân hàng bất kỳ hỗ trợ VietQR'}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(180deg, #fdf4fa 0%, #f6f4fb 100%);
          display: flex;
          justify-content: center;
          padding: 32px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .card {
          width: 100%;
          max-width: 460px;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 12px 32px rgba(161, 0, 107, 0.08);
          padding: 24px 20px 28px;
          height: fit-content;
        }
        .header {
          text-align: center;
          margin-bottom: 18px;
        }
        .badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #a1006b;
          background: #fbeaf5;
          padding: 3px 10px;
          border-radius: 999px;
          margin-bottom: 8px;
        }
        .storeName {
          font-size: 17px;
          font-weight: 700;
          color: #241a2b;
        }
        .orderId {
          font-size: 12px;
          color: #9c95a6;
          margin-top: 2px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .amountBlock {
          text-align: center;
          padding: 18px 0 20px;
          border-bottom: 1px dashed #ecdff0;
          margin-bottom: 20px;
        }
        .amount {
          font-size: 32px;
          font-weight: 800;
          color: #a1006b;
          letter-spacing: -0.01em;
        }
        .orderInfo {
          margin-top: 6px;
          font-size: 13px;
          color: #7b7484;
        }
        .statusBanner {
          background: #fff5e6;
          color: #8a5a00;
          font-size: 13px;
          padding: 10px 12px;
          border-radius: 10px;
          margin-bottom: 16px;
        }
        .qrColumns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 380px) {
          .qrColumns {
            grid-template-columns: 1fr;
          }
        }
        .qrCol {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #faf7fb;
          border-radius: 14px;
          padding: 14px 10px;
        }
        .qrLabel {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          font-weight: 700;
          color: #241a2b;
          margin-bottom: 10px;
          text-align: center;
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .momoDot {
          background: #a1006b;
        }
        .bankDot {
          background: #2b6fe0;
        }
        .qrFrame {
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #fff;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }
        .qrImg {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .qrPlaceholder {
          font-size: 11.5px;
          color: #b0aab8;
          text-align: center;
          padding: 0 6px;
        }
        .qrPlaceholder.error {
          color: #a12020;
        }
        .qrSub {
          margin-top: 8px;
          font-size: 10.5px;
          color: #948d9e;
          text-align: center;
          line-height: 1.4;
        }
      `}</style>
    </div>
  )
}