import { useState, useEffect } from 'react'
import Head from 'next/head'

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('momo_admin_authed') === '1'
  })
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState(false)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const handleLogin = () => {
    if (password === (process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'momo@admin')) {
      sessionStorage.setItem('momo_admin_authed', '1')
      setAuthed(true); setPwError(false)
    } else { setPwError(true); setPassword('') }
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY || 'admin-secret'
      const res = await fetch(`/api/momo/orders?key=${adminKey}`)
      const data = await res.json()
      setOrders(data.orders || [])
      setLastFetch(new Date())
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    if (!authed) return
    fetchOrders()
    const iv = setInterval(fetchOrders, 30000)
    return () => clearInterval(iv)
  }, [authed])

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')
  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN') : '—'

  const totalPaid    = orders.filter(o => o.status === 'PAID').reduce((s, o) => s + parseInt(o.amount || 0), 0)
  const countPaid    = orders.filter(o => o.status === 'PAID').length
  const countFailed  = orders.filter(o => o.status === 'FAILED').length
  const countPending = orders.filter(o => o.status === 'PENDING').length

  const statusMeta = {
    PAID:      { label: 'Thành công', color: '#15803d', bg: '#dcfce7' },
    FAILED:    { label: 'Thất bại',   color: '#dc2626', bg: '#fee2e2' },
    PENDING:   { label: 'Chờ xử lý', color: '#d97706', bg: '#fef9c3' },
    CANCELLED: { label: 'Đã huỷ',    color: '#7c3aed', bg: '#ede9fe' },
    EXPIRED:   { label: 'Hết hạn',   color: '#ea580c', bg: '#ffedd5' },
  }

  const FILTERS = [
    { key: 'ALL',       label: 'Tất cả',     count: orders.length },
    { key: 'PAID',      label: 'Thành công', count: countPaid },
    { key: 'PENDING',   label: 'Chờ xử lý', count: countPending },
    { key: 'FAILED',    label: 'Thất bại',   count: countFailed },
    { key: 'CANCELLED', label: 'Đã huỷ',     count: orders.filter(o => o.status === 'CANCELLED').length },
    { key: 'EXPIRED',   label: 'Hết hạn',    count: orders.filter(o => o.status === 'EXPIRED').length },
  ]

  const filtered = orders
    .filter(o => filter === 'ALL' || o.status === filter)
    .filter(o => !search.trim() ||
      o.orderId?.includes(search) ||
      o.orderInfo?.toLowerCase().includes(search.toLowerCase()) ||
      o.transId?.includes(search))

  // ── Login ──────────────────────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin · Đăng nhập</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{CSS}</style>
      <div className="login-wrap">
        <div className="login-card">
          <div className="lc-logo">
            <div className="mm-mark">
              <svg viewBox="0 0 30 30" fill="none" width="28" height="28">
                <circle cx="9.5" cy="15" r="6" fill="white" />
                <circle cx="20.5" cy="15" r="6" fill="white" />
                <circle cx="9.5" cy="15" r="3" fill="#a50064" />
                <circle cx="20.5" cy="15" r="3" fill="#a50064" />
              </svg>
            </div>
          </div>
          <div className="lc-title">Quản lý giao dịch</div>
          <div className="lc-sub">Đăng nhập để xem dashboard</div>
          <div className={`pw-wrap ${pwError ? 'err' : ''}`}>
            <svg className="pw-ico" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input className="pw-input" type="password" placeholder="Mật khẩu admin"
              value={password}
              onChange={e => { setPassword(e.target.value); setPwError(false) }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus />
          </div>
          {pwError && <div className="pw-err">⚠ Mật khẩu không đúng</div>}
          <button className="login-btn" onClick={handleLogin}>Đăng nhập</button>
        </div>
      </div>
    </>
  )

  // ── Dashboard ──────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Admin · Giao dịch MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{CSS}</style>

      <div className="page">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sb-top">
            <div className="sb-brand">
              <div className="mm-mark sm">
                <svg viewBox="0 0 30 30" fill="none" width="22" height="22">
                  <circle cx="9.5" cy="15" r="6" fill="white" />
                  <circle cx="20.5" cy="15" r="6" fill="white" />
                  <circle cx="9.5" cy="15" r="3" fill="#a50064" />
                  <circle cx="20.5" cy="15" r="3" fill="#a50064" />
                </svg>
              </div>
              <div>
                <div className="sb-name">MoMo Admin</div>
                <div className="sb-tag">Dashboard</div>
              </div>
            </div>
            <nav className="sb-nav">
              {FILTERS.map(f => {
                const sm = statusMeta[f.key]
                const dotColor = sm ? sm.color : '#a50064'
                return (
                  <button key={f.key}
                    className={`nav-item ${filter === f.key ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}>
                    <span className="nav-dot" style={{ background: dotColor }} />
                    <span className="nav-lbl">{f.label}</span>
                    <span className="nav-cnt">{f.count}</span>
                  </button>
                )
              })}
            </nav>
          </div>
          <button className="logout-btn" onClick={() => { sessionStorage.removeItem('momo_admin_authed'); setAuthed(false) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Đăng xuất
          </button>
        </aside>

        {/* Main */}
        <main className="main">
          {/* Topbar */}
          <div className="topbar">
            <div>
              <div className="page-title">Giao dịch</div>
              <div className="page-sub">{lastFetch ? `Cập nhật ${lastFetch.toLocaleTimeString('vi-VN')}` : 'Đang tải...'}</div>
            </div>
            <div className="topbar-right">
              <div className="search-box">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="s-ico">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <input className="search-inp" placeholder="Tìm mã đơn, nội dung…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button className="refresh-btn" onClick={fetchOrders} disabled={loading}>
                <svg className={loading ? 'rotating' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {loading ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-k">Tổng thu</div>
              <div className="stat-v mm">{fmt(totalPaid)} <span className="stat-u">₫</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-k">Thành công</div>
              <div className="stat-v green">{countPaid} <span className="stat-u">GD</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-k">Thất bại</div>
              <div className="stat-v red">{countFailed} <span className="stat-u">GD</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-k">Tổng đơn</div>
              <div className="stat-v">{orders.length} <span className="stat-u">GD</span></div>
            </div>
          </div>

          {/* Table */}
          <div className="table-card">
            {filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">📭</div>
                <div className="empty-title">Không có giao dịch nào</div>
                <div className="empty-sub">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</div>
              </div>
            ) : (
              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Trạng thái</th>
                      <th>Số tiền</th>
                      <th>Nội dung</th>
                      <th>Mã đơn</th>
                      <th>Mã GD MoMo</th>
                      <th>Hình thức</th>
                      <th>Tạo lúc</th>
                      <th>TT lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o, i) => {
                      const sm = statusMeta[o.status] || statusMeta.PENDING
                      return (
                        <tr key={o.orderId || i}>
                          <td>
                            <span className="badge" style={{ color: sm.color, background: sm.bg }}>
                              <span className="badge-dot" style={{ background: sm.color }} />
                              {sm.label}
                            </span>
                          </td>
                          <td className="amt-cell">{fmt(o.amount)} ₫</td>
                          <td className="info-cell" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                          <td className="mono-cell">{o.orderId}</td>
                          <td className="mono-cell">{o.transId || '—'}</td>
                          <td className="muted-cell">{o.payType || '—'}</td>
                          <td className="date-cell">{fmtDate(o.createdAt)}</td>
                          <td className="date-cell">{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --mm: #a50064; --mm-d: #8a0054; --mm-dd: #6e0043;
    --mm-soft: #f9eaf4; --mm-border: #e8c4d8; --mm-pale: #fdf5fa;
    --text: #1a0a10; --muted: #7a4060;
    --bg: #f5f0f3; --surface: #ffffff; --surface2: #fdf0f8;
  }
  body { font-family: 'Be Vietnam Pro', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  /* ── MOMO MARK ── */
  .mm-mark {
    width: 44px; height: 44px; border-radius: 13px;
    background: var(--mm); display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; box-shadow: 0 4px 14px rgba(165,0,100,.32);
  }
  .mm-mark.sm { width: 36px; height: 36px; border-radius: 10px; }

  /* ── LOGIN ── */
  .login-wrap {
    min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
    background: var(--bg);
  }
  .login-card {
    background: var(--surface);
    border-radius: 16px; padding: 40px 36px;
    width: 100%; max-width: 360px; text-align: center;
    box-shadow: 0 2px 16px rgba(165,0,100,.10);
  }
  .lc-logo { display: flex; justify-content: center; margin-bottom: 18px; }
  .lc-title { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
  .lc-sub   { font-size: 13px; color: var(--muted); margin-bottom: 28px; }
  .pw-wrap {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface2); border: 1.5px solid var(--mm-border);
    border-radius: 10px; padding: 0 14px; margin-bottom: 8px;
    transition: border .15s, box-shadow .15s;
  }
  .pw-wrap:focus-within { border-color: var(--mm); box-shadow: 0 0 0 3px rgba(165,0,100,.1); }
  .pw-wrap.err { border-color: #fca5a5; }
  .pw-ico { color: var(--muted); flex-shrink: 0; display: flex; }
  .pw-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 14px;
    color: var(--text); padding: 13px 0;
  }
  .pw-input::placeholder { color: var(--muted); opacity: .55; }
  .pw-err { font-size: 12px; color: #dc2626; font-weight: 600; margin-bottom: 10px; text-align: left; }
  .login-btn {
    width: 100%; padding: 14px; border: none; border-radius: 10px;
    background: var(--mm); color: #fff;
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 15px; font-weight: 800;
    cursor: pointer; box-shadow: 0 4px 14px rgba(165,0,100,.32);
    transition: background .14s, transform .14s;
  }
  .login-btn:hover { background: var(--mm-d); transform: translateY(-1px); }
  .login-btn:active { background: var(--mm-dd); transform: scale(.99); }

  /* ── LAYOUT ── */
  .page { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
  @media(max-width:768px) { .page { grid-template-columns: 1fr; } .sidebar { display: none; } }

  /* ── SIDEBAR ── */
  .sidebar {
    background: var(--surface); border-right: 1px solid var(--mm-border);
    padding: 22px 14px; display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .sb-top { flex: 1; }
  .sb-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; margin-bottom: 28px; }
  .sb-name { font-size: 14px; font-weight: 800; color: var(--text); }
  .sb-tag  { font-size: 10px; color: var(--muted); letter-spacing: .3px; }
  .sb-nav  { display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    display: flex; align-items: center; gap: 10px; padding: 9px 12px;
    border-radius: 9px; border: none; background: transparent;
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 13px; font-weight: 600;
    color: var(--muted); cursor: pointer; text-align: left;
    transition: all .13s;
  }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active { background: var(--mm-soft); color: var(--mm); }
  .nav-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .nav-lbl { flex: 1; }
  .nav-cnt {
    font-size: 11px; font-weight: 700; background: var(--surface2);
    padding: 2px 7px; border-radius: 999px; color: var(--muted);
  }
  .nav-item.active .nav-cnt { background: rgba(165,0,100,.12); color: var(--mm); }
  .logout-btn {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px;
    border-radius: 9px; border: none; background: transparent;
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 13px; font-weight: 600;
    color: var(--muted); cursor: pointer; transition: all .13s; margin-top: 8px;
  }
  .logout-btn:hover { background: #fee2e2; color: #dc2626; }

  /* ── MAIN ── */
  .main { padding: 28px 28px 48px; overflow-x: hidden; }
  @media(max-width:768px) { .main { padding: 20px 16px 48px; } }

  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 22px; flex-wrap: wrap; gap: 12px;
  }
  .page-title { font-size: 22px; font-weight: 900; color: var(--text); }
  .page-sub   { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .topbar-right { display: flex; align-items: center; gap: 10px; }

  .search-box {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1.5px solid var(--mm-border);
    border-radius: 9px; padding: 0 12px;
    transition: border .14s, box-shadow .14s;
  }
  .search-box:focus-within { border-color: var(--mm); box-shadow: 0 0 0 3px rgba(165,0,100,.1); }
  .s-ico { color: var(--muted); flex-shrink: 0; }
  .search-inp {
    background: transparent; border: none; outline: none;
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 13px;
    color: var(--text); padding: 9px 0; width: 180px;
  }
  .search-inp::placeholder { color: var(--muted); opacity: .55; }

  .refresh-btn {
    display: flex; align-items: center; gap: 7px; padding: 9px 16px;
    border-radius: 9px; border: 1.5px solid var(--mm-border);
    background: var(--surface); color: var(--muted);
    font-family: 'Be Vietnam Pro', sans-serif; font-size: 13px; font-weight: 700;
    cursor: pointer; transition: all .13s;
  }
  .refresh-btn:hover:not(:disabled) { border-color: var(--mm); color: var(--mm); background: var(--mm-soft); }
  .refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
  .rotating { animation: rot .7s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg) } }

  /* ── STATS ── */
  .stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 14px; margin-bottom: 22px;
  }
  @media(max-width:640px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  .stat-card {
    background: var(--surface); border: 1px solid var(--mm-border);
    border-radius: 12px; padding: 16px 18px;
    transition: box-shadow .2s, transform .2s;
  }
  .stat-card:hover { box-shadow: 0 3px 14px rgba(165,0,100,.1); transform: translateY(-1px); }
  .stat-k { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 8px; }
  .stat-v { font-size: 26px; font-weight: 900; color: var(--text); }
  .stat-v.mm    { color: var(--mm); }
  .stat-v.green { color: #15803d; }
  .stat-v.red   { color: #dc2626; }
  .stat-u { font-size: 13px; font-weight: 500; color: var(--muted); }

  /* ── TABLE ── */
  .table-card {
    background: var(--surface); border: 1px solid var(--mm-border);
    border-radius: 14px; overflow: hidden;
  }
  .tbl-scroll { overflow-x: auto; }
  .tbl { width: 100%; border-collapse: collapse; min-width: 820px; }
  .tbl thead tr { border-bottom: 1.5px solid var(--mm-border); background: var(--surface2); }
  .tbl th {
    padding: 12px 16px; text-align: left;
    font-size: 10px; font-weight: 800; color: var(--muted);
    text-transform: uppercase; letter-spacing: .8px; white-space: nowrap;
  }
  .tbl tbody tr { border-bottom: 1px solid var(--mm-border); transition: background .1s; }
  .tbl tbody tr:last-child { border-bottom: none; }
  .tbl tbody tr:hover { background: var(--mm-pale); }
  .tbl td { padding: 12px 16px; font-size: 13px; vertical-align: middle; }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 700; white-space: nowrap;
  }
  .badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .amt-cell   { font-weight: 900; color: var(--mm); white-space: nowrap; font-size: 14px; }
  .info-cell  { max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mono-cell  { font-family: monospace; font-size: 11px; color: var(--muted); }
  .date-cell  { white-space: nowrap; color: var(--muted); font-size: 12px; }
  .muted-cell { color: var(--muted); }

  .empty { padding: 72px 24px; text-align: center; }
  .empty-ico   { font-size: 44px; margin-bottom: 12px; }
  .empty-title { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
  .empty-sub   { font-size: 13px; color: var(--muted); }
`