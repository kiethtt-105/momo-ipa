import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

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
    return { key: 'success', label: 'Đã xác nhận thanh toán', sub: 'Giao dịch hoàn tất', pillText: 'Thành công' };
  }
  if (['PENDING', 'PROCESSING', 'WAITING'].includes(s)) {
    return { key: 'pending', label: 'Đang xử lý', sub: 'Vui lòng chờ trong giây lát', pillText: 'Đang xử lý' };
  }
  return { key: 'failed', label: 'Chưa hoàn tất', sub: 'Giao dịch đã huỷ hoặc hết hạn', pillText: s || 'Thất bại' };
}

function initialsOf(name) {
  if (!name) return '•';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
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
  const storeName = order?.storeName || order?.partnerName || null;
  const payType = order?.payType ? order.payType.replace(/_/g, ' ').toUpperCase() : null;

  const pageTitle = storeName
    ? `${storeName} · Hoá đơn thanh toán`
    : 'Hoá đơn thanh toán';

  return (
    <div className="page">
      <Head>
        <title>{pageTitle}</title>
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>

      <div className="stage">
        <div className="masthead">
          <div className="seal">{initialsOf(storeName)}</div>
          <div className="masthead-text">
            <div className="store-name">{storeName || 'Hoá đơn thanh toán'}</div>
            <div className="store-sub">Biên nhận điện tử</div>
          </div>
        </div>

        <div className="receipt" data-state={meta ? meta.key : undefined}>
          {status === 'loading' && (
            <>
              <div className="head">
                <div className="skeleton sk-icon" />
                <div className="skeleton sk-line" style={{ width: 140, height: 14 }} />
                <div className="skeleton sk-line" style={{ width: 100, height: 11 }} />
                <div className="skeleton sk-line" style={{ width: 170, height: 32, marginTop: 14 }} />
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
              <div className="em">✦</div>
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
              </div>

              <div className="perforation"><span className="notch left" /><span className="notch right" /></div>

              <div className="body">
                <div className="row">
                  <span className="k">Trạng thái</span>
                  <span className="v"><span className="pill">{meta.pillText}</span></span>
                </div>
                <Row k="Mã đơn hàng" v={order.orderInfo || order.orderId || '—'} copy={order.orderInfo || order.orderId} onCopy={copyValue} />
                <Row k="Mã giao dịch" v={order.transId ?? '—'} copy={order.transId} onCopy={copyValue} />
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

        <div className="foot-note">Được tạo tự động · vui lòng liên hệ cửa hàng nếu có sai sót</div>
      </div>

      {toast && <div className="toast show">{toast}</div>}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `}</style>

      <style jsx>{`
        :global(html, body) { margin:0; padding:0; }
        .page {
          min-height:100dvh;
          width:100%;
          font-family:'Inter',system-ui,sans-serif;
          color:#23281F;
          background:
            radial-gradient(120% 90% at 50% -10%, #2E3B31 0%, #1B241E 60%),
            #1B241E;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px 16px;
        }
        .stage { width:100%; max-width:420px; display:flex; flex-direction:column; align-items:center; }

        .masthead { display:flex; align-items:center; gap:12px; margin-bottom:18px; width:100%; padding:0 4px; }
        .seal {
          width:38px; height:38px; border-radius:50%; flex-shrink:0;
          background:#C77B3D; color:#1B241E; font-family:'Fraunces',serif; font-weight:700; font-size:14px;
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 0 0 3px rgba(199,123,61,.25);
        }
        .masthead-text { display:flex; flex-direction:column; }
        .store-name { font-family:'Fraunces',serif; font-weight:600; font-size:17px; color:#F6F1E7; letter-spacing:.01em; }
        .store-sub { font-size:11.5px; color:#B9C2B4; letter-spacing:.08em; text-transform:uppercase; margin-top:2px; }

        .receipt { position:relative; width:100%; background:#F6F1E7; border-radius:4px 4px 0 0; box-shadow:0 30px 60px -20px rgba(0,0,0,.55), 0 2px 0 rgba(255,255,255,.04); }

        .head { padding:36px 28px 24px; text-align:center; position:relative; }
        .status-icon { width:60px; height:60px; margin:0 auto 16px; }
        :global(.status-svg) { width:100%; height:100%; display:block; }
        :global(.ring) { fill:none; stroke-width:5; stroke-linecap:round; }
        :global(.mark) { fill:none; stroke-width:5.5; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:60; stroke-dashoffset:60; animation:draw .55s .35s ease-out forwards; }
        @keyframes draw { to { stroke-dashoffset:0; } }

        .status-label { font-family:'Fraunces',serif; font-size:16px; font-weight:600; letter-spacing:.01em; margin-bottom:6px; }
        .status-sub { font-size:12.5px; color:#8A8272; margin-bottom:20px; }
        .amount { font-family:'Fraunces',serif; font-weight:700; font-size:36px; letter-spacing:-.01em; line-height:1.1; }
        .amount sup { font-size:15px; font-weight:600; margin-left:3px; color:#8A8272; }

        .perforation { position:relative; height:1px; }
        .perforation::before { content:""; position:absolute; left:24px; right:24px; top:0; border-top:1.5px dashed #DDD3BE; }
        .notch { position:absolute; top:-13px; width:26px; height:26px; border-radius:50%; background:#1B241E; z-index:2; }
        .notch.left { left:-13px; }
        .notch.right { right:-13px; }

        .body { padding:22px 28px 6px; }
        .row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:9px 0; }
        .k { font-size:12px; color:#8A8272; white-space:nowrap; }
        .v { font-family:'JetBrains Mono',monospace; font-size:12.5px; font-weight:500; text-align:right; word-break:break-all; color:#23281F; }
        .v.copyable { cursor:pointer; border-bottom:1px dashed transparent; transition:border-color .15s ease; }
        .v.copyable:hover { border-color:#8A8272; }
        :global(.pill) { display:inline-block; font-family:'Inter',sans-serif; font-size:11px; font-weight:700; letter-spacing:.03em; padding:3px 9px; border-radius:4px; background:#E4EFE6; color:#2F6B4F; }

        .foot { padding:14px 28px 28px; }
        .btn { display:block; width:100%; text-align:center; padding:13px 18px; border-radius:6px; border:none; font-family:'Fraunces',serif; font-weight:600; font-size:14.5px; cursor:pointer; background:#23281F; color:#F6F1E7; letter-spacing:.01em; }
        .btn:active { transform:scale(.98); }
        .btn.ghost { margin-top:10px; background:transparent; color:#5B5748; box-shadow:none; border:1.5px solid #DDD3BE; font-family:'Inter',sans-serif; font-weight:600; }

        .tear { position:relative; height:14px; width:100%; background:
            linear-gradient(135deg, #F6F1E7 50%, transparent 50%),
            linear-gradient(-135deg, #F6F1E7 50%, transparent 50%);
          background-size:14px 14px; background-position:left bottom; background-repeat:repeat-x; margin-top:-1px; }

        .foot-note { margin-top:14px; font-size:11px; color:#8A9186; text-align:center; letter-spacing:.02em; }

        [data-state="success"] .status-label { color:#2F6B4F; }
        [data-state="success"] :global(.ring) { stroke:#3E8B65; }
        [data-state="success"] :global(.mark) { stroke:#3E8B65; }

        [data-state="pending"] .status-label { color:#8A5A0A; }
        [data-state="pending"] :global(.ring) { stroke:#C4901F; }
        [data-state="pending"] :global(.mark) { stroke:#C4901F; }
        [data-state="pending"] :global(.pill) { background:#F5E7CC; color:#8A5A0A; }

        [data-state="failed"] .status-label { color:#9B3B3B; }
        [data-state="failed"] :global(.ring) { stroke:#B23B3B; }
        [data-state="failed"] :global(.mark) { stroke:#B23B3B; }
        [data-state="failed"] :global(.pill) { background:#F3DCDC; color:#9B3B3B; }

        .skeleton { background:linear-gradient(90deg,#EBE3D2 25%,#F6F1E7 37%,#EBE3D2 63%); background-size:400% 100%; animation:shimmer 1.3s ease infinite; border-radius:4px; }
        @keyframes shimmer { 0% { background-position:100% 0; } 100% { background-position:0 0; } }
        .sk-icon { width:60px; height:60px; border-radius:50%; margin:0 auto 16px; }
        .sk-line { height:12px; margin:0 auto 10px; border-radius:4px; }

        .error-box { text-align:center; padding:44px 28px; }
        .em { font-size:26px; margin-bottom:12px; color:#C77B3D; }
        .error-box h2 { font-family:'Fraunces',serif; font-size:16px; margin:0 0 6px; }
        .error-box p { font-size:13px; color:#8A8272; margin:0; }

        .toast {
          position:fixed; left:50%; bottom:28px; transform:translateX(-50%);
          background:#23281F; color:#F6F1E7; font-size:13px; font-weight:500;
          padding:10px 18px; border-radius:6px; z-index:50;
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.mark), .btn { animation:none !important; transition:none !important; }
        }
      `}</style>
    </div>
  );
}