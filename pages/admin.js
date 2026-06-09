import { useState, useEffect } from 'react'
import Head from 'next/head'

export default function AdminPage() {
  const [authed,   setAuthed]   = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('momo_admin_authed') === '1'
  })
  const [password, setPassword] = useState('')
  const [pwError,  setPwError]  = useState(false)
  const [orders,   setOrders]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [filter,   setFilter]   = useState('ALL') // ALL | PAID | FAILED | PENDING

  const handleLogin = () => {
    if (password === (process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'momo@admin')) {
      sessionStorage.setItem('momo_admin_authed', '1')
      setAuthed(true)
      setPwError(false)
    } else {
      setPwError(true)
      setPassword('')
    }
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY || 'admin-secret'
      const res  = await fetch(`/api/momo/orders?key=${adminKey}`)
      const data = await res.json()
      setOrders(data.orders || [])
      setLastFetch(new Date())
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    if (!authed) return
    fetchOrders()
    const interval = setInterval(fetchOrders, 30000) // auto-refresh 30s
    return () => clearInterval(interval)
  }, [authed])

  const fmt     = n => parseInt(n || 0).toLocaleString('vi-VN')
  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN') : '—'

  const filtered = orders.filter(o =>
    filter === 'ALL' ? true : o.status === filter
  )

  const totalPaid = orders
    .filter(o => o.status === 'PAID')
    .reduce((s, o) => s + parseInt(o.amount || 0), 0)

  const countPaid      = orders.filter(o => o.status === 'PAID').length
  const countFailed    = orders.filter(o => o.status === 'FAILED').length
  const countPending   = orders.filter(o => o.status === 'PENDING').length
  const countCancelled = orders.filter(o => o.status === 'CANCELLED').length
  const countExpired   = orders.filter(o => o.status === 'EXPIRED').length

  // ─── Render login ──────────────────────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin — Đăng nhập</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <style>{css}</style>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-icon">🔐</div>
          <div className="login-title">Quản lý giao dịch</div>
          <div className="login-sub">Nhập mật khẩu để tiếp tục</div>
          <input
            className={`pw-input ${pwError ? 'pw-error' : ''}`}
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={e => { setPassword(e.target.value); setPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoFocus
          />
          {pwError && <div className="pw-err-msg">⚠️ Sai mật khẩu</div>}
          <button className="login-btn" onClick={handleLogin}>Đăng nhập</button>
        </div>
      </div>
    </>
  )

  // ─── Render dashboard ──────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Admin — Giao dịch</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <style>{css}</style>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div className="header-logo">M</div>
            <div>
              <div className="header-title">Giao dịch MoMo</div>
              <div className="header-sub">
                {lastFetch ? `Cập nhật lúc ${lastFetch.toLocaleTimeString('vi-VN')}` : 'Đang tải...'}
              </div>
            </div>
          </div>
          <div className="header-right">
            <button className="refresh-btn" onClick={fetchOrders} disabled={loading}>
              {loading ? '⏳' : '🔄'} Làm mới
            </button>
            <button className="logout-btn" onClick={() => { sessionStorage.removeItem('momo_admin_authed'); setAuthed(false) }}>Đăng xuất</button>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Tổng thu</div>
            <div className="stat-value pink">{fmt(totalPaid)} <span className="stat-unit">VND</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Thành công</div>
            <div className="stat-value green">{countPaid} <span className="stat-unit">GD</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Thất bại</div>
            <div className="stat-value red">{countFailed} <span className="stat-unit">GD</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tổng đơn</div>
            <div className="stat-value">{orders.length} <span className="stat-unit">GD</span></div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="filter-row">
          {[
            { key: 'ALL',       label: 'Tất cả',       icon: '📋' },
            { key: 'PAID',      label: 'Thành công',   icon: '✅' },
            { key: 'PENDING',   label: 'Chờ xử lý',   icon: '⏳' },
            { key: 'FAILED',    label: 'Thất bại',     icon: '❌' },
            { key: 'CANCELLED', label: 'Đã huỷ',       icon: '🚫' },
            { key: 'EXPIRED',   label: 'Hết hạn',      icon: '⌛' },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              className={`filter-btn ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {icon} {label}
              <span className="filter-count">
                {key === 'ALL' ? orders.length : orders.filter(o => o.status === key).length}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📭</div>
              <div>Chưa có giao dịch nào</div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Trạng thái</th>
                  <th>Số tiền</th>
                  <th>Nội dung</th>
                  <th>Mã đơn</th>
                  <th>Mã GD MoMo</th>
                  <th>Hình thức</th>
                  <th>Tạo lúc</th>
                  <th>Thanh toán lúc</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => (
                  <tr key={o.orderId || i}>
                    <td>
                      <span className={`badge badge-${(o.status||'').toLowerCase()}`}>
                        {o.status === 'PAID'      ? '✅ Thành công'
                          : o.status === 'FAILED'    ? '❌ Thất bại'
                          : o.status === 'CANCELLED' ? '🚫 Đã huỷ'
                          : o.status === 'EXPIRED'   ? '⌛ Hết hạn'
                          : '⏳ Chờ xử lý'}
                      </span>
                    </td>
                    <td className="amount-cell">{fmt(o.amount)} ₫</td>
                    <td className="info-cell">{o.orderInfo || '—'}</td>
                    <td className="mono">{o.orderId}</td>
                    <td className="mono">{o.transId || '—'}</td>
                    <td>{o.payType || '—'}</td>
                    <td className="date-cell">{fmtDate(o.createdAt)}</td>
                    <td className="date-cell">{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ─── CSS ────────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Be Vietnam Pro', sans-serif;
    background: #fdf0f8; min-height: 100vh; color: #1a0a14;
  }

  /* ── Login ── */
  .login-wrap {
    min-height: 100vh; display: flex;
    align-items: center; justify-content: center; padding: 20px;
  }
  .login-card {
    background: #fff; border-radius: 24px; padding: 44px 40px;
    width: 100%; max-width: 380px; text-align: center;
    box-shadow: 0 8px 40px rgba(216,45,139,.15);
    border: 1px solid #f0d0e5;
  }
  .login-icon  { font-size: 52px; margin-bottom: 12px; }
  .login-title { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .login-sub   { font-size: 14px; color: #9a6070; margin-bottom: 28px; }
  .pw-input {
    width: 100%; padding: 13px 16px;
    border: 1.5px solid #f0d0e5; border-radius: 12px;
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 15px;
    background: #fdf0f8; outline: none; margin-bottom: 8px;
    transition: border .2s, box-shadow .2s;
  }
  .pw-input:focus { border-color: #d82d8b; box-shadow: 0 0 0 3px rgba(216,45,139,.1); background:#fff; }
  .pw-input.pw-error { border-color: #f87171; }
  .pw-err-msg { color: #b91c1c; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
  .login-btn {
    width: 100%; padding: 14px;
    background: linear-gradient(135deg,#e8237c,#d82d8b);
    color: #fff; border: none; border-radius: 12px;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 15px; font-weight: 700; cursor: pointer;
    box-shadow: 0 4px 16px rgba(216,45,139,.3);
    transition: all .2s; margin-top: 4px;
  }
  .login-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(216,45,139,.4); }

  /* ── Dashboard ── */
  .page { max-width: 1100px; margin: 0 auto; padding: 24px 20px 48px; }

  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 28px; flex-wrap: wrap; gap: 12px;
  }
  .header-left  { display: flex; align-items: center; gap: 12px; }
  .header-right { display: flex; align-items: center; gap: 10px; }
  .header-logo {
    width: 44px; height: 44px; border-radius: 14px;
    background: linear-gradient(135deg,#e8237c,#d82d8b);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 22px; font-weight: 900;
    box-shadow: 0 4px 16px rgba(216,45,139,.35);
    flex-shrink: 0;
  }
  .header-title { font-size: 20px; font-weight: 800; }
  .header-sub   { font-size: 12px; color: #b0809a; margin-top: 2px; }

  .refresh-btn, .logout-btn {
    padding: 8px 16px; border-radius: 10px;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all .15s;
  }
  .refresh-btn {
    background: #fdf0f8; border: 1.5px solid #f0d0e5; color: #9a6070;
  }
  .refresh-btn:hover:not(:disabled) { border-color: #d82d8b; color: #d82d8b; }
  .refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
  .logout-btn {
    background: #fff; border: 1.5px solid #f0d0e5; color: #9a6070;
  }
  .logout-btn:hover { border-color: #f87171; color: #b91c1c; }

  /* ── Stats ── */
  .stats-row {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 14px; margin-bottom: 24px;
  }
  @media(max-width:700px) { .stats-row { grid-template-columns: repeat(2,1fr); } }
  .stat-card {
    background: #fff; border-radius: 16px; padding: 18px 20px;
    border: 1px solid #f0d0e5;
    box-shadow: 0 2px 12px rgba(216,45,139,.07);
  }
  .stat-label { font-size: 12px; font-weight: 600; color: #9a6070; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .5px; }
  .stat-value { font-size: 24px; font-weight: 800; color: #1a0a14; }
  .stat-value.pink  { color: #d82d8b; }
  .stat-value.green { color: #15803d; }
  .stat-value.red   { color: #b91c1c; }
  .stat-unit { font-size: 13px; font-weight: 500; color: #9a6070; }

  /* ── Filter tabs ── */
  .filter-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .filter-btn {
    padding: 7px 14px; border-radius: 999px;
    border: 1.5px solid #f0d0e5; background: #fff;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 13px; font-weight: 600; color: #9a6070;
    cursor: pointer; transition: all .15s;
    display: flex; align-items: center; gap: 6px;
  }
  .filter-btn:hover { border-color: #d82d8b; color: #d82d8b; }
  .filter-btn.active { background: #d82d8b; border-color: #d82d8b; color: #fff; }
  .filter-count {
    background: rgba(0,0,0,.08); border-radius: 999px;
    padding: 1px 7px; font-size: 11px;
  }
  .filter-btn.active .filter-count { background: rgba(255,255,255,.25); }

  /* ── Table ── */
  .table-wrap {
    background: #fff; border-radius: 18px;
    border: 1px solid #f0d0e5;
    box-shadow: 0 4px 20px rgba(216,45,139,.08);
    overflow-x: auto;
  }
  .table { width: 100%; border-collapse: collapse; }
  .table thead tr {
    border-bottom: 1.5px solid #f0d0e5;
  }
  .table th {
    padding: 13px 16px; text-align: left;
    font-size: 11px; font-weight: 700; color: #9a6070;
    text-transform: uppercase; letter-spacing: .6px;
    white-space: nowrap;
  }
  .table tbody tr {
    border-bottom: 1px solid #fdf0f8;
    transition: background .1s;
  }
  .table tbody tr:last-child { border-bottom: none; }
  .table tbody tr:hover { background: #fdf0f8; }
  .table td { padding: 13px 16px; font-size: 13px; vertical-align: middle; }

  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .badge-paid      { background: #dcfce7; color: #15803d; }
  .badge-failed    { background: #fee2e2; color: #b91c1c; }
  .badge-pending   { background: #fef9c3; color: #92400e; }
  .badge-cancelled { background: #f3f4f6; color: #6b7280; }
  .badge-expired   { background: #fef3c7; color: #b45309; }

  .amount-cell { font-weight: 800; color: #d82d8b; white-space: nowrap; }
  .mono        { font-family: monospace; font-size: 11px; color: #9a6070; }
  .info-cell   { max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .date-cell   { white-space: nowrap; color: #9a6070; font-size: 12px; }

  .empty {
    padding: 60px 20px; text-align: center;
    color: #b0809a; font-size: 14px; font-weight: 500;
  }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
`
