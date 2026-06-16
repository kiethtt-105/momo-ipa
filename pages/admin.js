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
  const [search, setSearch] = useState('')

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
      const adminKey = process.env.ADMIN_SECRET_KEY || 'admin-secret123'
      const res = await fetch(`/api/momo/orders?key=${adminKey}`)
      const data = await res.json()
      setOrders(data.orders || [])
      setLastFetch(new Date())
    } catch (err) {
      console.error("Fetch orders error:", err)
    }
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

  const totalPaid   = orders.filter(o => o.status === 'PAID').reduce((s, o) => s + parseInt(o.amount || 0), 0)
  const countPaid   = orders.filter(o => o.status === 'PAID').length
  const countFailed = orders.filter(o => o.status === 'FAILED').length

  const statusMeta = {
    PAID:    { label: 'Thành công', color: '#10b981', bg: '#ecfdf5' },
    FAILED:  { label: 'Thất bại',   color: '#ef4444', bg: '#fef2f2' },
    PENDING: { label: 'Chờ xử lý', color: '#f59e0b', bg: '#fefce8' },
  }

  const filteredOrders = orders.filter(o => 
    !search.trim() ||
    o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
    o.orderInfo?.toLowerCase().includes(search.toLowerCase()) ||
    o.transId?.toLowerCase().includes(search.toLowerCase())
  )

  if (!authed) {
    return (
      <>
        <Head><title>Admin · MoMo</title></Head>
        <style>{CSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="logo">💰 MoMo</div>
            <h1 className="title">Quản trị viên</h1>
            <p className="subtitle">Đăng nhập để quản lý giao dịch</p>
            
            <div className={`input-group ${pwError ? 'error' : ''}`}>
              <input 
                type="password" 
                placeholder="Nhập mật khẩu admin" 
                value={password}
                onChange={e => { setPassword(e.target.value); setPwError(false) }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoFocus
              />
            </div>
            {pwError && <p className="error-text">Mật khẩu không đúng</p>}
            
            <button className="login-btn" onClick={handleLogin}>
              Đăng nhập
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head><title>Admin · Giao dịch MoMo</title></Head>
      <style>{CSS}</style>

      <div className="dashboard">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <div className="logo">💰 MoMo Admin</div>
            <h1>Tất cả giao dịch</h1>
          </div>
          <div className="header-right">
            <div className="search-container">
              <input 
                type="text" 
                placeholder="Tìm mã đơn, nội dung, mã giao dịch..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="refresh-btn" onClick={fetchOrders} disabled={loading}>
              {loading ? 'Đang tải...' : '↻ Làm mới'}
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="stats">
          <div className="stat-card total">
            <div className="stat-label">TỔNG THU</div>
            <div className="stat-value">{fmt(totalPaid)} <span className="unit">₫</span></div>
          </div>
          <div className="stat-card success">
            <div className="stat-label">THÀNH CÔNG</div>
            <div className="stat-value">{countPaid} <span className="unit">GD</span></div>
          </div>
          <div className="stat-card failed">
            <div className="stat-label">THẤT BẠI</div>
            <div className="stat-value">{countFailed} <span className="unit">GD</span></div>
          </div>
          <div className="stat-card total-orders">
            <div className="stat-label">TỔNG ĐƠN</div>
            <div className="stat-value">{orders.length} <span className="unit">GD</span></div>
          </div>
        </div>

        {/* Table */}
        <div className="table-container">
          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              <p>Không tìm thấy giao dịch nào</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trạng thái</th>
                  <th>Số tiền</th>
                  <th>Nội dung</th>
                  <th>Mã đơn</th>
                  <th>Mã GD MoMo</th>
                  <th>Hình thức</th>
                  <th>Tạo lúc</th>
                  <th>Hoàn tất</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o, i) => {
                  const sm = statusMeta[o.status] || statusMeta.PENDING
                  return (
                    <tr key={o.orderId || i}>
                      <td>
                        <span className="status-badge" style={{ background: sm.bg, color: sm.color }}>
                          {sm.label}
                        </span>
                      </td>
                      <td className="amount">{fmt(o.amount)} ₫</td>
                      <td className="order-info" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                      <td className="code">{o.orderId}</td>
                      <td className="code">{o.transId || '—'}</td>
                      <td>{o.payType || '—'}</td>
                      <td className="date">{fmtDate(o.createdAt)}</td>
                      <td className="date">{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

const CSS = `
  :root {
    --mm: #a50064;
    --success: #10b981;
    --danger: #ef4444;
    --warning: #f59e0b;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Be Vietnam Pro', system-ui, sans-serif; background: #f8f4f7; color: #1f1f1f; }

  .dashboard { padding: 24px; max-width: 1480px; margin: 0 auto; }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 28px; flex-wrap: wrap; gap: 16px;
  }
  .logo { font-size: 28px; font-weight: 900; color: var(--mm); }
  h1 { font-size: 26px; font-weight: 800; }

  .header-right { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .search-container input {
    padding: 12px 20px; border: 2px solid #e0d4db; border-radius: 12px;
    width: 360px; font-size: 15px; outline: none;
  }
  .search-container input:focus { border-color: var(--mm); }

  .refresh-btn {
    padding: 12px 24px; background: white; border: 2px solid #ddd;
    border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;
  }
  .refresh-btn:hover { background: var(--mm); color: white; border-color: var(--mm); }

  /* Stats */
  .stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px;
    margin-bottom: 32px;
  }
  .stat-card {
    background: white; padding: 24px; border-radius: 16px;
    box-shadow: 0 4px 20px rgba(165,0,100,0.08); border: 1px solid #f0e6eb;
  }
  .stat-label { font-size: 13px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 32px; font-weight: 900; margin-top: 8px; }
  .total .stat-value { color: var(--mm); }
  .success .stat-value { color: var(--success); }
  .failed .stat-value { color: var(--danger); }
  .unit { font-size: 18px; font-weight: 600; }

  /* Table */
  .table-container {
    background: white; border-radius: 16px; overflow: hidden;
    box-shadow: 0 10px 30px rgba(165,0,100,0.1); border: 1px solid #f0e6eb;
  }
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th {
    background: #fdf4f8; padding: 16px 12px; text-align: left;
    font-size: 13px; font-weight: 700; color: #666; text-transform: uppercase;
  }
  .data-table td { padding: 16px 12px; border-bottom: 1px solid #f5e9f0; }
  .data-table tr:hover { background: #fff9fb; }

  .status-badge {
    padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px;
  }
  .amount { font-weight: 800; color: var(--mm); font-size: 15.5px; }
  .order-info { max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .code { font-family: monospace; font-size: 14px; color: #444; }
  .date { color: #666; font-size: 14px; white-space: nowrap; }

  .empty-state { padding: 100px 20px; text-align: center; font-size: 18px; color: #888; }

  /* Login */
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8e7f0, #f0d9e8); }
  .login-card { background: white; padding: 48px 40px; border-radius: 20px; width: 100%; max-width: 400px; box-shadow: 0 20px 40px rgba(165,0,100,0.15); text-align: center; }
  .login-card .logo { font-size: 48px; margin-bottom: 16px; }
  .title { font-size: 28px; font-weight: 900; margin-bottom: 8px; }
  .subtitle { color: #666; margin-bottom: 32px; }
  .input-group { margin: 20px 0; }
  .input-group input { width: 100%; padding: 16px; border: 2px solid #ddd; border-radius: 12px; font-size: 16px; }
  .input-group.error input { border-color: #ef4444; }
  .error-text { color: #ef4444; margin: 8px 0; }
  .login-btn { width: 100%; padding: 16px; background: var(--mm); color: white; border: none; border-radius: 12px; font-size: 17px; font-weight: 700; cursor: pointer; margin-top: 12px; }
`