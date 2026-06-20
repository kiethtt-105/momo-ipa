import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ─────────────────────────────────────────────
const REFRESH_INTERVAL = 1000
const EXPIRE_MINUTES   = 10

const STATUS_META = {
  PAID:    { label: 'Thành công', color: '#16a34a', bg: '#dcfce7', dot: '#22c55e' },
  FAILED:  { label: 'Thất bại',   color: '#dc2626', bg: '#fee2e2', dot: '#ef4444' },
  PENDING: { label: 'Chờ xử lý',  color: '#d97706', bg: '#fef3c7', dot: '#f59e0b' },
  EXPIRED: { label: 'Hết hạn',    color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
}

// ─── UTILS ─────────────────────────────────────────────────
const fmt      = n  => parseInt(n || 0).toLocaleString('vi-VN')
const fmtDate  = s  => s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '—'
const fmtMs    = ms => ms ? new Date(parseInt(ms)).toLocaleString('vi-VN', { hour12: false }) : '—'
const decodeExtra = b64 => {
  if (!b64) return null
  try { return JSON.parse(atob(b64)) } catch { return b64 }
}

// ─── NORMALIZE STATUS ─────────────────────────────────────
const normalizeStatus = (order) => {
  let status = order.status || 'PENDING'
  if (status === 'Chờ xử lý') status = 'PENDING'
  if (status === 'Thành công') status = 'PAID'
  if (status === 'Thất bại')   status = 'FAILED'
  if (status === 'PENDING') {
    const age = (Date.now() - new Date(order.createdAt)) / 60000
    if (age > EXPIRE_MINUTES) status = 'EXPIRED'
  }
  return { ...order, status }
}

// ─── RESULT CODE MAP ──────────────────────────────────────
const RESULT_CODE_MAP = {
  0:    'Thành công',
  10:   'Hệ thống đang bảo trì',
  11:   'Truy cập bị từ chối',
  12:   'Phiên bản API không được hỗ trợ',
  13:   'Xác thực merchant thất bại',
  20:   'Request sai định dạng',
  21:   'Số tiền không hợp lệ',
  22:   'orderId không hợp lệ',
  23:   'requestId không hợp lệ',
  24:   'Chữ ký không hợp lệ',
  26:   'Thông tin đơn hàng không hợp lệ',
  29:   'Vượt quá giới hạn tần suất API',
  1000: 'Đang chờ xác nhận từ người dùng',
  1001: 'Thanh toán thất bại (số dư không đủ)',
  1002: 'Từ chối bởi nhà phát hành',
  1003: 'Đơn hàng bị huỷ hoặc hết hạn',
  1004: 'Số tiền vượt hạn mức cho phép',
  1005: 'URL thanh toán đã hết hạn',
  1006: 'Người dùng từ chối xác nhận',
  1007: 'Tài khoản không được xác minh',
  1017: 'Giao dịch bị huỷ bởi hệ thống',
  1026: 'Bị giới hạn vì chính sách của MoMo',
  2019: 'orderGroupId không hợp lệ',
  4001: 'Giao dịch bị hạn chế (KYC)',
  4010: 'Xác thực 2 yếu tố thất bại',
  4011: 'OTP chưa được gửi hoặc đã hết hạn',
  4100: 'Người dùng chưa đăng nhập',
  7000: 'Đang xử lý',
  7002: 'Đang xử lý bởi nhà cung cấp',
  9000: 'Giao dịch đã được xác nhận thành công',
}

// ─── GET RESULT DESCRIPTION ───────────────────────────────
const getResultDesc = code =>
  RESULT_CODE_MAP[code] !== undefined ? RESULT_CODE_MAP[code] : `Mã lỗi không xác định`

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function AdminPage() {
  const [authed,          setAuthed]          = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password,        setPassword]        = useState('')
  const [pwError,         setPwError]         = useState(false)
  const [orders,          setOrders]          = useState([])
  const [fetching,        setFetching]        = useState(false)
  const [lastSync,        setLastSync]        = useState(null)
  const [filter,          setFilter]          = useState('ALL')
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState(new Set())
  const [detail,          setDetail]          = useState(null)

  // Query modal state
  const [queryModal,      setQueryModal]      = useState(false)
  const [queryOrderId,    setQueryOrderId]    = useState('')
  const [queryLoading,    setQueryLoading]    = useState(false)
  const [queryResult,     setQueryResult]     = useState(null)
  const [queryError,      setQueryError]      = useState(null)

  // Confirm modal state
  const [confirmModal,   setConfirmModal]   = useState(false)
  const [confirmOrderId, setConfirmOrderId] = useState('')
  const [confirmAmount,  setConfirmAmount]  = useState(0)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmResult,  setConfirmResult]  = useState(null)
  const [confirmError,   setConfirmError]   = useState(null)
  
  // Refs to hold the latest state values for use in async callbacks
  const ordersRef   = useRef([])
  const fetchingRef = useRef(false)
  const selectedRef = useRef(new Set())
  const detailRef   = useRef(null)

  useEffect(() => { ordersRef.current   = orders   }, [orders])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { detailRef.current   = detail   }, [detail])

  // ── CHECK SESSION ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
      .finally(() => setCheckingSession(false))
  }, [])

  // ── FETCH ORDERS ──────────────────────────────────────────
  const fetchOrders = useCallback(async ({ force = false } = {}) => {
    if (fetchingRef.current && !force) return
    fetchingRef.current = true
    setFetching(true)
    try {
      // Fetch orders from the API
      const res = await fetch('/api/momo/orders')
      if (res.status === 401) { setAuthed(false); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Parse the response and update state
      const data = await res.json()
      const raw  = data.orders || []
      setOrders(raw)
      setLastSync(new Date())
      if (detailRef.current) {
        const fresh = raw.find(o => o.orderId === detailRef.current)
        if (fresh) setDetail(fresh.orderId)
      }
      // Clean up selected orders that no longer exist
      if (selectedRef.current.size > 0) {
        const ids     = new Set(raw.map(o => o.orderId))
        const cleaned = new Set([...selectedRef.current].filter(id => ids.has(id)))
        if (cleaned.size !== selectedRef.current.size) setSelected(cleaned)
      }
    } catch (err) {
      console.error('[Admin] fetch error:', err)
    } finally {
      fetchingRef.current = false
      setFetching(false)
    }
  }, [])

  // ── INTERVAL ──────────────────────────────────────────────
  useEffect(() => {
    if (authed !== true) return
    fetchOrders({ force: true })
    const iv = setInterval(() => fetchOrders(), REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [authed, fetchOrders])

  // ── ESC đóng modal ────────────────────────────────────────
  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') {
        setDetail(null)
        setQueryModal(false)
      }
    }
    
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // ── MOMO QUERY API ────────────────────────────────────────
  const doMomoQuery = async () => {
    const id = queryOrderId.trim()
    if (!id) return
    setQueryLoading(true)
    setQueryResult(null)
    setQueryError(null)
    try {
      const res = await fetch('/api/momo/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      setQueryResult(data)
    } catch (err) {
      setQueryError(err.message || 'Lỗi không xác định')
    } finally {
      setQueryLoading(false)
    }
  }
  // ── MOMO CONFIRM API ────────────────────────────────────────
  const openConfirmForOrder = (orderId, amount) => {
  setConfirmOrderId(orderId)
  setConfirmAmount(amount)
  setConfirmResult(null)
  setConfirmError(null)
  setConfirmModal(true)
  }

  // ── MOMO CONFIRM API ────────────────────────────────────────
  const doMomoConfirm = async (requestType) => {
    setConfirmLoading(true)
    setConfirmResult(null)
    setConfirmError(null)
    try {
      const res = await fetch('/api/momo/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: confirmOrderId, amount: confirmAmount, requestType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      setConfirmResult({ ...data, requestType })
      await fetchOrders({ force: true })
    } catch (err) {
      setConfirmError(err.message || 'Lỗi không xác định')
    } finally {
      setConfirmLoading(false)
    }
  }
  // ── OPEN QUERY MODAL FOR ORDER ─────────────────────────────
  const openQueryForOrder = (orderId) => {
    setQueryOrderId(orderId)
    setQueryResult(null)
    setQueryError(null)
    setQueryModal(true)
  }

  // ── DERIVED DATA ──────────────────────────────────────────
  const displayed = orders.map(normalizeStatus)
  const counts = {
    ALL:     displayed.length,
    PAID:    displayed.filter(o => o.status === 'PAID').length,
    FAILED:  displayed.filter(o => o.status === 'FAILED').length,
    PENDING: displayed.filter(o => o.status === 'PENDING').length,
    EXPIRED: displayed.filter(o => o.status === 'EXPIRED').length,
  }
  // Calculate total revenue from paid orders
  const totalRevenue = displayed
    .filter(o => o.status === 'PAID')
    .reduce((s, o) => s + parseInt(o.amount || 0), 0)

    // Apply filter and search
  const filtered = displayed
    .filter(o => filter === 'ALL' || o.status === filter)
    .filter(o => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        o.orderId?.toLowerCase().includes(q) ||
        o.orderInfo?.toLowerCase().includes(q) ||
        o.transId?.toString().includes(q) ||
        o.message?.toLowerCase().includes(q)
      )
    })
  // Get the order details for the currently selected order
  const detailOrder = detail ? displayed.find(o => o.orderId === detail) : null

  // ── SELECT ────────────────────────────────────────────────
  const toggleOne = id => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }
  const toggleAll = () =>
    selected.size === filtered.length
      ? setSelected(new Set())
      : setSelected(new Set(filtered.map(o => o.orderId)))

  // ── DELETE ────────────────────────────────────────────────
  const doDelete = async (ids) => {
    if (!confirm(`Xóa ${ids.length} đơn?\nKhông thể hoàn tác!`)) return
    try {
      await Promise.all(ids.map(id =>
        fetch('/api/momo/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: id }),
        })
      ))
      if (detail && ids.includes(detail)) setDetail(null)
      setSelected(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n })
      await fetchOrders({ force: true })
    } catch (err) {
      console.error(err)
      alert('Lỗi khi xóa')
    }
  }

  const router = useRouter()

  // ── ĐANG KIỂM TRA SESSION ─────────────────────────────────
  if (checkingSession) return (
    <div className="bg-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Orbs /><style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sync-dot syncing" style={{ position: 'relative', zIndex: 10 }} />
    </div>
  )

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin · Đăng nhập</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="bg-wrap">
        <Orbs /><style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-logo-box">
              <img src="/Main.png" alt="Logo" className="login-logo" />
            </div>
            <h1 className="login-title">Quản trị viên</h1>
            <p className="login-sub">Hệ thống quản lý giao dịch MoMo</p>
            <div className={`pw-group ${pwError ? 'error' : ''}`}>
              <input
                type="password" placeholder="Mật khẩu quản trị"
                value={password} autoFocus
                onChange={e => { setPassword(e.target.value); setPwError(false) }}
                onKeyDown={e => e.key === 'Enter' && login()}
              />
            </div>
            {pwError && <p className="pw-error">⚠ Mật khẩu không chính xác</p>}
            <button className="login-btn" onClick={login}>Đăng nhập</button>
          </div>
        </div>
      </div>
    </>
  )

  async function login() {
    setPwError(false)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) { setAuthed(true); setPassword('') }
      else { setPwError(true); setPassword('') }
    } catch {
      setPwError(true)
    }
  }

  // ── DASHBOARD ─────────────────────────────────────────────
  const FILTERS = [
    { key: 'ALL',     label: 'Tất cả'     },
    { key: 'PAID',    label: 'Thành công' },
    { key: 'PENDING', label: 'Chờ xử lý' },
    { key: 'FAILED',  label: 'Thất bại'  },
    { key: 'EXPIRED', label: 'Hết hạn'   },
  ]

  return (
    <>
      <Head>
        <title>Admin · Giao dịch MoMo</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="bg-wrap">
        <Orbs /><style dangerouslySetInnerHTML={{ __html: CSS }} />

        {/* ── DETAIL MODAL ── */}
        {detailOrder && (
          <DetailModal
            order={detailOrder}
            onClose={() => setDetail(null)}
            onDelete={id => doDelete([id])}
            onQuery={id => { setDetail(null); openQueryForOrder(id) }}
            order={detailOrder}
            onClose={() => setDetail(null)}
            onDelete={id => doDelete([id])}
            onQuery={id => { setDetail(null); openQueryForOrder(id) }}
            onConfirm={(id, amount) => { setDetail(null); openConfirmForOrder(id, amount) }}  
          />
        )}

        {/* ── QUERY MODAL ── */}
        {queryModal && (
          <QueryModal
            orderId={queryOrderId}
            setOrderId={setQueryOrderId}
            loading={queryLoading}
            result={queryResult}
            error={queryError}
            onQuery={doMomoQuery}
            onClose={() => { setQueryModal(false); setQueryResult(null); setQueryError(null) }}
          />
        )}
        {/* ── CONFIRM MODAL ── */}
        {confirmModal && (
          <ConfirmModal
            orderId={confirmOrderId}
            amount={confirmAmount}
            loading={confirmLoading}
            result={confirmResult}
            error={confirmError}
            onConfirm={() => doMomoConfirm('capture')}
            onCancel={() => doMomoConfirm('cancel')}
            onClose={() => { setConfirmModal(false); setConfirmResult(null); setConfirmError(null) }}
          />
        )}


        <div className="dashboard">
          {/* ── HEADER ── */}
          <header className="topbar">
            <div className="topbar-inner">
              <div className="logo-area">
                <img src="/Main.png" alt="" className="logo-img" />
                <span className="logo-text">MoMo Admin</span>
                <span
                  className={`sync-dot ${fetching ? 'syncing' : 'idle'}`}
                  title={lastSync ? `Sync: ${fmtDate(lastSync)}` : 'Chưa sync'}
                />
              </div>

              <nav className="filter-tabs">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    className={`ftab ${filter === f.key ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                    <span className={`ftab-count ${filter === f.key ? 'active' : ''}`}>
                      {counts[f.key]}
                    </span>
                  </button>
                ))}
              </nav>

              <div className="topbar-right">
                <div className="searchbox">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    type="text" placeholder="Tìm kiếm..."
                    value={search} onChange={e => setSearch(e.target.value)}
                  />
                  {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
                </div>

                {selected.size > 0 && (
                  <button className="btn-danger" onClick={() => doDelete([...selected])}>
                    🗑 Xóa ({selected.size})
                  </button>
                )}

                {/* ── QUERY BUTTON ── */}
                <button
                  className="btn-query"
                  onClick={() => { setQueryOrderId(''); setQueryResult(null); setQueryError(null); setQueryModal(true) }}
                  title="Tra cứu trạng thái giao dịch MoMo"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                    <path d="M11 8v3l2 2"/>
                  </svg>
                  Tra cứu MoMo
                </button>

                <button 
                className="btn-scan" 
                onClick={() => window.open('/admin/scan', '_blank')}
                title="Mở Scan QR ở tab mới"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9V5a2 2 0 0 1 2-2h2M21 9V5a2 2 0 0 0-2-2h-2M3 15v4a2 2 0 0 0 2 2h2M21 15v4a2 2 0 0 1-2 2h-2" />
                  <path d="M12 11v4M9 14h6" />
                </svg>
                Scan QR
              </button>
                <button className="btn-refresh" onClick={() => fetchOrders({ force: true })} disabled={fetching}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fetching ? 'spin' : ''}>
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M8 16H3v5"/>
                  </svg>
                </button>
                <button className="btn-logout" onClick={() => {
                  fetch('/api/admin/session', { method: 'DELETE' }).finally(() => setAuthed(false))
                }}>
                  Đăng xuất
                </button>
              </div>
            </div>
          </header>

          {/* ── MAIN ── */}
          <main className="main">
            {/* STAT CARDS */}
            <div className="stat-grid">
              <StatCard label="Doanh thu"   value={`${fmt(totalRevenue)} ₫`} color="var(--mm)"  sub={`${counts.PAID} giao dịch thành công`} />
              <StatCard label="Thành công"  value={`${counts.PAID} GD`}      color="#16a34a"    sub={`${counts.PAID ? Math.round(counts.PAID / counts.ALL * 100) : 0}% tỉ lệ thành công`} />
              <StatCard label="Thất bại"    value={`${counts.FAILED} GD`}    color="#dc2626"    sub={`${counts.EXPIRED} đơn hết hạn`} />
              <StatCard label="Tổng đơn"    value={`${counts.ALL} GD`}       color="#374151"    sub={`${counts.PENDING} đang chờ xử lý`} />
            </div>

            {/* TABLE */}
            <div className="table-wrap">
              {filtered.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-text">Không tìm thấy giao dịch nào</div>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="th-check">
                          <input
                            type="checkbox"
                            checked={selected.size > 0 && selected.size === filtered.length}
                            ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)}
                            onChange={toggleAll}
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
                        <th className="th-action">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(o => {
                        const sm  = STATUS_META[o.status] || STATUS_META.PENDING
                        const sel = selected.has(o.orderId)
                        return (
                          <tr
                            key={o.orderId}
                            className={`trow ${sel ? 'sel' : ''}`}
                            onClick={() => setDetail(o.orderId)}
                          >
                            <td className="td-check" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={sel} onChange={() => toggleOne(o.orderId)} />
                            </td>
                            <td>
                              <span className="badge" style={{ background: sm.bg, color: sm.color }}>
                                <span className="badge-dot" style={{ background: sm.dot }} />
                                {sm.label}
                              </span>
                            </td>
                            <td className="td-amount">{fmt(o.amount)} ₫</td>
                            <td className="td-info" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                            <td className="td-code">{o.orderId}</td>
                            <td className="td-code">{o.transId || '—'}</td>
                            <td>
                              {o.payType
                                ? <span className="chip">{o.payType}</span>
                                : <span className="muted">—</span>}
                            </td>
                            <td>
                              {o.resultCode !== undefined
                                ? <span className="result-code" style={{ color: o.resultCode === 0 ? '#16a34a' : '#dc2626' }}>
                                    {o.resultCode === 0 ? '✓ 0' : `✗ ${o.resultCode}`}
                                  </span>
                                : <span className="muted">—</span>}
                            </td>
                            <td className="td-date">{fmtDate(o.createdAt)}</td>
                            <td className="td-date">{o.paidAt ? fmtDate(o.paidAt) : <span className="muted">—</span>}</td>
                            <td className="td-action" onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                {/* Tra cứu MoMo */}
                                <button
                                  className="btn-action-row btn-query-row"
                                  onClick={() => openQueryForOrder(o.orderId)}
                                  title="Tra cứu MoMo API"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
                                  </svg>
                                </button>
                                {/* Xóa */}
                                <button
                                  className="btn-action-row btn-del-row"
                                  onClick={() => doDelete([o.orderId])}
                                  title="Xóa"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                                    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                  </svg>
                                </button>
                                {/* Confirm — chỉ hiện khi resultCode 9000 */}
                                {o.resultCode === 9000 && (
                                  <button
                                    className="btn-action-row btn-confirm-row"
                                    onClick={() => openConfirmForOrder(o.orderId, o.amount)}
                                    title="Xác nhận / Huỷ giao dịch (9000)"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="table-footer">
                <span className="table-count">
                  {filtered.length} giao dịch
                  {filter !== 'ALL' && ` · lọc theo "${FILTERS.find(f => f.key === filter)?.label}"`}
                  {search && ` · tìm "${search}"`}
                </span>
                {lastSync && (
                  <span className="last-sync">
                    Cập nhật lúc {lastSync.toLocaleTimeString('vi-VN')}
                    {fetching && ' · đang tải...'}
                  </span>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

// ─── SUB COMPONENTS ──────────────────────────────────────────

function Orbs() {
  return <>
    <div className="orb orb1"/><div className="orb orb2"/>
    <div className="orb orb3"/><div className="orb orb4"/>
  </>
}

function StatCard({ label, value, color, sub }) {
  return (
    <div className="scard">
      <div className="scard-label">{label}</div>
      <div className="scard-value" style={{ color }}>{value}</div>
      {sub && <div className="scard-sub">{sub}</div>}
    </div>
  )
}

function DetailModal({ order, onClose, onDelete, onQuery }) {
  const sm    = STATUS_META[order.status] || STATUS_META.PENDING
  const extra = decodeExtra(order.extraData)
  const copy  = text => navigator.clipboard?.writeText(text)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-hd-label">Chi tiết giao dịch</div>
            <div className="modal-hd-id">{order.orderId}</div>
          </div>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-hero" style={{ background: sm.bg }}>
          <span className="badge" style={{ background: 'white', color: sm.color }}>
            <span className="badge-dot" style={{ background: sm.dot }} />
            {sm.label}
          </span>
          <div className="modal-amount" style={{ color: sm.color }}>{fmt(order.amount)} ₫</div>
          <div className="modal-orderinfo">{order.orderInfo || '—'}</div>
        </div>

        <div className="modal-body">
          <Section title="Thông tin giao dịch">
            <Row label="Mã đơn"     value={order.orderId}   mono copy={() => copy(order.orderId)} />
            <Row label="Request ID" value={order.requestId} mono copy={() => copy(order.requestId)} />
            <Row label="Mã GD MoMo" value={order.transId}   mono copy={() => copy(order.transId)} />
          </Section>

          <Section title="Kết quả">
            <Row label="Result Code" value={
              order.resultCode !== undefined
                ? <span style={{ fontFamily: 'monospace', fontWeight: 700, color: order.resultCode === 0 ? '#16a34a' : '#dc2626' }}>
                    {order.resultCode === 0
                      ? `✓ ${order.resultCode} — Thành công`
                      : `✗ ${order.resultCode} — ${getResultDesc(order.resultCode)}`}
                  </span>
                : null
            } />
            <Row label="Message"   value={order.message} />
            <Row label="Loại đơn" value={order.orderType} />
            <Row label="Hình thức" value={order.payType ? <span className="chip">{order.payType}</span> : null} />
            <Row label="Nguồn"     value={order.source  ? <span className="chip">{order.source}</span>  : null} />
          </Section>

          <Section title="Thời gian">
            <Row label="Tạo lúc"       value={fmtDate(order.createdAt)} />
            <Row label="MoMo phản hồi" value={fmtMs(order.responseTime)} />
            <Row label="Hoàn tất lúc"  value={fmtDate(order.paidAt)} />
          </Section>

          {order.extraData && (
            <Section title="Extra Data">
              <div className="extra-block">
                {typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra}
              </div>
            </Section>
          )}
        </div>

        <div className="modal-ft">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-del-modal" onClick={() => { onClose(); onDelete(order.orderId) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Xóa giao dịch
            </button>
            <button className="btn-query-modal" onClick={() => onQuery(order.orderId)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
              </svg>
              Tra cứu MoMo
            </button>
            {order.resultCode === 9000 && (
            <button
              className="btn-confirm-modal"
              onClick={() => { onClose(); onConfirm(order.orderId, order.amount) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Xác nhận (9000)
            </button>
          )}
          </div>
          <button className="btn-close-modal" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── QUERY MODAL (MoMo API) ───────────────────────────────────
function QueryModal({ orderId, setOrderId, loading, result, error, onQuery, onClose }) {
  const copy = text => navigator.clipboard?.writeText(String(text))

  const rc     = result?.resultCode
  const isOk   = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-query" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-hd">
          <div>
            <div className="modal-hd-label">Tra cứu giao dịch MoMo</div>
            <div className="modal-hd-id">Nhập Order ID để tra cứu</div>
          </div>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        {/* Input */}
        <div className="qinput-wrap">
          <label className="qinput-label">Order ID</label>
          <div className="qinput-row">
            <input
              className="qinput"
              type="text"
              placeholder="Nhập mã đơn hàng (orderId)..."
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && onQuery()}
              autoFocus
            />
            <button className="btn-do-query" onClick={onQuery} disabled={loading || !orderId.trim()}>
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              }
              {loading ? 'Đang tra cứu...' : 'Tra cứu'}
            </button>
          </div>
          <div className="qinput-hint">
            API sẽ gọi trực tiếp đến MoMo server để lấy trạng thái thực tế.
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="qerror">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="modal-body">
            {/* Status hero */}
            <div className="qresult-hero" style={{
              background: isOk ? '#dcfce7' : rc === 1000 || rc === 7000 ? '#fef3c7' : '#fee2e2'
            }}>
              <div className="qresult-rc" style={{ color: isOk ? '#16a34a' : rc === 1000 || rc === 7000 ? '#d97706' : '#dc2626' }}>
                {isOk ? '✓' : '✗'} {rc}
              </div>
              <div className="qresult-desc">{rcDesc}</div>
              {result.message && <div className="qresult-msg">{result.message}</div>}
            </div>

            {/* Detail fields */}
            <Section title="Thông tin đơn hàng">
              <Row label="Order ID"    value={result.orderId}    mono copy={() => copy(result.orderId)} />
              <Row label="Request ID"  value={result.requestId}  mono copy={() => copy(result.requestId)} />
              <Row label="Trans ID"    value={result.transId}    mono copy={() => copy(result.transId)} />
              <Row label="Order Info"  value={result.orderInfo} />
            </Section>

            <Section title="Kết quả thanh toán">
              <Row label="Result Code" value={
                rc !== undefined
                  ? <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isOk ? '#16a34a' : '#dc2626' }}>
                      {rc} — {rcDesc}
                    </span>
                  : null
              } />
              <Row label="Số tiền"     value={result.amount !== undefined ? `${fmt(result.amount)} ₫` : null} />
              <Row label="Hình thức"   value={result.payType   ? <span className="chip">{result.payType}</span>   : null} />
              <Row label="Order Type"  value={result.orderType ? <span className="chip">{result.orderType}</span> : null} />
            </Section>

            <Section title="Thời gian">
              <Row label="Response Time" value={result.responseTime ? fmtMs(result.responseTime) : null} />
              <Row label="Pay Time"      value={result.payTime      ? fmtMs(result.payTime)      : null} />
            </Section>

            {/* Raw JSON toggle */}
            <Section title="Raw Response">
              <div className="extra-block" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {JSON.stringify(result, null, 2)}
              </div>
            </Section>
          </div>
        )}

        {/* Footer */}
        <div className="modal-ft">
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
             · MoMo API v2
          </div>
          <button className="btn-close-modal" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ orderId, amount, loading, result, error, onConfirm, onCancel, onClose }) {
  const rc   = result?.resultCode
  const isOk = rc === 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-query" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-hd-label">Xác nhận / Huỷ giao dịch</div>
            <div className="modal-hd-id" style={{ color: '#6b7280', fontSize: 12 }}>
              POST /v2/gateway/api/confirm · {orderId}
            </div>
          </div>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="qinput-wrap">
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
            Giao dịch <strong style={{ fontFamily: 'monospace' }}>{orderId}</strong> đang ở trạng thái <strong style={{ color: '#d97706' }}>9000 — Authorized</strong>.
            <br />Số tiền: <strong>{parseInt(amount || 0).toLocaleString('vi-VN')} ₫</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-do-query"
              style={{ background: '#16a34a' }}
              onClick={onConfirm}
              disabled={loading || !!result}
            >
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              }
              Capture (xác nhận)
            </button>
            <button
              className="btn-do-query"
              style={{ background: '#dc2626' }}
              onClick={onCancel}
              disabled={loading || !!result}
            >
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              }
              Cancel (huỷ)
            </button>
          </div>
          <div className="qinput-hint">
            Capture → chuyển tiền về ví đối tác. Cancel → hoàn tiền về người dùng.
          </div>
        </div>

        {error && (
          <div className="qerror">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {result && (
          <div className="modal-body">
            <div className="qresult-hero" style={{ background: isOk ? '#dcfce7' : '#fee2e2' }}>
              <div className="qresult-rc" style={{ color: isOk ? '#16a34a' : '#dc2626' }}>
                {isOk ? '✓' : '✗'} {rc}
              </div>
              <div className="qresult-desc">
                {result.requestType === 'capture' ? 'Capture' : 'Cancel'} — {getResultDesc(rc)}
              </div>
              {result.message && <div className="qresult-msg">{result.message}</div>}
            </div>
            <Section title="Raw Response">
              <div className="extra-block" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {JSON.stringify(result, null, 2)}
              </div>
            </Section>
          </div>
        )}

        <div className="modal-ft">
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Chỉ áp dụng cho giao dịch resultCode = 9000</div>
          <button className="btn-close-modal" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="msection">
      <div className="msection-title">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, mono, copy }) {
  if (!value && value !== 0) return null
  return (
    <div className="mrow">
      <span className="mrow-label">{label}</span>
      <span className={`mrow-value ${mono ? 'mono' : ''}`}>
        {value}
        {copy && value && value !== '—' && (
          <button className="copy-btn" onClick={copy} title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        )}
      </span>
    </div>
  )
}

// ─── CSS ─────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --mm:      #ae0070;
    --mm-light:#fff0f7;
    --success: #16a34a;
    --danger:  #dc2626;
    --warning: #d97706;
    --muted:   #6b7280;
    --border:  rgba(174,0,112,0.1);
    --surface: rgba(255,255,255,0.92);
    --text:    #111827;
    --font:    'Inter', sans-serif;
  }

  body { font-family: var(--font); color: var(--text); }

  /* ── BG ── */
  .bg-wrap { position: relative; min-height: 100vh; width: 100vw; background: #f5edf2; overflow-x: hidden; }
  .orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55; z-index: 0; pointer-events: none; }
  .orb1 { top:-5%; left:-5%; width:45vw; height:45vw; background:#ff9cb7; animation: om1 7s infinite alternate ease-in-out; }
  .orb2 { bottom:-5%; right:-5%; width:55vw; height:55vw; background:#b0bec5; animation: om2 9s infinite alternate ease-in-out; }
  .orb3 { top:20%; right:-5%; width:40vw; height:40vw; background:#dfb2ea; animation: om3 8s infinite alternate ease-in-out; }
  .orb4 { bottom:-5%; left:5%; width:35vw; height:35vw; background:#80cbc4; animation: om1 8.5s infinite alternate ease-in-out; }
  @keyframes om1 { 0%{transform:translate(0,0)scale(1)} 50%{transform:translate(8vw,4vh)scale(1.15)} 100%{transform:translate(-4vw,7vh)scale(0.9)} }
  @keyframes om2 { 0%{transform:translate(0,0)scale(1.1)} 50%{transform:translate(-10vw,-6vh)scale(0.9)} 100%{transform:translate(6vw,4vh)scale(1.1)} }
  @keyframes om3 { 0%{transform:translate(0,0)scale(0.9)} 50%{transform:translate(-5vw,7vh)scale(1.2)} 100%{transform:translate(7vw,-4vh)scale(1)} }

  /* ── TOPBAR ── */
  .topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    background: rgba(255,255,255,0.88);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 1px 16px rgba(174,0,112,0.06);
  }
  .topbar-inner {
    max-width: 1600px; margin: 0 auto;
    padding: 0 24px; height: 60px;
    display: flex; align-items: center; gap: 20px;
  }

  .logo-area { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
  .logo-img  { width: 30px; height: 30px; border-radius: 8px; object-fit: contain; }
  .logo-text { font-size: 17px; font-weight: 800; color: var(--mm); letter-spacing: -0.3px; }
  .sync-dot  { width: 8px; height: 8px; border-radius: 50%; transition: background 0.3s; }
  .sync-dot.idle    { background: #22c55e; }
  .sync-dot.syncing { background: #f59e0b; animation: pulse 0.8s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  .filter-tabs { display: flex; gap: 2px; flex: 1; justify-content: center; }
  .ftab {
    padding: 6px 14px; border: none; border-radius: 8px;
    background: transparent; font-size: 13px; font-weight: 600;
    color: var(--muted); cursor: pointer; transition: all 0.15s;
    display: flex; align-items: center; gap: 6px; font-family: var(--font);
  }
  .ftab:hover { background: var(--mm-light); color: var(--mm); }
  .ftab.active { background: var(--mm); color: #fff; }
  .ftab-count {
    font-size: 11px; font-weight: 700;
    background: rgba(0,0,0,0.08); color: inherit;
    padding: 2px 7px; border-radius: 20px; line-height: 1.4;
  }
  .ftab.active .ftab-count { background: rgba(255,255,255,0.25); }

  .topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .searchbox { position: relative; display: flex; align-items: center; }
  .searchbox svg { position: absolute; left: 11px; color: var(--muted); pointer-events: none; }
  .searchbox input {
    padding: 7px 32px 7px 34px;
    border: 1px solid var(--border); border-radius: 10px;
    background: rgba(255,255,255,0.7); font-size: 13px;
    font-family: var(--font); width: 220px; color: var(--text); transition: all 0.2s;
  }
  .searchbox input:focus { outline: none; border-color: var(--mm); background: #fff; box-shadow: 0 0 0 3px rgba(174,0,112,0.08); width: 260px; }
  .search-clear { position: absolute; right: 10px; background: none; border: none; font-size: 12px; color: var(--muted); cursor: pointer; line-height: 1; }

  .btn-danger  { background: var(--danger); color: #fff; border: none; padding: 7px 14px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: var(--font); }
  .btn-refresh {
    width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border);
    background: rgba(255,255,255,0.7); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--muted); transition: all 0.15s;
  }
  .btn-refresh:hover { border-color: var(--mm); color: var(--mm); background: var(--mm-light); }
  .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-logout  { padding: 7px 14px; border-radius: 9px; border: 1px solid var(--border); background: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; font-family: var(--font); }
  .btn-logout:hover { color: var(--danger); border-color: var(--danger); background: #fff; }

  .btn-scan {
    padding: 7px 14px; border-radius: 9px;
    border: 1px solid rgba(174,0,112,0.3);
    background: #fff0f7; color: #ae0070;
    font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .btn-scan:hover { background: #ae0070; color: #fff; }

  /* ── QUERY BUTTON ── */
  .btn-query {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 9px;
    border: 1px solid rgba(99,102,241,0.3);
    background: #eef2ff; color: #4f46e5;
    font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .btn-query:hover { background: #4f46e5; color: #fff; border-color: #4f46e5; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  /* ── MAIN ── */
  .dashboard { padding-top: 60px; position: relative; z-index: 1; }
  .main { max-width: 1600px; margin: 0 auto; padding: 24px; }

  /* ── STAT CARDS ── */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  @media(max-width:900px) { .stat-grid { grid-template-columns: repeat(2,1fr); } }
  .scard {
    background: var(--surface);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-radius: 16px; padding: 20px 22px;
    border: 1px solid rgba(255,255,255,0.7);
    box-shadow: 0 2px 20px rgba(174,0,112,0.04);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .scard:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(174,0,112,0.08); }
  .scard-label { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.6px; text-transform: uppercase; }
  .scard-value { font-size: 26px; font-weight: 800; margin-top: 6px; letter-spacing: -0.5px; }
  .scard-sub   { font-size: 12px; color: var(--muted); margin-top: 5px; }

  /* ── TABLE ── */
  .table-wrap {
    background: var(--surface);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.7);
    box-shadow: 0 4px 30px rgba(0,0,0,0.04);
    overflow: hidden;
  }
  .table-scroll { overflow-x: auto; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 1100px; }
  .tbl thead tr { background: rgba(245,237,242,0.8); }
  .tbl th {
    padding: 13px 16px; text-align: left;
    font-size: 11px; font-weight: 700; color: var(--muted);
    letter-spacing: 0.5px; text-transform: uppercase;
    border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  .th-check, .td-check  { width: 44px; text-align: center !important; }
  .th-action, .td-action { width: 80px; text-align: center !important; }
  .tbl td { padding: 14px 16px; border-bottom: 1px solid rgba(174,0,112,0.03); vertical-align: middle; }
  .trow { cursor: pointer; transition: background 0.1s; }
  .trow:hover { background: rgba(255,255,255,0.6); }
  .trow.sel   { background: rgba(174,0,112,0.05) !important; }
  .trow:last-child td { border-bottom: none; }

  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .td-amount { font-weight: 800; color: var(--mm); font-size: 14px; white-space: nowrap; }
  .td-info   { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; }
  .td-code   { font-family: monospace; font-size: 12px; color: #4b5563; white-space: nowrap; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
  .td-date   { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .chip      { background: rgba(0,0,0,0.06); padding: 3px 9px; border-radius: 6px; font-size: 12px; font-weight: 600; }
  .result-code { font-family: monospace; font-size: 13px; font-weight: 700; }
  .muted { color: #9ca3af; }

  /* Row action buttons */
  .btn-action-row {
    width: 28px; height: 28px; border-radius: 7px; border: none;
    background: transparent; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .btn-query-row { color: #6366f1; }
  .btn-query-row:hover { background: #eef2ff; color: #4f46e5; }
  .btn-del-row { color: #9ca3af; }
  .btn-del-row:hover { background: #fee2e2; color: var(--danger); }

  .table-footer {
    padding: 12px 20px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--muted);
  }
  .table-count { font-weight: 600; }
  .last-sync   { font-style: italic; }

  .empty      { padding: 72px 24px; text-align: center; }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-text { font-size: 15px; font-weight: 600; color: var(--muted); }

  /* ── MODAL ── */
  .overlay {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(17,7,13,0.5);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: fadein 0.15s ease;
  }
  @keyframes fadein { from{opacity:0} to{opacity:1} }
  .modal {
    background: #fff; border-radius: 20px;
    width: 100%; max-width: 520px; max-height: 88vh;
    display: flex; flex-direction: column;
    box-shadow: 0 32px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(174,0,112,0.08);
    animation: slideup 0.2s ease;
    overflow: hidden;
  }
  .modal-query { max-width: 580px; }
  @keyframes slideup { from{transform:translateY(16px);opacity:0} to{transform:none;opacity:1} }

  .modal-hd {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 20px 22px 16px;
    border-bottom: 1px solid #f3f4f6;
    flex-shrink: 0;
  }
  .modal-hd-label { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
  .modal-hd-id    { font-family: monospace; font-size: 13px; color: #374151; }
  .modal-x {
    width: 30px; height: 30px; border-radius: 8px; border: none;
    background: #f3f4f6; color: #6b7280; font-size: 14px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-left: 12px; transition: all 0.15s;
  }
  .modal-x:hover { background: #fee2e2; color: var(--danger); }

  .modal-hero {
    padding: 20px 22px; flex-shrink: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .modal-amount    { font-size: 28px; font-weight: 800; letter-spacing: -1px; }
  .modal-orderinfo { font-size: 13px; color: #374151; font-weight: 500; }

  .modal-body       { overflow-y: auto; flex: 1; padding: 4px 0; }
  .msection         { padding: 0 22px; margin-bottom: 4px; }
  .msection-title   {
    font-size: 10px; font-weight: 700; color: var(--muted);
    letter-spacing: 0.8px; text-transform: uppercase;
    padding: 14px 0 8px; border-top: 1px solid #f3f4f6;
  }
  .msection:first-child .msection-title { border-top: none; }
  .mrow { display: flex; align-items: flex-start; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f9fafb; }
  .mrow:last-child { border-bottom: none; }
  .mrow-label { min-width: 130px; font-size: 12px; font-weight: 600; color: var(--muted); padding-top: 1px; flex-shrink: 0; }
  .mrow-value { font-size: 13px; color: var(--text); flex: 1; word-break: break-all; display: flex; align-items: center; gap: 6px; }
  .mrow-value.mono { font-family: monospace; font-size: 12px; }
  .copy-btn {
    flex-shrink: 0; background: none; border: none; color: #9ca3af;
    cursor: pointer; padding: 2px; border-radius: 4px;
    display: inline-flex; align-items: center; transition: color 0.15s;
  }
  .copy-btn:hover { color: var(--mm); }

  .extra-block {
    background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
    padding: 12px; font-family: monospace; font-size: 11.5px; color: #374151;
    white-space: pre-wrap; word-break: break-all; margin-bottom: 4px;
  }

  .modal-ft {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 22px; border-top: 1px solid #f3f4f6; flex-shrink: 0;
  }
  .btn-del-modal {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 14px; border-radius: 9px;
    border: 1px solid #fecaca; background: #fff5f5;
    color: var(--danger); font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .btn-del-modal:hover { background: #fee2e2; border-color: var(--danger); }

  .btn-query-modal {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 14px; border-radius: 9px;
    border: 1px solid rgba(99,102,241,0.3); background: #eef2ff;
    color: #4f46e5; font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .btn-query-modal:hover { background: #4f46e5; color: #fff; border-color: #4f46e5; }

  .btn-close-modal {
    padding: 8px 20px; border-radius: 9px;
    border: 1px solid var(--border); background: #f9fafb;
    font-size: 13px; font-weight: 600; color: #374151;
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .btn-close-modal:hover { background: #fff; }

  /* ── QUERY MODAL SPECIFIC ── */
  .qinput-wrap { padding: 16px 22px; border-bottom: 1px solid #f3f4f6; flex-shrink: 0; }
  .qinput-label { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 8px; }
  .qinput-row { display: flex; gap: 8px; }
  .qinput {
    flex: 1; padding: 10px 14px;
    border: 1.5px solid var(--border); border-radius: 10px;
    font-size: 14px; font-family: monospace; color: var(--text);
    background: #fafafa; transition: all 0.2s;
  }
  .qinput:focus { outline: none; border-color: #6366f1; background: #fff; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .qinput-hint { font-size: 11px; color: var(--muted); margin-top: 6px; }
  .btn-do-query {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 10px 18px; border-radius: 10px;
    border: none; background: #4f46e5; color: #fff;
    font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: var(--font); transition: all 0.15s; white-space: nowrap;
  }
  .btn-do-query:hover:not(:disabled) { background: #4338ca; }
  .btn-do-query:disabled { opacity: 0.5; cursor: not-allowed; }

  .qerror {
    margin: 12px 22px; padding: 10px 14px;
    background: #fff5f5; border: 1px solid #fecaca; border-radius: 10px;
    color: var(--danger); font-size: 13px; font-weight: 600;
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  }

  .qresult-hero {
    margin: 0; padding: 16px 22px; flex-shrink: 0;
    display: flex; flex-direction: column; gap: 4px;
  }
  .qresult-rc   { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; font-family: monospace; }
  .qresult-desc { font-size: 14px; font-weight: 700; color: #374151; }
  .qresult-msg  { font-size: 12px; color: var(--muted); }

  /* ── LOGIN ── */
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; z-index: 10; }
  .login-card {
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
    border-radius: 24px; padding: 40px 36px; width: 100%; max-width: 400px;
    text-align: center;
    box-shadow: 0 24px 60px rgba(174,0,112,0.1), 0 0 0 1px rgba(255,255,255,0.8);
  }
  .login-logo-box { width: 60px; height: 60px; border-radius: 16px; background: #fff; border: 1px solid rgba(174,0,112,0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; box-shadow: 0 4px 12px rgba(174,0,112,0.08); }
  .login-logo     { width: 44px; height: 44px; object-fit: contain; }
  .login-title    { font-size: 22px; font-weight: 800; color: var(--text); letter-spacing: -0.5px; }
  .login-sub      { font-size: 13px; color: var(--muted); margin-top: 5px; margin-bottom: 28px; }
  .pw-group input {
    width: 100%; padding: 13px 16px; border: 1.5px solid rgba(174,0,112,0.15);
    border-radius: 12px; font-size: 15px; font-family: var(--font);
    margin-bottom: 12px; background: rgba(245,237,242,0.5); color: var(--text);
    transition: all 0.2s;
  }
  .pw-group input:focus { outline: none; border-color: var(--mm); background: #fff; box-shadow: 0 0 0 4px rgba(174,0,112,0.07); }
  .pw-group.error input { border-color: var(--danger); background: #fff5f5; }
  .pw-error  { font-size: 13px; color: var(--danger); font-weight: 600; margin-bottom: 14px; }
  .login-btn {
    width: 100%; padding: 13px; background: var(--mm); color: #fff;
    border: none; border-radius: 12px; font-size: 15px; font-weight: 700;
    cursor: pointer; font-family: var(--font);
    box-shadow: 0 6px 20px rgba(174,0,112,0.2); transition: all 0.2s;
  }
  .login-btn:hover { background: #91005d; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(174,0,112,0.25); }

  /* ── RESPONSIVE ── */
  @media(max-width:768px) {
    .topbar-inner { flex-wrap: wrap; height: auto; padding: 10px 16px; gap: 10px; }
    .filter-tabs  { order: 3; width: 100%; overflow-x: auto; justify-content: flex-start; padding-bottom: 2px; }
    .topbar-right { margin-left: auto; }
    .searchbox input { width: 160px; }
    .searchbox input:focus { width: 180px; }
    .dashboard { padding-top: 0; }
    .main { padding: 16px; }
    .stat-grid { grid-template-columns: repeat(2,1fr); gap: 12px; }
  }

  .btn-confirm-row {
  color: #16a34a; border-color: rgba(22,163,74,0.3); background: #f0fdf4;
}
.btn-confirm-row:hover { background: #16a34a; color: #fff; border-color: #16a34a; }

.btn-confirm-modal {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 14px; border-radius: 9px;
  border: 1px solid rgba(22,163,74,0.3); background: #f0fdf4;
  color: #16a34a; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: var(--font); transition: all 0.15s;
}
.btn-confirm-modal:hover { background: #16a34a; color: #fff; border-color: #16a34a; }

`