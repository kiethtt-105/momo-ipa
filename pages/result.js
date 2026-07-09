import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const API_BASE = 'https://kiehtt.vercel.app/api/momo/orders';

function fmtMoney(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return new Intl.NumberFormat('vi-VN').format(n);
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function stateMeta(status) {
  const s = (status || '').toUpperCase();
  if (['PAID', 'SUCCESS', 'SUCCESSFUL'].includes(s)) {
    return { key: 'success', label: 'Thanh toán thành công', sub: 'Giao dịch đã được xác nhận', pillText: 'Đã thanh toán' };
  }
  if (['PENDING', 'PROCESSING', 'WAITING'].includes(s)) {
    return { key: 'pending', label: 'Đang xử lý thanh toán', sub: 'Vui lòng chờ trong giây lát', pillText: 'Đang xử lý' };
  }
  return { key: 'failed', label: 'Thanh toán không thành công', sub: 'Giao dịch đã bị huỷ hoặc hết hạn', pillText: s || 'Thất bại' };
}

function StatusIcon({ statusKey }) {
  if (statusKey === 'success') {
    return (
      <svg viewBox="0 0 64 64" className="status-svg">
        <circle className="ring" cx="32" cy="32" r="27" />
        <path className="mark" d="M20 33.5L28 41.5L44 24.5" />
      </svg>
    );
  }
  if (statusKey === 'pending') {
    return (
      <svg viewBox="0 0 64 64" className="status-svg">
        <circle className="ring" cx="32" cy="32" r="27" />
        <path className="mark" d="M32 18V32L41 39" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="status-svg">
      <circle className="ring" cx="32" cy="32" r="27" />
      <path className="mark" d="M23 23L41 41M41 23L23 41" />
    </svg>
  );
}

function Row({ k, v, copy, onCopy }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className={copy ? 'v copyable' : 'v'} onClick={copy ? () => onCopy(copy) : undefined}>
        {v}
      </span>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const { orderId } = router.query;

  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [order, setOrder] = useState(null);
  const [errorMsg, setErrorMsg] = useState({ title: '', sub: '' });
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!router.isReady) return;

    if (!orderId) {
      setStatus('error');
      setErrorMsg({ title: 'Thiếu mã đơn hàng', sub: 'Đường dẫn cần có tham số ?orderId=...' });
      return;
    }

    let cancelled = false;
    setStatus('loading');

    fetch(`${API_BASE}?orderId=${encodeURIComponent(orderId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const o = (data && Array.isArray(data.orders) && data.orders[0]) || null;
        if (!o) {
          setStatus('error');
          setErrorMsg({ title: 'Không tìm thấy đơn hàng', sub: 'Vui lòng kiểm tra lại mã đơn hàng.' });
          return;
        }
        setOrder(o);
        setStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setStatus('error');
        setErrorMsg({ title: 'Không thể tải dữ liệu', sub: 'Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng thử lại sau.' });
      });

    return () => { cancelled = true; };
  }, [router.isReady, orderId]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1600);
  }

  function copyValue(val) {
    if (val === undefined || val === null || val === '—') return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(String(val))
        .then(() => showToast('Đã sao chép'))
        .catch(() => showToast('Không thể sao chép'));
    }
  }

  const meta = order ? stateMeta(order.status) : null;
  const bankName = order?.vietqr?.bank?.name || null;
  const payType = order?.payType ? order.payType.replace(/_/g, ' ').toUpperCase() : null;

  return (
    <div className="page">
      <div className="stage">
        <div className="brandmark"><span className="dot" />MOMO · KẾT QUẢ THANH TOÁN</div>

        <div className="receipt" data-state={meta ? meta.key : undefined}>
          {status === 'loading' && (
            <>
              <div className="head">
                <div className="skeleton sk-icon" />
                <div className="skeleton sk-line" style={{ width: 120, height: 14 }} />
                <div className="skeleton sk-line" style={{ width: 90, height: 11 }} />
                <div className="skeleton sk-line" style={{ width: 160, height: 32, marginTop: 14 }} />
              </div>
              <div className="perforation"><span className="notch left" /><span className="notch right" /></div>
              <div className="body">
                <div className="skeleton sk-line" style={{ width: '100%' }} />
                <div className="skeleton sk-line" style={{ width: '100%' }} />
                <div className="skeleton sk-line" style={{ width: '100%' }} />
                <div className="skeleton sk-line" style={{ width: '100%' }} />
              </div>
              <div className="foot" />
            </>
          )}

          {status === 'error' && (
            <div className="error-box">
              <div className="em">⚠️</div>
              <h2>{errorMsg.title}</h2>
              <p>{errorMsg.sub}</p>
            </div>
          )}

          {status === 'ok' && order && meta && (
            <>
              <div className="head">
                <div className="status-icon"><StatusIcon statusKey={meta.key} /></div>
                <div className="status-label">{meta.label}</div>
                <div className="status-sub">{meta.sub}</div>
                <div className="amount">{fmtMoney(order.amount)}<sup>đ</sup></div>
                <div className="merchant">Tại <b>{order.partnerName || order.storeName || '—'}</b></div>
              </div>

              <div className="perforation"><span className="notch left" /><span className="notch right" /></div>

              <div className="body">
                <div className="row">
                  <span className="k">Trạng thái</span>
                  <span className="v"><span className="pill">{meta.pillText}</span></span>
                </div>
                <Row k="Mã đơn hàng" v={order.orderInfo || order.orderId || '—'} copy={order.orderInfo || order.orderId} onCopy={copyValue} />
                <Row k="Mã giao dịch" v={order.transId ?? '—'} copy={order.transId} onCopy={copyValue} />
                {bankName && <Row k="Ngân hàng" v={bankName} />}
                {payType && <Row k="Phương thức" v={payType} />}
                <Row k="Thời gian" v={fmtTime(order.paidAt || order.createdAt)} />
              </div>

              <div className="foot">
                <button className="btn" onClick={() => (window.history.length > 1 ? window.history.back() : showToast('Bạn có thể đóng trang này'))}>
                  Xong
                </button>
                <button className="btn ghost" onClick={() => copyValue(order.transId ?? order.orderInfo)}>
                  Sao chép mã giao dịch
                </button>
              </div>
            </>
          )}

          <div className="tear" />
        </div>
      </div>

      {toast && <div className="toast show">{toast}</div>}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `}</style>

      <style jsx>{`
        :global(html, body) { margin:0; padding:0; }
        .page {
          min-height:100dvh;
          width:100%;
          font-family:'Inter',system-ui,sans-serif;
          color:#210A18;
          background:
            radial-gradient(120% 90% at 50% -10%, #6B0B4E 0%, #3D0130 60%),
            #3D0130;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px 16px;
        }
        .stage { width:100%; max-width:420px; display:flex; flex-direction:column; align-items:center; }
        .brandmark { display:flex; align-items:center; gap:8px; margin-bottom:18px; color:#F4DCEB; letter-spacing:.14em; font-size:12px; font-weight:600; text-transform:uppercase; opacity:.85; }
        .dot { width:7px; height:7px; border-radius:50%; background:#D42E8B; box-shadow:0 0 0 3px rgba(212,46,139,.25); }

        .receipt { position:relative; width:100%; background:#fff; border-radius:22px 22px 0 0; box-shadow:0 30px 60px -20px rgba(0,0,0,.55), 0 2px 0 rgba(255,255,255,.04); }

        .head { padding:38px 28px 26px; text-align:center; position:relative; }
        .status-icon { width:64px; height:64px; margin:0 auto 18px; }
        :global(.status-svg) { width:100%; height:100%; display:block; }
        :global(.ring) { fill:none; stroke-width:5; stroke-linecap:round; }
        :global(.mark) { fill:none; stroke-width:5.5; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:60; stroke-dashoffset:60; animation:draw .55s .35s ease-out forwards; }
        @keyframes draw { to { stroke-dashoffset:0; } }

        .status-label { font-family:'Sora',sans-serif; font-size:15px; font-weight:700; letter-spacing:.02em; margin-bottom:6px; }
        .status-sub { font-size:13px; color:#8C7386; margin-bottom:22px; }
        .amount { font-family:'Sora',sans-serif; font-weight:800; font-size:38px; letter-spacing:-.01em; line-height:1.1; }
        .amount sup { font-size:16px; font-weight:700; margin-left:3px; color:#8C7386; }
        .merchant { margin-top:8px; font-size:14px; color:#8C7386; }
        .merchant :global(b) { color:#210A18; font-weight:600; }

        .perforation { position:relative; height:1px; }
        .perforation::before { content:""; position:absolute; left:24px; right:24px; top:0; border-top:1.5px dashed #F0E2EC; }
        .notch { position:absolute; top:-13px; width:26px; height:26px; border-radius:50%; background:#3D0130; z-index:2; }
        .notch.left { left:-13px; }
        .notch.right { right:-13px; }

        .body { padding:24px 28px 8px; }
        .row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:9px 0; }
        .k { font-size:12.5px; color:#8C7386; white-space:nowrap; }
        .v { font-family:'JetBrains Mono',monospace; font-size:12.5px; font-weight:500; text-align:right; word-break:break-all; }
        .v.copyable { cursor:pointer; border-bottom:1px dashed transparent; transition:border-color .15s ease; }
        .v.copyable:hover { border-color:#8C7386; }
        :global(.pill) { display:inline-block; font-family:'Inter',sans-serif; font-size:11px; font-weight:700; letter-spacing:.03em; padding:3px 9px; border-radius:999px; background:#DFF9F1; color:#037A57; }

        .foot { padding:14px 28px 30px; }
        .btn { display:block; width:100%; text-align:center; padding:14px 18px; border-radius:14px; border:none; font-family:'Sora',sans-serif; font-weight:700; font-size:14.5px; cursor:pointer; background:#D42E8B; color:#fff; letter-spacing:.01em; box-shadow:0 10px 22px -8px rgba(212,46,139,.7); }
        .btn:active { transform:scale(.98); }
        .btn.ghost { margin-top:10px; background:transparent; color:#7A0050; box-shadow:none; border:1.5px solid #F0E2EC; }

        .tear { position:relative; height:16px; width:100%; background:
            linear-gradient(135deg, #fff 50%, transparent 50%),
            linear-gradient(-135deg, #fff 50%, transparent 50%);
          background-size:16px 16px; background-position:left bottom; background-repeat:repeat-x; margin-top:-1px; }

        [data-state="success"] .status-label { color:#037A57; }
        [data-state="success"] :global(.ring) { stroke:#04C88C; }
        [data-state="success"] :global(.mark) { stroke:#04C88C; }

        [data-state="pending"] .status-label { color:#8A5A0A; }
        [data-state="pending"] :global(.ring) { stroke:#F5A623; }
        [data-state="pending"] :global(.mark) { stroke:#F5A623; }
        [data-state="pending"] :global(.pill) { background:#FDEED2; color:#8A5A0A; }

        [data-state="failed"] .status-label { color:#8E1524; }
        [data-state="failed"] :global(.ring) { stroke:#E8384F; }
        [data-state="failed"] :global(.mark) { stroke:#E8384F; }
        [data-state="failed"] :global(.pill) { background:#FBDEE1; color:#8E1524; }

        .skeleton { background:linear-gradient(90deg,#F1E7EC 25%,#F8F1F4 37%,#F1E7EC 63%); background-size:400% 100%; animation:shimmer 1.3s ease infinite; border-radius:8px; }
        @keyframes shimmer { 0% { background-position:100% 0; } 100% { background-position:0 0; } }
        .sk-icon { width:64px; height:64px; border-radius:50%; margin:0 auto 18px; }
        .sk-line { height:12px; margin:0 auto 10px; border-radius:6px; }

        .error-box { text-align:center; padding:44px 28px; }
        .em { font-size:34px; margin-bottom:12px; }
        .error-box h2 { font-family:'Sora',sans-serif; font-size:16px; margin:0 0 6px; }
        .error-box p { font-size:13px; color:#8C7386; margin:0; }

        .toast {
          position:fixed; left:50%; bottom:28px; transform:translateX(-50%);
          background:#210A18; color:#fff; font-size:13px; font-weight:500;
          padding:10px 18px; border-radius:999px; z-index:50;
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.mark), .btn { animation:none !important; transition:none !important; }
        }
      `}</style>
    </div>
  );
}