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
    } else { 
      setPwError(true); setPassword('') 
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
      console.error("Fetch error:", err)
    }
    setLoading(false)
  }

  // Tự động hết hạn sau 10 phút
  const autoExpireOrders = (ordersList) => {
    const now = new Date()
    return ordersList.map(order => {
      if (order.status === 'PENDING') {
        const created = new Date(order.createdAt)
        const minutesDiff = (now - created) / (1000 * 60)
        if (minutesDiff > 10) {
          return { ...order, status: 'EXPIRED', paidAt: null }
        }
      }
      return order
    })
  }

  useEffect(() => {
    if (!authed) return
    fetchOrders()
    const iv = setInterval(fetchOrders, 30000)
    return () => clearInterval(iv)
  }, [authed])

  const displayedOrders = autoExpireOrders(orders)

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')
  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN') : '—'

  const totalPaid    = displayedOrders.filter(o => o.status === 'PAID').reduce((s, o) => s + parseInt(o.amount || 0), 0)
  const countPaid    = displayedOrders.filter(o => o.status === 'PAID').length
  const countFailed  = displayedOrders.filter(o => o.status === 'FAILED').length
  const countPending = displayedOrders.filter(o => o.status === 'PENDING').length

  const statusMeta = {
    PAID:      { label: 'Thành công', color: '#10b981', bg: '#ecfdf5' },
    FAILED:    { label: 'Thất bại',   color: '#ef4444', bg: '#fef2f2' },
    PENDING:   { label: 'Chờ xử lý', color: '#f59e0b', bg: '#fefce8' },
    CANCELLED: { label: 'Đã huỷ',    color: '#8b5cf6', bg: '#f3e8ff' },
    EXPIRED:   { label: 'Hết hạn',   color: '#ea580c', bg: '#fff7ed' },
  }

  const FILTERS = [
    { key: 'ALL', label: 'Tất cả', count: displayedOrders.length },
    { key: 'PAID', label: 'Thành công', count: countPaid },
    { key: 'PENDING', label: 'Chờ xử lý', count: countPending },
    { key: 'FAILED', label: 'Thất bại', count: countFailed },
    { key: 'EXPIRED', label: 'Hết hạn', count: displayedOrders.filter(o => o.status === 'EXPIRED').length },
  ]

  const filtered = displayedOrders
    .filter(o => filter === 'ALL' || o.status === filter)
    .filter(o => !search.trim() ||
      o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.orderInfo?.toLowerCase().includes(search.toLowerCase()) ||
      o.transId?.includes(search))

  const deleteOrder = async (orderId) => {
    if (!confirm(`Xóa đơn ${orderId}?`)) return
    try {
      await fetch('/api/momo/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, key: process.env.ADMIN_SECRET_KEY || 'admin-secret123' })
      })
      fetchOrders()
    } catch (e) {}
  }

  if (!authed) {
    // Login UI (giữ nguyên)
    return ( /* ... giữ nguyên phần login từ code cũ */ )
  }

  return (
    <>
      <Head><title>Admin · MoMo</title></Head>
      <style>{CSS}</style>

      <div className="dashboard">
        {/* Fixed Header */}
        <header className="fixed-header">
          <div className="header-content">
            <div className="logo">💰 MoMo Admin</div>
            
            <div className="filters">
              {FILTERS.map(f => (
                <button key={f.key} 
                  className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}>
                  {f.label} <span className="count">({f.count})</span>
                </button>
              ))}
            </div>

            <div className="header-right">
              <div className="search-box">
                <input 
                  placeholder="Tìm mã đơn, nội dung..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
              <button className="refresh-btn" onClick={fetchOrders} disabled={loading}>
                ↻ Làm mới
              </button>
              <button className="logout-btn" onClick={() => {
                sessionStorage.removeItem('momo_admin_authed')
                setAuthed(false)
              }}>
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {/* Stats + Table */}
        <main className="main-content">
          {/* Stats Cards */}
          <div className="stats-grid">
            {/* ... giữ stats như cũ, anh có thể copy từ code trước */}
          </div>

          {/* Table */}
          <div className="table-container">
            {filtered.length === 0 ? (
              <div className="empty">Không có giao dịch nào</div>
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
                    <th>TT lúc</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const sm = statusMeta[o.status] || statusMeta.PENDING
                    return (
                      <tr key={o.orderId}>
                        <td><span className="status-badge" style={{background: sm.bg, color: sm.color}}>{sm.label}</span></td>
                        <td className="amount">{fmt(o.amount)} ₫</td>
                        <td className="info">{o.orderInfo}</td>
                        <td className="code">{o.orderId}</td>
                        <td className="code">{o.transId || '—'}</td>
                        <td>{o.payType || '—'}</td>
                        <td>{fmtDate(o.createdAt)}</td>
                        <td>{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                        <td>
                          <button className="delete-btn" onClick={() => deleteOrder(o.orderId)}>🗑️</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
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