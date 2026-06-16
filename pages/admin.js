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
    if (!force && selectedOrders.size > 0) return // ← Tạm dừng refresh khi đang chọn đơn

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
  }, [authed, selectedOrders.size]) // ← Thêm dependency này

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
    PAID:    { label: 'Thành công', color: '#16a34a', bg: '#e8f5e9' },
    FAILED:  { label: 'Thất bại',   color: '#dc2626', bg: '#ffebee' },
    PENDING: { label: 'Chờ xử lý',  color: '#d97706', bg: '#fff3e0' },
    EXPIRED: { label: 'Hết hạn',    color: '#6c757d', bg: '#f8f9fa' },
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

  // Nếu chưa đăng nhập, hiển thị form đăng nhập khóa chặt trung tâm
  if (!authed) {
    return (
      <>
        <Head>
          <title>Admin · Đăng nhập</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="icon" type="image/png" href="/Main.png" /> 
        </Head>
        <style>{CSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-logo-container">
              <img src="/Main.png" alt="Logo" className="login-logo-img" />
            </div>
            <h1 className="title">Quản trị viên</h1>
            <p className="subtitle">Đăng nhập vào hệ thống Green Coffee</p>
            <div className={`input-group ${pwError ? 'error' : ''}`}>
              <input type="password" placeholder="Nhập mật khẩu quản trị" value={password}
                onChange={e => {setPassword(e.target.value); setPwError(false)}}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
            </div>
            {pwError && <p className="error-text">⚠ Mật khẩu hệ thống không chính xác</p>}
            <button className="login-btn" onClick={handleLogin}>Đăng nhập</button>
          </div>
        </div>
      </>
    )
  }

  // Nếu đã đăng nhập, hiển thị dashboard quản lý đơn hàng chuyên nghiệp
  return (
    <>
      <Head>
        <title>Admin · Giao dịch MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/png" href="/Main.png" /> 
      </Head>
      <style>{CSS}</style>

      <div className="dashboard">
        <header className="fixed-header">
          <div className="header-content">
            <div className="logo">
              <img src="/Main.png" alt="Logo" className="admin-header-logo" />
              <span>MoMo Admin</span>
            </div>

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
            <div className="stat-card total">
              <div className="stat-label">TỔNG DOANH THU</div>
              <div className="stat-value">{fmt(totalPaid)} ₫</div>
            </div>
            <div className="stat-card success">
              <div className="stat-label">THÀNH CÔNG</div>
              <div className="stat-value">{countPaid} GD</div>
            </div>
            <div className="stat-card failed">
              <div className="stat-label">THẤT BẠI</div>
              <div className="stat-value">{countFailed} GD</div>
            </div>
            <div className="stat-card total-orders">
              <div className="stat-label">TỔNG ĐƠN HÀNG</div>
              <div className="stat-value">{totalOrders} GD</div>
            </div>
          </div>

          <div className="table-container">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">Không tìm thấy giao dịch nào phù hợp</div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input type="checkbox" checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0} onChange={toggleSelectAll} />
                      </th>
                      <th>Trạng thái</th>
                      <th>Số tiền</th>
                      <th>Nội dung</th>
                      <th>Mã đơn</th>
                      <th>Mã GD MoMo</th>
                      <th>Hình thức</th>
                      <th>Tạo lúc</th>
                      <th>Hoàn tất</th>
                      <th style={{ textAlignment: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(o => {
                      const sm = statusMeta[o.status] || statusMeta.PENDING
                      const isSelected = selectedOrders.has(o.orderId)
                      return (
                        <tr key={o.orderId} className={isSelected ? 'selected-row' : ''}>
                          <td>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(o.orderId)} />
                          </td>
                          <td>
                            <span className="status-badge" style={{ background: sm.bg, color: sm.color }}>
                              {sm.label}
                            </span>
                          </td>
                          <td className="amount">{fmt(o.amount)} ₫</td>
                          <td className="info" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                          <td className="code">{o.orderId}</td>
                          <td className="code">{o.transId || '—'}</td>
                          <td><span className="paytype-badge">{o.payType || '—'}</span></td>
                          <td className="date">{fmtDate(o.createdAt)}</td>
                          <td className="date">{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                          <td style={{ textAlignment: 'center' }}>
                            <button className="delete-btn" onClick={() => deleteOrder(o.orderId)} title="Xóa giao dịch này">🗑️</button>
                          </td>
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

// CSS cao cấp cho toàn bộ trang Admin
const CSS = `
  :root { 
    --mm: #ae0070; 
    --success: #16a34a; 
    --danger: #dc2626; 
    --warning: #d97706; 
    --text-main: #1e0f18;
    --border-color: #e9ecef;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body { 
    font-family: 'Be Vietnam Pro', sans-serif; 
    background: #f1f3f5; 
    color: var(--text-main);
    overflow-x: hidden;
  }

  .dashboard { padding-top: 85px; }

  /* HEADER FIXED */
  .fixed-header { 
    position: fixed; top: 0; left: 0; right: 0; 
    background: #ffffff; z-index: 100; 
    border-bottom: 1px solid var(--border-color); 
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02); 
  }

  .header-content { 
    max-width: 1600px; margin: 0 auto; padding: 14px 24px; 
    display: flex; align-items: center; justify-content: space-between; 
    flex-wrap: wrap; gap: 16px; 
  }

  .logo { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    font-size: 22px; 
    font-weight: 800; 
    color: var(--text-main); 
    letter-spacing: -0.5px;
  }
  .admin-header-logo {
    width: 34px; height: 34px; border-radius: 8px; object-fit: contain;
  }

  .filters { display: flex; gap: 6px; flex-wrap: wrap; }
  
  .filter-btn { 
    padding: 8px 16px; 
    border: 1px solid #dee2e6; 
    border-radius: 10px; 
    background: #ffffff; 
    font-size: 13px;
    font-weight: 600; 
    color: #495057;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .filter-btn:hover { 
    background: #f8f9fa; 
    border-color: var(--mm);
    color: var(--mm);
  }
  .filter-btn.active { 
    background: var(--mm); 
    color: #ffffff; 
    border-color: var(--mm); 
  }
  .filter-btn .count {
    font-size: 11px;
    opacity: 0.8;
    margin-left: 2px;
  }

  .header-right { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    flex-wrap: wrap; 
  }

  .search-box input { 
    padding: 9px 16px; 
    border: 1px solid #dee2e6; 
    border-radius: 10px; 
    width: 260px; 
    font-size: 14px;
    font-family: inherit;
    transition: all 0.2s ease;
  }
  .search-box input:focus { 
    outline: none; 
    border-color: var(--mm); 
    box-shadow: 0 0 0 3px rgba(174, 0, 112, 0.08);
  }

  .bulk-delete-btn { 
    background: var(--danger); 
    color: white; 
    border: none; 
    padding: 9px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .bulk-delete-btn:hover {
    background: #bd1d1d;
    transform: translateY(-1px);
  }

  .logout-btn { 
    background: #f8f9fa; 
    color: #495057; 
    border: 1px solid #dee2e6; 
    padding: 9px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .logout-btn:hover {
    background: #e9ecef;
    color: var(--danger);
    border-color: #ced4da;
  }

  /* MAIN CONTENT & STATS GRID */
  .main-content {
    max-width: 1600px;
    margin: 0 auto;
    padding: 24px;
  }
  
  .stats-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); 
    gap: 20px; 
    margin-bottom: 24px; 
  }
  .stat-card { 
    background: #ffffff; 
    padding: 24px; 
    border-radius: 16px; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.01); 
    border: 1px solid rgba(0,0,0,0.03);
    transition: transform 0.2s ease;
  }
  .stat-card:hover {
    transform: translateY(-2px);
  }

  .stat-label { font-size: 11px; font-weight: 700; color: #868e96; letter-spacing: 0.5px; }
  .stat-value { font-size: 28px; font-weight: 800; margin-top: 6px; letter-spacing: -0.5px; }
  .total .stat-value { color: var(--mm); }
  .success .stat-value { color: var(--success); }
  .failed .stat-value { color: var(--danger); }
  .total-orders .stat-value { color: #212529; }

  /* BẢNG DỮ LIỆU CHUYÊN NGHIỆP */
  .table-container { 
    background: #ffffff; 
    border-radius: 16px; 
    overflow: hidden; 
    box-shadow: 0 10px 30px rgba(0,0,0,0.02);
    border: 1px solid var(--border-color);
  }
  
  .table-responsive {
    width: 100%;
    overflow-x: auto;
  }

  .data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; min-width: 1000px; }
  .data-table th { 
    background: #f8f9fa; 
    padding: 16px; 
    font-weight: 700; 
    color: #495057; 
    border-bottom: 1px solid var(--border-color);
  }
  .data-table td { 
    padding: 16px; 
    border-bottom: 1px solid #f1f3f5; 
    color: #212529;
    vertical-align: middle;
  }
  .data-table tr:hover { 
    background: #fafbfa; 
  }
  .data-table tr.selected-row { 
    background: #fff0f6 !important; 
  }

  .status-badge { 
    padding: 6px 12px; 
    border-radius: 8px; 
    font-weight: 700; 
    font-size: 12px;
    display: inline-block;
  }

  .amount { font-weight: 800; color: var(--mm); font-size: 15px; }
  .info { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .code { font-family: monospace; font-size: 13px; color: #495057; background: #f1f3f5; padding: 4px 8px; border-radius: 6px; }
  .date { font-size: 13px; color: #6c757d; }
  .paytype-badge { background: #e9ecef; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }

  .delete-btn { 
    background: transparent; 
    border: none; 
    font-size: 16px; 
    cursor: pointer; 
    color: var(--danger);
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s ease;
  }
  .delete-btn:hover {
    background: #ffebee;
    transform: scale(1.1);
  }
  
  .empty-state {
    padding: 60px;
    text-align: center;
    color: #868e96;
    font-weight: 500;
  }

  /* ĐĂNG NHẬP KHÓA TÂM TUYỆT ĐỐI */
  .login-wrap { 
    min-height: 100vh; 
    width: 100vw;
    display: flex; 
    align-items: center; 
    justify-content: center; 
    background: radial-gradient(circle at 50% 50%, #ffffff 0%, #e9ecef 100%);
    padding: 20px;
  }
  .login-card { 
    background: #ffffff; 
    padding: 45px 36px; 
    border-radius: 24px; 
    width: 100%; 
    max-width: 420px; 
    text-align: center; 
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0,0,0,0.03);
  }
  
  .login-logo-container {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: #ffffff;
    border: 1px solid #dee2e6;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.02);
  }
  .login-logo-img {
    width: 48px; height: 48px; object-fit: contain; border-radius: 10px;
  }

  .login-card .title { font-size: 24px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; }
  .login-card .subtitle { font-size: 14px; color: #6c757d; margin-top: 6px; margin-bottom: 28px; }

  .input-group input { 
    width: 100%; 
    padding: 14px 18px; 
    border: 1px solid #dee2e6; 
    border-radius: 12px; 
    font-size: 15px; 
    font-family: inherit;
    margin-bottom: 16px; 
    transition: all 0.2s ease;
    background: #f8f9fa;
  }
  .input-group input:focus {
    border-color: var(--mm);
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(174, 0, 112, 0.06);
    outline: none;
  }
  .input-group.error input {
    border-color: var(--danger);
    background: #fff5f5;
  }
  
  .error-text {
    font-size: 13px;
    color: var(--danger);
    font-weight: 600;
    margin-bottom: 16px;
    text-align: center;
  }

  .login-btn { 
    width: 100%; 
    padding: 14px; 
    background: var(--mm); 
    color: white; 
    border: none; 
    border-radius: 12px; 
    font-size: 16px; 
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 6px 20px rgba(174, 0, 112, 0.15);
  }
  .login-btn:hover {
    background: #91005d;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(174, 0, 112, 0.25);
  }
  
  /* RESPONSIVE DASHBOARD */
  @media (max-width: 992px) {
    .fixed-header { position: relative; }
    .dashboard { padding-top: 0; }
    .header-content { flex-direction: column; align-items: stretch; text-align: center; }
    .logo { justify-content: center; }
    .filters { justify-content: center; }
    .header-right { justify-content: center; width: 100%; }
    .search-box { flex: 1; }
    .search-box input { width: 100%; }
  }
`