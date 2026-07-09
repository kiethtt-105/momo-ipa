import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ==== Cấu hình ====
const API_BASE = 'https://kiehtt.vercel.app/api/momo/orders';
const POLL_INTERVAL = 3000;   // 3 giây / lần kiểm tra
const MAX_POLL_TIMES = 40;    // tối đa ~2 phút tự động kiểm tra

// Các trạng thái được coi là "đã kết thúc" (không cần kiểm tra lại nữa)
const SUCCESS_STATUSES = ['PAID', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED'];
const FAIL_STATUSES = ['FAILED', 'FAIL', 'CANCELLED', 'CANCELED', 'EXPIRED', 'ERROR', 'REJECTED'];

function isFinalStatus(status) {
  if (!status) return false;
  const s = String(status).toUpperCase();
  return SUCCESS_STATUSES.includes(s) || FAIL_STATUSES.includes(s);
}

function isSuccessStatus(status) {
  return SUCCESS_STATUSES.includes(String(status).toUpperCase());
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString('vi-VN') + ' đ';
}

function formatDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('vi-VN', { hour12: false });
  } catch {
    return iso;
  }
}

export default function ResultPage() {
  const router = useRouter();
  const { orderId } = router.query;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const pollCountRef = useRef(0);
  const timerRef = useRef(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`${API_BASE}?orderId=${encodeURIComponent(orderId)}`);
      const data = await res.json();
      const list = data?.orders || [];

      if (!list.length) {
        setNotFound(true);
        setOrder(null);
        setLoading(false);
        return;
      }

      const o = list[0];
      setOrder(o);
      setNotFound(false);
      setErrorMsg('');
      setLoading(false);

      // Nếu giao dịch chưa có kết quả cuối cùng -> tự động kiểm tra lại
      if (!isFinalStatus(o.status)) {
        pollCountRef.current += 1;
        if (pollCountRef.current < MAX_POLL_TIMES) {
          timerRef.current = setTimeout(fetchOrder, POLL_INTERVAL);
        }
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg('Không thể kết nối máy chủ, đang thử kiểm tra lại...');
      pollCountRef.current += 1;
      if (pollCountRef.current < MAX_POLL_TIMES) {
        timerRef.current = setTimeout(fetchOrder, POLL_INTERVAL);
      }
    }
  }, [orderId]);

  useEffect(() => {
    if (!router.isReady) return;
    pollCountRef.current = 0;
    setLoading(true);
    fetchOrder();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, orderId]);

  const status = order?.status;
  const pending = !!order && !isFinalStatus(status);
  const success = !!order && isSuccessStatus(status);

  const paidAt = formatDateTime(order?.paidAt);
  const createdAt = formatDateTime(order?.createdAt);

  return (
    <>
      <Head>
        <title>Kết quả thanh toán</title>
        <link rel="icon" href="/result.png" />
      </Head>

      <div className="wrap">
        <div className="card">
          <img src="/result.png" alt="logo" className="logo" />

          {/* Đang tải lần đầu, chưa có dữ liệu order */}
          {loading && !order && !notFound && (
            <div className="center">
              <div className="spinner" />
              <p className="msg">Đang kiểm tra giao dịch...</p>
            </div>
          )}

          {/* Không tìm thấy đơn hàng */}
          {!order && notFound && (
            <div className="center">
              <div className="iconCircle fail">✕</div>
              <h2 className="title fail">Không tìm thấy đơn hàng</h2>
              <p className="msg">Mã đơn hàng: {orderId || '—'}</p>
            </div>
          )}

          {/* Có dữ liệu order */}
          {order && (
            <>
              <div className="center">
                {pending && (
                  <>
                    <div className="spinner" />
                    <h2 className="title pending">Đang xử lý giao dịch</h2>
                  </>
                )}
                {!pending && success && (
                  <>
                    <div className="iconCircle success">✓</div>
                    <h2 className="title success">Thanh toán thành công</h2>
                  </>
                )}
                {!pending && !success && (
                  <>
                    <div className="iconCircle fail">✕</div>
                    <h2 className="title fail">Thanh toán thất bại</h2>
                  </>
                )}

                <p className="amount">{formatCurrency(order.amount)}</p>
                {order.message && <p className="msg">{order.message}</p>}
              </div>

              <div className="divider" />

              <div className="info">
                <Row label="Mã đơn hàng" value={order.orderId} />
                <Row label="Nội dung" value={order.orderInfo} />
                {order.transId ? <Row label="Mã giao dịch" value={order.transId} /> : null}
                {order.partnerName ? <Row label="Cửa hàng" value={order.partnerName} /> : null}
                {order.vietqr?.bank?.fullName ? (
                  <Row
                    label="Ngân hàng"
                    value={`${order.vietqr.bank.fullName} (${order.vietqr.bank.code})`}
                  />
                ) : null}
                {order.vietqr?.accountNumber ? (
                  <Row label="Số tài khoản" value={order.vietqr.accountNumber} />
                ) : null}
                {createdAt ? <Row label="Thời gian tạo" value={createdAt} /> : null}
                {paidAt ? <Row label="Thời gian thanh toán" value={paidAt} /> : null}
              </div>
            </>
          )}

          {errorMsg && <p className="errorMsg">{errorMsg}</p>}
        </div>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f6f8;
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
        }
        .card {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border-radius: 16px;
          padding: 32px 24px;
          box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
        }
        .logo {
          display: block;
          width: 48px;
          height: 48px;
          margin: 0 auto 16px;
          object-fit: contain;
        }
        .center {
          text-align: center;
        }
        .iconCircle {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
          font-size: 32px;
          color: #fff;
        }
        .iconCircle.success {
          background: #22c55e;
        }
        .iconCircle.fail {
          background: #ef4444;
        }
        .spinner {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          border: 4px solid #e5e7eb;
          border-top-color: #9ca3af;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .title {
          font-size: 18px;
          font-weight: 600;
          margin: 4px 0;
        }
        .title.success {
          color: #16a34a;
        }
        .title.fail {
          color: #dc2626;
        }
        .title.pending {
          color: #6b7280;
        }
        .amount {
          font-size: 26px;
          font-weight: 700;
          color: #111827;
          margin: 8px 0 4px;
        }
        .msg {
          color: #6b7280;
          font-size: 14px;
          margin: 4px 0;
        }
        .errorMsg {
          color: #dc2626;
          font-size: 13px;
          text-align: center;
          margin-top: 12px;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 20px 0;
        }
        .info {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
      `}</style>
    </>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <style jsx>{`
        .row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
        }
        .label {
          color: #6b7280;
        }
        .value {
          color: #111827;
          font-weight: 500;
          text-align: right;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}