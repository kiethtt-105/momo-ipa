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

  // Trạng thái quyết định "chủ đề màu" cho nền động
  const theme = pending ? 'pending' : success ? 'success' : order ? 'fail' : 'neutral';

  return (
    <>
      <Head>
        <title>Kết quả thanh toán</title>
        <link rel="icon" href="/result.png" />
      </Head>

      <div className={`wrap theme-${theme}`}>
        <div className="bgAnim">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <span className="blob b4" />
        </div>

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
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
          background: linear-gradient(120deg, #eef1f8, #f5f6f8);
        }

        /* ===== Nền gradient chuyển động ===== */
        .bgAnim {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          filter: blur(0px);
        }
        .blob {
          position: absolute;
          border-radius: 50%;
          opacity: 0.65;
          mix-blend-mode: screen;
          filter: blur(60px);
          will-change: transform;
        }
        .b1 {
          width: 60vmax;
          height: 60vmax;
          top: -20vmax;
          left: -15vmax;
          animation: float1 18s ease-in-out infinite;
        }
        .b2 {
          width: 50vmax;
          height: 50vmax;
          bottom: -20vmax;
          right: -15vmax;
          animation: float2 22s ease-in-out infinite;
        }
        .b3 {
          width: 40vmax;
          height: 40vmax;
          top: 30%;
          right: -10vmax;
          animation: float3 20s ease-in-out infinite;
        }
        .b4 {
          width: 35vmax;
          height: 35vmax;
          bottom: 10%;
          left: -10vmax;
          animation: float4 26s ease-in-out infinite;
        }

        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10vw, 8vh) scale(1.15); }
          66% { transform: translate(-5vw, 12vh) scale(0.9); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-12vw, -6vh) scale(1.1); }
          66% { transform: translate(6vw, -10vh) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-8vw, 10vh) scale(1.2); }
        }
        @keyframes float4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(10vw, -8vh) scale(1.05); }
        }

        /* Bảng màu theo trạng thái */
        .theme-neutral .b1 { background: #a5b4fc; }
        .theme-neutral .b2 { background: #93c5fd; }
        .theme-neutral .b3 { background: #c4b5fd; }
        .theme-neutral .b4 { background: #7dd3fc; }

        .theme-pending .b1 { background: #fcd34d; }
        .theme-pending .b2 { background: #fca5a5; }
        .theme-pending .b3 { background: #fdba74; }
        .theme-pending .b4 { background: #fde68a; }

        .theme-success .b1 { background: #6ee7b7; }
        .theme-success .b2 { background: #86efac; }
        .theme-success .b3 { background: #5eead4; }
        .theme-success .b4 { background: #4ade80; }

        .theme-fail .b1 { background: #fca5a5; }
        .theme-fail .b2 { background: #f87171; }
        .theme-fail .b3 { background: #fda4af; }
        .theme-fail .b4 { background: #fb7185; }

        /* ===== Card ===== */
        .card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
          border-radius: 22px;
          padding: 36px 26px;
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.15), 0 2px 8px rgba(15, 23, 42, 0.06);
          animation: cardIn 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
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
          width: 68px;
          height: 68px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 14px;
          font-size: 32px;
          color: #fff;
          animation: popIn 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        .iconCircle.success {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          box-shadow: 0 8px 24px rgba(34, 197, 94, 0.35);
        }
        .iconCircle.fail {
          background: linear-gradient(135deg, #f87171, #dc2626);
          box-shadow: 0 8px 24px rgba(220, 38, 38, 0.3);
        }
        .spinner {
          width: 48px;
          height: 48px;
          margin: 0 auto 14px;
          border: 4px solid rgba(148, 163, 184, 0.25);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .title {
          font-size: 19px;
          font-weight: 700;
          margin: 4px 0;
          letter-spacing: -0.01em;
        }
        .title.success { color: #16a34a; }
        .title.fail { color: #dc2626; }
        .title.pending { color: #6b7280; }
        .amount {
          font-size: 28px;
          font-weight: 800;
          background: linear-gradient(135deg, #111827, #374151);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          margin: 10px 0 4px;
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
          background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
          margin: 22px 0;
        }
        .info {
          display: flex;
          flex-direction: column;
          gap: 11px;
        }

        @media (max-width: 480px) {
          .card {
            padding: 28px 20px;
            border-radius: 18px;
          }
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
          padding: 4px 0;
        }
        .label {
          color: #6b7280;
        }
        .value {
          color: #111827;
          font-weight: 600;
          text-align: right;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}