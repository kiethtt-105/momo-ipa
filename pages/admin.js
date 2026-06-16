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
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  const [detailOrder, setDetailOrder] = useState(null) // ← Modal chi tiết

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

  const fetchOrders = async (force = false) => {
    if (loading) return
    if (!force && selectedOrders.size > 0) return

    setLoading(true)
    try {
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin-secret123'
      const res = await fetch(`/api/momo/orders?key=${adminKey}`)
      const data = await res.json()
      const newOrders = data.orders || []
      setOrders(newOrders)

      if (selectedOrders.size > 0) {
        const stillExist = Array.from(selectedOrders).filter(id =>
          newOrders.some(order => order.orderId === id)
        )
        setSelectedOrders(new Set(stillExist))
      }

      // Cập nhật modal nếu đang mở
      if (detailOrder) {
        const updated = newOrders.find(o => o.orderId === detailOrder.orderId)
        if (updated) setDetailOrder(normalizeOrder(updated))
      }
    } catch (err) {
      console.error('Fetch orders error:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!authed) return
    fetchOrders(true)
    const iv = setInterval(() => fetchOrders(), 1000)
    return () => clearInterval(iv)
  }, [authed, selectedOrders.size])

  // Đóng modal khi nhấn Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setDetailOrder(null) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const normalizeOrder = (order) => {
    const now = new Date()
    let status = order.status || 'PENDING'
    if (status === 'Chờ xử lý') status = 'PENDING'
    if (status === 'Thành công') status = 'PAID'
    if (status === 'Thất bại') status = 'FAILED'
    if (status === 'PENDING') {
      const created = new Date(order.createdAt)
      if ((now - created) / (1000 * 60) > 10) status = 'EXPIRED'
    }
    return { ...order, status }
  }

  const normalizeOrders = (list) => list.map(normalizeOrder)

  const displayedOrders = normalizeOrders(orders)

  const fmt = n => parseInt(n || 0).toLocaleString('vi-VN')
  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN') : '—'
  const fmtResponseTime = ms => {
    if (!ms) return '—'
    return new Date(parseInt(ms)).toLocaleString('vi-VN')
  }
  const decodeExtraData = (b64) => {
    if (!b64) return null
    try { return JSON.parse(atob(b64)) } catch { return b64 }
  }

  const countPaid    = displayedOrders.filter(o => o.status === 'PAID').length
  const countFailed  = displayedOrders.filter(o => o.status === 'FAILED').length
  const countPending = displayedOrders.filter(o => o.status === 'PENDING').length
  const countExpired = displayedOrders.filter(o => o.status === 'EXPIRED').length
  const totalOrders  = displayedOrders.length
  const totalPaid    = displayedOrders.filter(o => o.status === 'PAID').reduce((s, o) => s + parseInt(o.amount || 0), 0)

  const statusMeta = {
    PAID:    { label: 'Thành công', color: '#16a34a', bg: 'rgba(232, 245, 233, 0.85)' },
    FAILED:  { label: 'Thất bại',   color: '#dc2626', bg: 'rgba(255, 235, 235, 0.85)' },
    PENDING: { label: 'Chờ xử lý',  color: '#d97706', bg: 'rgba(255, 243, 224, 0.85)' },
    EXPIRED: { label: 'Hết hạn',    color: '#6c757d', bg: 'rgba(241, 243, 245, 0.85)' },
  }

  const FILTERS = [
    { key: 'ALL',     label: 'Tất cả',     count: totalOrders },
    { key: 'PAID',    label: 'Thành công', count: countPaid },
    { key: 'PENDING', label: 'Chờ xử lý', count: countPending },
    { key: 'FAILED',  label: 'Thất bại',  count: countFailed },
    { key: 'EXPIRED', label: 'Hết hạn',   count: countExpired },
  ]

  const filteredOrders = displayedOrders
    .filter(o => filter === 'ALL' || o.status === filter)
    .filter(o =>
      !search.trim() ||
      o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.orderInfo?.toLowerCase().includes(search.toLowerCase()) ||
      (o.transId && o.transId.includes(search)) ||
      (o.message && o.message.toLowerCase().includes(search.toLowerCase()))
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
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin-secret123'
      for (const orderId of idsToDelete) {
        await fetch(`/api/momo/delete?key=${adminKey}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        })
      }
      if (detailOrder && idsToDelete.includes(detailOrder.orderId)) setDetailOrder(null)
      await fetchOrders(true)
      alert(`Đã xóa ${idsToDelete.length} đơn hàng`)
    } catch (err) {
      console.error(err)
      alert('Lỗi khi xóa')
    }
  }

  const deleteOrder = async (orderId) => {
    if (!confirm(`Xóa đơn ${orderId}?`)) return
    await performDelete([orderId])
  }

  const deleteSelected = async () => {
    if (selectedOrders.size === 0) return
    if (!confirm(`Xóa ${selectedOrders.size} đơn đã chọn?\nKhông thể hoàn tác!`)) return
    await performDelete(Array.from(selectedOrders))
  }

  // ============================
  // MODAL CHI TIẾT ĐƠN HÀNG
  // ============================
  const DetailModal = ({ order, onClose }) => {
    if (!order) return null
    const sm = statusMeta[order.status] || statusMeta.PENDING
    const extraDecoded = decodeExtraData(order.extraData)

    const rows = [
      { label: 'Trạng thái',      value: <span className="status-badge" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span> },
      { label: 'Số tiền',         value: <strong style={{ color: '#ae0070', fontSize: 18 }}>{fmt(order.amount)} ₫</strong> },
      { label: 'Nội dung đơn',    value: order.orderInfo || '—' },
      { label: 'Mã đơn',          value: <code className="code">{order.orderId}</code> },
      { label: 'Request ID',      value: <code className="code">{order.requestId || '—'}</code> },
      { label: 'Mã GD MoMo',      value: <code className="code">{order.transId || '—'}</code> },
      { label: 'Hình thức TT',    value: order.payType ? <span className="paytype-badge">{order.payType}</span> : '—' },
      { label: 'Loại đơn',        value: order.orderType || '—' },
      { label: 'Result Code',     value: order.resultCode !== undefined ? (
          <span style={{ fontFamily: 'monospace', color: order.resultCode === 0 ? '#16a34a' : '#dc2626' }}>
            {order.resultCode}
          </span>
        ) : '—' },
      { label: 'Message MoMo',    value: order.message || '—' },
      { label: 'Tạo lúc',         value: fmtDate(order.createdAt) },
      { label: 'MoMo phản hồi',   value: fmtResponseTime(order.responseTime) },
      { label: 'Hoàn tất lúc',    value: fmtDate(order.paidAt) },
      { label: 'Nguồn cập nhật',  value: order.source ? <span className="paytype-badge">{order.source}</span> : '—' },
    ]

    if (order.extraData) {
      rows.push({
        label: 'Extra Data',
        value: (
          <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
            {typeof extraDecoded === 'object'
              ? JSON.stringify(extraDecoded, null, 2)
              : extraDecoded}
          </div>
        )
      })
    }

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Chi tiết giao dịch</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            {rows.map((r, i) => (
              <div key={i} className="detail-row">
                <span className="detail-label">{r.label}</span>
                <span className="detail-value">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="delete-btn-modal" onClick={() => { onClose(); deleteOrder(order.orderId) }}>
              🗑️ Xóa giao dịch này
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================
  // LOGIN SCREEN
  // ============================
  if (!authed) {
    return (
      <>
        <Head>
          <title>Admin · Đăng nhập</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="icon" type="image/png" href="/Main.png" />
        </Head>
        <div className="bg-mesh-container">
          <div className="orb orb-1"></div><div className="orb orb-2"></div>
          <div className="orb orb-3"></div><div className="orb orb-4"></div>
          <style>{CSS}</style>
          <div className="login-wrap">
            <div className="login-card">
              <div className="login-logo-container">
                <img src="/Main.png" alt="Logo" className="login-logo-img" />
              </div>
              <h1 className="title">Quản trị viên</h1>
              <p className="subtitle">Đăng nhập vào hệ thống IPA</p>
              <div className={`input-group ${pwError ? 'error' : ''}`}>
                <input
                  type="password" placeholder="Nhập mật khẩu quản trị"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPwError(false) }}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  autoFocus
                />
              </div>
              {pwError && <p className="error-text">⚠ Mật khẩu hệ thống không chính xác</p>}
              <button className="login-btn" onClick={handleLogin}>Đăng nhập</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ============================
  // DASHBOARD
  // ============================
  return (
    <>
      <Head>
        <title>Admin · Giao dịch MoMo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="bg-mesh-container">
        <div className="orb orb-1"></div><div className="orb orb-2"></div>
        <div className="orb orb-3"></div><div className="orb orb-4"></div>
        <style>{CSS}</style>

        {/* MODAL */}
        {detailOrder && <DetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}

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
                  <input
                    type="text" placeholder="Tìm mã đơn, nội dung, message..."
                    value={search} onChange={e => setSearch(e.target.value)}
                  />
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
            {/* STAT CARDS */}
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

            {/* TABLE */}
            <div className="table-container">
              {filteredOrders.length === 0 ? (
                <div className="empty-state">Không tìm thấy giao dịch nào phù hợp</div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input
                            type="checkbox"
                            checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th>Trạng thái</th>
                        <th>Số tiền</th>
                        <th>Nội dung</th>
                        <th>Mã đơn</th>
                        <th>Mã GD MoMo</th>
                        <th>Hình thức</th>
                        <th>Result</th>
                        <th>Tạo lúc</th>
                        <th>Hoàn tất</th>
                        <th style={{ textAlign: 'center' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map(o => {
                        const sm = statusMeta[o.status] || statusMeta.PENDING
                        const isSelected = selectedOrders.has(o.orderId)
                        return (
                          <tr
                            key={o.orderId}
                            className={`${isSelected ? 'selected-row' : ''} clickable-row`}
                            onClick={() => setDetailOrder(o)}
                          >
                            <td onClick={e => e.stopPropagation()}>
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
                            <td>
                              {o.resultCode !== undefined
                                ? <span style={{ fontFamily: 'monospace', fontSize: 13, color: o.resultCode === 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                    {o.resultCode}
                                  </span>
                                : '—'}
                            </td>
                            <td className="date">{fmtDate(o.createdAt)}</td>
                            <td className="date">{o.paidAt ? fmtDate(o.paidAt) : '—'}</td>
                            <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
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
      </div>
    </>
  )
}

const CSS = `
  :root {
    --mm: #ae0070;
    --success: #16a34a;
    --danger: #dc2626;
    --warning: #d97706;
    --text-main: #1a0413;
    --muted: #6c757d;
    --border-color: rgba(174, 0, 112, 0.12);
    --surface: rgba(255, 255, 255, 0.88);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  .bg-mesh-container {
    position: relative; min-height: 100vh; width: 100vw;
    background-color: #f3e9ed; overflow-x: hidden;
  }

  .orb { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.65; z-index: 0; pointer-events: none; transform: translate3d(0,0,0); }
  .orb-1 { top: -5%; left: -5%; width: 45vw; height: 45vw; background: #ff9cb7; animation: orbMove1 6s infinite alternate ease-in-out; }
  .orb-2 { bottom: -5%; right: -5%; width: 55vw; height: 55vw; background: #b0bec5; animation: orbMove2 8s infinite alternate ease-in-out; }
  .orb-3 { top: 20%; right: -5%; width: 40vw; height: 40vw; background: #dfb2ea; animation: orbMove3 7s infinite alternate ease-in-out; }
  .orb-4 { bottom: -5%; left: 5%; width: 35vw; height: 35vw; background: #80cbc4; animation: orbMove1 7.5s infinite alternate ease-in-out; }

  @keyframes orbMove1 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(8vw,4vh) scale(1.15); } 100% { transform: translate(-4vw,7vh) scale(0.9); } }
  @keyframes orbMove2 { 0% { transform: translate(0,0) scale(1.1); } 50% { transform: translate(-10vw,-6vh) scale(0.9); } 100% { transform: translate(6vw,4vh) scale(1.1); } }
  @keyframes orbMove3 { 0% { transform: translate(0,0) scale(0.9); } 50% { transform: translate(-5vw,7vh) scale(1.2); } 100% { transform: translate(7vw,-4vh) scale(1); } }

  .bg-mesh-container::before {
    content: ''; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3e%3cfilter id='noiseFilter'%3e%3cturbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3e%3c/filter%3e%3crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3e%3c/svg%3e");
    opacity: 0.5; z-index: 1; pointer-events: none;
  }

  .dashboard { padding-top: 85px; position: relative; z-index: 2; will-change: transform; }

  .fixed-header {
    position: fixed; top: 0; left: 0; right: 0;
    background: rgba(255,255,255,0.9); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
    z-index: 100; border-bottom: 1px solid var(--border-color);
  }
  .header-content { max-width: 1600px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }

  .logo { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; }
  .admin-header-logo { width: 34px; height: 34px; border-radius: 8px; object-fit: contain; }

  .filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .filter-btn { padding: 8px 16px; border: 1px solid rgba(174,0,112,0.15); border-radius: 10px; background: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600; color: #495057; cursor: pointer; transition: all 0.2s; }
  .filter-btn:hover { border-color: var(--mm); color: var(--mm); background: #fff0f7; }
  .filter-btn.active { background: var(--mm); color: #fff; border-color: var(--mm); }
  .filter-btn .count { font-size: 11px; opacity: 0.8; margin-left: 2px; }

  .header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .search-box input { padding: 9px 16px; border: 1px solid rgba(174,0,112,0.15); border-radius: 10px; width: 280px; font-size: 14px; background: rgba(255,255,255,0.7); font-family: inherit; transition: all 0.2s; }
  .search-box input:focus { outline: none; border-color: var(--mm); background: #fff; box-shadow: 0 0 0 3px rgba(174,0,112,0.08); }

  .bulk-delete-btn { background: var(--danger); color: white; border: none; padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .logout-btn { background: rgba(255,255,255,0.7); color: #495057; border: 1px solid rgba(174,0,112,0.15); padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .logout-btn:hover { background: #fff; color: var(--danger); }

  .main-content { max-width: 1600px; margin: 0 auto; padding: 24px; position: relative; z-index: 2; }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 24px; }
  .stat-card { background: var(--surface); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 24px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 10px 30px rgba(174,0,112,0.02); will-change: transform; }
  .stat-label { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.5px; }
  .stat-value { font-size: 28px; font-weight: 800; margin-top: 6px; letter-spacing: -0.5px; }
  .total .stat-value { color: var(--mm); }
  .success .stat-value { color: var(--success); }
  .failed .stat-value { color: var(--danger); }
  .total-orders .stat-value { color: #212529; }

  .table-container { background: var(--surface); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 20px 40px rgba(0,0,0,0.02); will-change: transform; }
  .table-responsive { width: 100%; overflow-x: auto; }

  .data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; min-width: 1100px; }
  .data-table th { background: rgba(235,225,230,0.7); padding: 16px; font-weight: 700; color: #495057; border-bottom: 1px solid var(--border-color); }
  .data-table td { padding: 16px; border-bottom: 1px solid rgba(174,0,112,0.04); color: #212529; vertical-align: middle; }
  .data-table tr:hover { background: rgba(255,255,255,0.5); }
  .data-table tr.selected-row { background: rgba(174,0,112,0.06) !important; }
  .clickable-row { cursor: pointer; }

  .status-badge { padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 12px; display: inline-block; }
  .amount { font-weight: 800; color: var(--mm); font-size: 15px; }
  .info { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .code { font-family: monospace; font-size: 13px; background: rgba(255,255,255,0.7); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(174,0,112,0.05); color: #495057; }
  .date { font-size: 13px; color: var(--muted); }
  .paytype-badge { background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }

  .delete-btn { background: transparent; border: none; font-size: 16px; cursor: pointer; color: var(--danger); padding: 6px; border-radius: 6px; }
  .delete-btn:hover { background: rgba(255,235,235,0.9); }
  .empty-state { padding: 60px; text-align: center; color: var(--muted); font-weight: 500; }

  /* ===== MODAL ===== */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 999;
    background: rgba(26, 4, 19, 0.45);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: fadeIn 0.18s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal-card {
    background: rgba(255,255,255,0.97);
    border-radius: 20px;
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 30px 80px rgba(174,0,112,0.18);
    border: 1px solid rgba(255,255,255,0.8);
    animation: slideUp 0.2s ease;
  }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border-color);
    position: sticky; top: 0; background: rgba(255,255,255,0.97); z-index: 1;
    border-radius: 20px 20px 0 0;
  }
  .modal-title { font-size: 18px; font-weight: 800; color: var(--text-main); }
  .modal-close {
    width: 32px; height: 32px; border-radius: 8px; border: none;
    background: rgba(174,0,112,0.07); color: var(--mm); font-size: 15px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-weight: 700; transition: all 0.15s;
  }
  .modal-close:hover { background: rgba(174,0,112,0.15); }

  .modal-body { padding: 8px 24px 8px; }

  .detail-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid rgba(174,0,112,0.05);
  }
  .detail-row:last-child { border-bottom: none; }
  .detail-label {
    min-width: 140px; font-size: 12px; font-weight: 700;
    color: var(--muted); letter-spacing: 0.3px; padding-top: 2px;
  }
  .detail-value { font-size: 14px; color: #212529; flex: 1; word-break: break-all; }

  .modal-footer {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--border-color);
    display: flex; justify-content: flex-end;
  }
  .delete-btn-modal {
    background: transparent; border: 1px solid rgba(220,38,38,0.3);
    color: var(--danger); padding: 9px 18px; border-radius: 10px;
    font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;
  }
  .delete-btn-modal:hover { background: rgba(255,235,235,0.9); border-color: var(--danger); }

  /* ĐĂNG NHẬP */
  .login-wrap { min-height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; z-index: 5; }
  .login-card { background: var(--surface); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); padding: 45px 36px; border-radius: 24px; width: 100%; max-width: 420px; text-align: center; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 30px 60px rgba(174,0,112,0.05); }
  .login-logo-container { width: 64px; height: 64px; border-radius: 16px; background: #fff; border: 1px solid rgba(174,0,112,0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
  .login-logo-img { width: 48px; height: 48px; object-fit: contain; }
  .login-card .title { font-size: 24px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; }
  .login-card .subtitle { font-size: 14px; color: var(--muted); margin-top: 6px; margin-bottom: 28px; }
  .input-group input { width: 100%; padding: 14px 18px; border: 1px solid rgba(174,0,112,0.15); border-radius: 12px; font-size: 15px; font-family: inherit; margin-bottom: 16px; background: rgba(240,232,236,0.5); }
  .input-group input:focus { border-color: var(--mm); background: #fff; box-shadow: 0 0 0 4px rgba(174,0,112,0.06); outline: none; }
  .input-group.error input { border-color: var(--danger); background: #fff5f5; }
  .error-text { font-size: 13px; color: var(--danger); font-weight: 600; margin-bottom: 16px; }
  .login-btn { width: 100%; padding: 14px; background: var(--mm); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 20px rgba(174,0,112,0.15); }
  .login-btn:hover { background: #91005d; transform: translateY(-1px); }

  @media (max-width: 992px) {
    .fixed-header { position: relative; }
    .dashboard { padding-top: 0; }
    .header-content { flex-direction: column; align-items: stretch; text-align: center; }
    .logo, .filters, .header-right { justify-content: center; width: 100%; }
    .search-box input { width: 100%; }
  }
`
