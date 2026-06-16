import { useState, useEffect } from 'react'
import Head from 'next/head'
// Trang quản trị viên để xem và quản lý các giao dịch MoMo
export default function AdminPage() {
  const [authed, setAuthed] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('momo_admin_authed') === '1'
  })
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState(false)
  const [orders, setOrders] = useState([])  
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedOrders, setSelectedOrders] = useState(new Set())
// Xử lý đăng nhập admin
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
// Lấy danh sách đơn hàng từ server
 const fetchOrders = async (force = false) => {
  if (loading) return
  if (!force && selectedOrders.size > 0) return; // ← Tạm dừng refresh khi đang chọn đơn

  setLoading(true)
  try {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'admin-secret123'
    const res = await fetch(`/api/momo/orders?key=${adminKey}`)
    const data = await res.json()
    
    const newOrders = data.orders || []
    setOrders(newOrders)

    // Giữ lại các đơn đã chọn nếu chúng vẫn tồn tại
    if (selectedOrders.size > 0) {
      const stillExist = Array.from(selectedOrders).filter(id => 
        newOrders.some(order => order.orderId === id)
      )
      setSelectedOrders(new Set(stillExist))
    }
  } catch (err) {
    console.error("Fetch orders error:", err)
  }
  setLoading(false)
}

  useEffect(() => {
    if (!authed) return
    
    fetchOrders(true) // Lần đầu luôn fetch
    
    const iv = setInterval(() => {
      fetchOrders()   // Các lần sau sẽ check có đang chọn đơn không
    }, 1000)
    
    return () => clearInterval(iv)
  }, [authed, selectedOrders.size])   // ← Thêm dependency này

// Chuẩn hóa trạng thái đơn hàng để dễ dàng lọc và hiển thị
  const normalizeOrders = (ordersList) => {
    const now = new Date()
    return ordersList.map(order => {
      let status = order.status || 'PENDING'
      if (status === 'Chờ xử lý') status = 'PENDING'
      if (status === 'Thành công') status = 'PAID'
      if (status === 'Thất bại') status = 'FAILED'

      if (status === 'PENDING') {
        const created = new Date(order.createdAt)
        if ((now - created) / (1000 * 60) > 10) status = 'EXPIRED'
      }
      return { ...order, status }
    })
  }


  const displayedOrders = normalizeOrders(orders)

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')
  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN') : '—'

  const countPaid    = displayedOrders.filter(o => o.status === 'PAID').length
  const countFailed  = displayedOrders.filter(o => o.status === 'FAILED').length
  const countPending = displayedOrders.filter(o => o.status === 'PENDING').length
  const countExpired = displayedOrders.filter(o => o.status === 'EXPIRED').length
  const totalOrders  = displayedOrders.length
// Tính tổng tiền của các đơn đã thanh toán
  const totalPaid = displayedOrders
    .filter(o => o.status === 'PAID')
    .reduce((sum, o) => sum + parseInt(o.amount || 0), 0)

  const statusMeta = {
    PAID:    { label: 'Thành công', color: '#10b981', bg: '#ecfdf5' },
    FAILED:  { label: 'Thất bại',   color: '#ef4444', bg: '#fef2f2' },
    PENDING: { label: 'Chờ xử lý',  color: '#f59e0b', bg: '#fefce8' },
    EXPIRED: { label: 'Hết hạn',    color: '#ea580c', bg: '#fff7ed' },
  }
// Các bộ lọc trạng thái đơn hàng
  const FILTERS = [
    { key: 'ALL',     label: 'Tất cả',       count: totalOrders },
    { key: 'PAID',    label: 'Thành công',   count: countPaid },
    { key: 'PENDING', label: 'Chờ xử lý',    count: countPending },
    { key: 'FAILED',  label: 'Thất bại',     count: countFailed },
    { key: 'EXPIRED', label: 'Hết hạn',      count: countExpired },
  ]
// Lọc và tìm kiếm đơn hàng dựa trên trạng thái và từ khóa
  const filteredOrders = displayedOrders
    .filter(o => filter === 'ALL' || o.status === filter)
    .filter(o => 
      !search.trim() ||
      o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.orderInfo?.toLowerCase().includes(search.toLowerCase()) ||
      (o.transId && o.transId.includes(search))
    )

  const toggleSelect = (orderId) => {
    const newSet = new Set(selectedOrders)
    newSet.has(orderId) ? newSet.delete(orderId) : newSet.add(orderId)
    setSelectedOrders(newSet)
  }

  const toggleSelectAll = () => {
    selectedOrders.size === filteredOrders.length
      ? setSelectedOrders(new Set())
      : setSelectedOrders(new Set(filteredOrders.map(o => o.orderId)))
  }

  const performDelete = async (idsToDelete) => {
    try {
      const adminKey = process.env.ADMIN_SECRET_KEY || 'admin-secret123'
      for (const orderId of idsToDelete) {
        await fetch(`/api/momo/delete?key=${adminKey}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        })
      }
      await fetchOrders(true)
      alert(`Đã xóa ${idsToDelete.length} đơn hàng`)
    } catch (err) {
      console.error(err)
      alert('Lỗi khi xóa')
    }
  }

  const deleteOrder = async (orderId) => {
    if (!confirm(`Xóa đơn ${orderId}?\n`)) return
    await performDelete([orderId])
  }

  const deleteSelected = async () => {
    if (selectedOrders.size === 0) return
    if (!confirm(`Xóa ${selectedOrders.size} đơn đã chọn?\nKhông thể hoàn tác!`)) return
    await performDelete(Array.from(selectedOrders))
  }
// Nếu chưa đăng nhập, hiển thị form đăng nhập
  if (!authed) {
    return (
      <>
        <Head>
          <title>Admin · Đăng nhập</title>
          <link rel="icon" type="image/png" href="/Main.png" /> 
        </Head>
        <style>{CSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="logo">💰 MoMo</div>
            <h1 className="title">Quản trị viên</h1>
            <p className="subtitle">Đăng nhập để quản lý giao dịch</p>
            <div className={`input-group ${pwError ? 'error' : ''}`}>
              <input type="password" placeholder="Nhập mật khẩu admin" value={password}
                onChange={e => {setPassword(e.target.value); setPwError(false)}}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
            </div>
            {pwError && <p className="error-text">Mật khẩu không đúng</p>}
            <button className="login-btn" onClick={handleLogin}>Đăng nhập</button>
          </div>
        </div>
      </>
    )
  }
// Nếu đã đăng nhập, hiển thị dashboard quản lý đơn hàng
  return (
    <>
      <Head>
        <title>Admin · Giao dịch MoMo</title>
        <link rel="icon" type="image/png" href="/Main.png" /> 
      </Head>
      <style>{CSS}</style>

      <div className="dashboard">
        <header className="fixed-header">
          <div className="header-content">
            <div className="logo">💰 MoMo Admin</div>

            <div className="filters">
              {FILTERS.map(f => (
                <button key={f.key} className={`filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                  {f.label} <span className="count">({f.count})</span>
                </button>
              ))}
            </div>

            <div className="header-right">
              <div className="search-box">
                <input type="text" placeholder="Tìm mã đơn, nội dung..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              {selectedOrders.size > 0 && (
                <button className="bulk-delete-btn" onClick={deleteSelected}>
                  🗑️ Xóa đã chọn ({selectedOrders.size})
                </button>
              )}

              
              <button className="logout-btn" onClick={() => {
                sessionStorage.removeItem('momo_admin_authed')
                setAuthed(false)
              }}>Đăng xuất</button>
            </div>
          </div>
        </header>

        <main className="main-content">
          <div className="stats-grid">
            <div className="stat-card total"><div className="stat-label">TỔNG THU</div><div className="stat-value">{fmt(totalPaid)} ₫</div></div>
            <div className="stat-card success"><div className="stat-label">THÀNH CÔNG</div><div className="stat-value">{countPaid} GD</div></div>
            <div className="stat-card failed"><div className="stat-label">THẤT BẠI</div><div className="stat-value">{countFailed} GD</div></div>
            <div className="stat-card total-orders"><div className="stat-label">TỔNG ĐƠN</div><div className="stat-value">{totalOrders} GD</div></div>
          </div>

          <div className="table-container">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">Không có giao dịch nào</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0} onChange={toggleSelectAll} /></th>
                    <th>Trạng thái</th>
                    <th>Số tiền</th>
                    <th>Nội dung</th>
                    <th>Mã đơn</th>
                    <th>Mã GD MoMo</th>
                    <th>Hình thức</th>
                    <th>Tạo lúc</th>
                    <th>Hoàn tất</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => {
                    const sm = statusMeta[o.status] || statusMeta.PENDING
                    const isSelected = selectedOrders.has(o.orderId)
                    return (
                      <tr key={o.orderId} className={isSelected ? 'selected-row' : ''}>
                        <td><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(o.orderId)} /></td>
                        <td><span className="status-badge" style={{background: sm.bg, color: sm.color}}>{sm.label}</span></td>
                        <td className="amount">{fmt(o.amount)} ₫</td>
                        <td className="info" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                        <td className="code">{o.orderId}</td>
                        <td className="code">{o.transId || '—'}</td>
                        <td>{o.payType || '—'}</td>
                        <td className="date">{fmtDate(o.createdAt)}</td>
                        <td className="date">{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                        <td><button className="delete-btn" onClick={() => deleteOrder(o.orderId)}>🗑️</button></td>
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
// CSS cho trang admin, bao gồm cả phần dashboard và form đăng nhập
const CSS = `
  :root { 
    --mm: #a50064; 
    --success: #10b981; 
    --danger: #ef4444; 
    --warning: #f59e0b; 
    --purple: #7c3aed;
  }

  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Be Vietnam Pro', sans-serif; background: #f8f4f7; }

  .dashboard { padding-top: 90px; }

  /* HEADER */
  .fixed-header { 
    position: fixed; top: 0; left: 0; right: 0; 
    background: white; z-index: 100; 
    border-bottom: 1px solid #e8c4d8; 
    box-shadow: 0 2px 10px rgba(165,0,100,0.1); 
  }

  .header-content { 
    max-width: 1480px; margin: 0 auto; padding: 14px 24px; 
    display: flex; align-items: center; justify-content: space-between; 
    flex-wrap: wrap; gap: 12px; 
  }

  .logo { font-size: 26px; font-weight: 900; color: var(--mm); }

  .filters { display: flex; gap: 8px; flex-wrap: wrap; }
  
  .filter-btn { 
    padding: 8px 18px; 
    border: 1px solid #ddd; 
    border-radius: 999px; 
    background: white; 
    font-weight: 600; 
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .filter-btn:hover { 
    background: #f8e7f0; 
    border-color: var(--mm); 
    transform: translateY(-1px);
  }
  .filter-btn.active { 
    background: var(--mm); 
    color: white; 
    border-color: var(--mm); 
  }

  .header-right { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
    flex-wrap: wrap; 
  }

  .search-box input { 
    padding: 10px 18px; 
    border: 2px solid #e0d4db; 
    border-radius: 12px; 
    width: 280px; 
    font-size: 15px;
    transition: all 0.2s ease;
  }
  .search-box input:focus { 
    outline: none; 
    border-color: var(--mm); 
    box-shadow: 0 0 0 3px rgba(165, 0, 100, 0.1);
  }

  .bulk-delete-btn { 
    background: #ef4444; 
    color: white; 
    border: none; 
    padding: 10px 18px;
    border-radius: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .bulk-delete-btn:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  .logout-btn { 
    background: #f3e8ff; 
    color: var(--purple); 
    border: 2px solid #c4b5fd; 
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }
  .logout-btn:hover {
    background: #e0d4ff;
    border-color: var(--purple);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
  }

  /* STATS */
  .stats-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); 
    gap: 20px; 
    margin: 24px; 
  }
  .stat-card { 
    background: white; 
    padding: 24px; 
    border-radius: 16px; 
    box-shadow: 0 4px 15px rgba(0,0,0,0.06); 
    transition: all 0.25s ease;
  }
  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 25px rgba(165,0,100,0.12);
  }

  .stat-label { font-size: 13px; font-weight: 700; color: #666; }
  .stat-value { font-size: 32px; font-weight: 900; margin-top: 8px; }
  .total .stat-value { color: var(--mm); }
  .success .stat-value { color: var(--success); }
  .failed .stat-value { color: var(--danger); }

  /* TABLE */
  .table-container { 
    margin: 0 24px 24px; 
    background: white; 
    border-radius: 16px; 
    overflow: hidden; 
    box-shadow: 0 4px 20px rgba(165,0,100,0.08); 
  }

  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th { 
    background: #fdf4f8; 
    padding: 16px 12px; 
    text-align: left; 
    font-weight: 700; 
    color: #555; 
  }
  .data-table td { 
    padding: 16px 12px; 
    border-bottom: 1px solid #f5e9f0; 
  }
  .data-table tr:hover { 
    background: #fff0f5; 
  }
  .data-table tr.selected-row { 
    background: #fff0f5 !important; 
  }

  .status-badge { 
    padding: 6px 14px; 
    border-radius: 999px; 
    font-weight: 700; 
    font-size: 13px;
    transition: all 0.2s ease;
  }
  .status-badge:hover {
    transform: scale(1.05);
  }

  .amount { font-weight: 800; color: var(--mm); }
  .info { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .code { font-family: monospace; font-size: 14px; }

  .delete-btn { 
    background: none; 
    border: none; 
    font-size: 18px; 
    cursor: pointer; 
    color: #ef4444;
    padding: 6px 10px;
    border-radius: 8px;
    transition: all 0.2s ease;
  }
  .delete-btn:hover {
    background: #fee2e2;
    transform: scale(1.2);
  }

  /* LOGIN */
  .login-wrap { 
    min-height: 100vh; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    background: linear-gradient(135deg, #f8e7f0, #f0d9e8); 
  }
  .login-card { 
    background: white; 
    padding: 48px; 
    border-radius: 20px; 
    width: 100%; 
    max-width: 400px; 
    text-align: center; 
    box-shadow: 0 20px 40px rgba(165,0,100,0.15); 
  }
  .login-card .logo { font-size: 60px; margin-bottom: 16px; }

  .input-group input { 
    width: 100%; 
    padding: 16px; 
    border: 2px solid #ddd; 
    border-radius: 12px; 
    font-size: 16px; 
    margin: 20px 0; 
    transition: all 0.2s;
  }
  .input-group input:focus {
    border-color: var(--mm);
    box-shadow: 0 0 0 3px rgba(165,0,100,0.1);
  }

  .login-btn { 
    width: 100%; 
    padding: 16px; 
    background: var(--mm); 
    color: white; 
    border: none; 
    border-radius: 12px; 
    font-size: 17px; 
    font-weight: 700;
    transition: all 0.2s;
  }
  .login-btn:hover {
    background: #8f0048;
    transform: translateY(-1px);
  }
`