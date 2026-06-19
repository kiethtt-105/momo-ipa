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

  const [queryModal,      setQueryModal]      = useState(false)
  const [queryOrderId,    setQueryOrderId]    = useState('')
  const [queryLoading,    setQueryLoading]    = useState(false)
  const [queryResult,     setQueryResult]     = useState(null)
  const [queryError,      setQueryError]      = useState(null)

  const [confirmModal,   setConfirmModal]   = useState(false)
  const [confirmOrderId, setConfirmOrderId] = useState('')
  const [confirmAmount,  setConfirmAmount]  = useState(0)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmResult,  setConfirmResult]  = useState(null)
  const [confirmError,   setConfirmError]   = useState(null)

  const ordersRef   = useRef([])
  const fetchingRef = useRef(false)
  const selectedRef = useRef(new Set())
  const detailRef   = useRef(null)

  useEffect(() => { ordersRef.current   = orders   }, [orders])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { detailRef.current   = detail   }, [detail])

  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
      .finally(() => setCheckingSession(false))
  }, [])

  const fetchOrders = useCallback(async ({ force = false } = {}) => {
    if (fetchingRef.current && !force) return
    fetchingRef.current = true
    setFetching(true)
    try {
      const res = await fetch('/api/momo/orders')
      if (res.status === 401) { setAuthed(false); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const raw  = data.orders || []
      setOrders(raw)
      setLastSync(new Date())
      if (detailRef.current) {
        const fresh = raw.find(o => o.orderId === detailRef.current)
        if (fresh) setDetail(fresh.orderId)
      }
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

  useEffect(() => {
    if (authed !== true) return
    fetchOrders({ force: true })
    const iv = setInterval(() => fetchOrders(), REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [authed, fetchOrders])

  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') { setDetail(null); setQueryModal(false) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

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

  const openConfirmForOrder = (orderId, amount) => {
    setConfirmOrderId(orderId)
    setConfirmAmount(amount)
    setConfirmResult(null)
    setConfirmError(null)
    setConfirmModal(true)
  }

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

  const openQueryForOrder = (orderId) => {
    setQueryOrderId(orderId)
    setQueryResult(null)
    setQueryError(null)
    setQueryModal(true)
  }

  const displayed = orders.map(normalizeStatus)
  const counts = {
    ALL:     displayed.length,
    PAID:    displayed.filter(o => o.status === 'PAID').length,
    FAILED:  displayed.filter(o => o.status === 'FAILED').length,
    PENDING: displayed.filter(o => o.status === 'PENDING').length,
    EXPIRED: displayed.filter(o => o.status === 'EXPIRED').length,
  }
  const totalRevenue = displayed
    .filter(o => o.status === 'PAID')
    .reduce((s, o) => s + parseInt(o.amount || 0), 0)

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
  const detailOrder = detail ? displayed.find(o => o.orderId === detail) : null

  const toggleOne = id => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }
  const toggleAll = () =>
    selected.size === filtered.length
      ? setSelected(new Set())
      : setSelected(new Set(filtered.map(o => o.orderId)))

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
    <div className="flex min-h-screen w-full items-center justify-center bg-[#f5edf2]">
      <AdminOrbs />
      <div className="relative z-10 h-5 w-5 animate-spin rounded-full border-2 border-[rgba(174,0,112,0.2)] border-t-[#ae0070]" />
    </div>
  )

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin · Đăng nhập</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f5edf2] px-5"
        style={{ fontFamily: "'Inter', sans-serif" }}>
        <AdminOrbs />
        <div
          className="relative z-10 w-full max-w-[400px] rounded-3xl border border-white/80 bg-white/95 px-9 py-10 text-center shadow-[0_24px_60px_rgba(174,0,112,0.1)]"
          style={{ backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}
        >
          <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-[rgba(174,0,112,0.1)] bg-white shadow-[0_4px_12px_rgba(174,0,112,0.08)]">
            <img src="/Main.png" alt="Logo" className="h-11 w-11 object-contain" />
          </div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-[#111827]">Quản trị viên</h1>
          <p className="mb-7 mt-1.5 text-[13px] text-[#6b7280]">Hệ thống quản lý giao dịch MoMo</p>
          <input
            type="password"
            placeholder="Mật khẩu quản trị"
            value={password}
            autoFocus
            onChange={e => { setPassword(e.target.value); setPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && login()}
            className={`mb-3 w-full rounded-xl border-[1.5px] bg-[rgba(245,237,242,0.5)] px-4 py-3 text-[15px] text-[#111827] outline-none transition-all focus:border-[#ae0070] focus:bg-white focus:shadow-[0_0_0_4px_rgba(174,0,112,0.07)] ${
              pwError ? 'border-[#dc2626] bg-[#fff5f5]' : 'border-[rgba(174,0,112,0.15)]'
            }`}
          />
          {pwError && <p className="mb-3.5 text-[13px] font-semibold text-[#dc2626]">⚠ Mật khẩu không chính xác</p>}
          <button
            onClick={login}
            className="w-full rounded-xl bg-[#ae0070] py-3 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-px hover:bg-[#91005d] hover:shadow-[0_8px_24px_rgba(174,0,112,0.25)]"
          >
            Đăng nhập
          </button>
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
    } catch { setPwError(true) }
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        @keyframes om1 { 0%{transform:translate(0,0)scale(1)} 50%{transform:translate(8vw,4vh)scale(1.15)} 100%{transform:translate(-4vw,7vh)scale(0.9)} }
        @keyframes om2 { 0%{transform:translate(0,0)scale(1.1)} 50%{transform:translate(-10vw,-6vh)scale(0.9)} 100%{transform:translate(6vw,4vh)scale(1.1)} }
        @keyframes om3 { 0%{transform:translate(0,0)scale(0.9)} 50%{transform:translate(-5vw,7vh)scale(1.2)} 100%{transform:translate(7vw,-4vh)scale(1)} }
        @keyframes slideup { from{transform:translateY(16px);opacity:0} to{transform:none;opacity:1} }
        @keyframes fadein  { from{opacity:0} to{opacity:1} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        .spin-anim { animation: spin 0.8s linear infinite; }
        .pulse-dot  { animation: pulse 0.8s infinite; }
      `}</style>

      <div className="relative min-h-screen w-full overflow-x-hidden bg-[#f5edf2]" style={{ fontFamily: "'Inter', sans-serif" }}>
        <AdminOrbs />

        {/* ── DETAIL MODAL ── */}
        {detailOrder && (
          <DetailModal
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

        {/* ── TOPBAR ── */}
        <header
          className="fixed left-0 right-0 top-0 z-[200] border-b border-[rgba(174,0,112,0.1)] shadow-[0_1px_16px_rgba(174,0,112,0.06)]"
          style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', background: 'rgba(255,255,255,0.88)' }}
        >
          <div className="mx-auto flex h-[60px] max-w-[1600px] flex-wrap items-center gap-5 px-6 max-md:h-auto max-md:gap-2.5 max-md:py-2.5">
            {/* Logo */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <img src="/Main.png" alt="" className="h-[30px] w-[30px] rounded-lg object-contain" />
              <span className="text-[17px] font-extrabold tracking-[-0.3px] text-[#ae0070]">MoMo Admin</span>
              <span
                className={`h-2 w-2 rounded-full transition-colors ${fetching ? 'pulse-dot bg-[#f59e0b]' : 'bg-[#22c55e]'}`}
                title={lastSync ? `Sync: ${fmtDate(lastSync)}` : 'Chưa sync'}
              />
            </div>

            {/* Filter tabs */}
            <nav className="flex flex-1 justify-center gap-0.5 max-md:order-3 max-md:w-full max-md:overflow-x-auto max-md:justify-start">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
                    filter === f.key
                      ? 'bg-[#ae0070] text-white'
                      : 'bg-transparent text-[#6b7280] hover:bg-[#fff0f7] hover:text-[#ae0070]'
                  }`}
                >
                  {f.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-[1.4] ${
                    filter === f.key ? 'bg-white/25' : 'bg-black/[0.08]'
                  }`}>
                    {counts[f.key]}
                  </span>
                </button>
              ))}
            </nav>

            {/* Right actions */}
            <div className="flex flex-shrink-0 items-center gap-2 max-md:ml-auto">
              {/* Search */}
              <div className="relative flex items-center">
                <svg className="pointer-events-none absolute left-2.5 text-[#6b7280]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-[220px] rounded-[10px] border border-[rgba(174,0,112,0.1)] bg-white/70 py-1.5 pl-[34px] pr-8 text-[13px] text-[#111827] outline-none transition-all focus:border-[#ae0070] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.08)] focus:w-[260px]"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 text-[12px] leading-none text-[#6b7280]">✕</button>
                )}
              </div>

              {selected.size > 0 && (
                <button onClick={() => doDelete([...selected])}
                  className="rounded-[9px] border-0 bg-[#dc2626] px-3.5 py-1.5 text-[13px] font-bold text-white">
                  🗑 Xóa ({selected.size})
                </button>
              )}

              <button
                onClick={() => { setQueryOrderId(''); setQueryResult(null); setQueryError(null); setQueryModal(true) }}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(99,102,241,0.3)] bg-[#eef2ff] px-3.5 py-1.5 text-[13px] font-bold text-[#4f46e5] transition-all hover:border-[#4f46e5] hover:bg-[#4f46e5] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
                </svg>
                Tra cứu MoMo
              </button>

              <button onClick={() => router.push('/admin/scan')}
                className="rounded-[9px] border border-[rgba(174,0,112,0.3)] bg-[#fff0f7] px-3.5 py-1.5 text-[13px] font-bold text-[#ae0070] transition-all hover:bg-[#ae0070] hover:text-white">
                📷 Scan QR
              </button>

              <button onClick={() => fetchOrders({ force: true })} disabled={fetching}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-white/70 text-[#6b7280] transition-all hover:border-[#ae0070] hover:bg-[#fff0f7] hover:text-[#ae0070] disabled:cursor-not-allowed disabled:opacity-50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={fetching ? 'spin-anim' : ''}>
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                  <path d="M8 16H3v5"/>
                </svg>
              </button>

              <button
                onClick={() => fetch('/api/admin/session', { method: 'DELETE' }).finally(() => setAuthed(false))}
                className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-[#6b7280] transition-all hover:border-[#dc2626] hover:bg-white hover:text-[#dc2626]"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {/* ── MAIN ── */}
        <main className="relative z-10 mx-auto max-w-[1600px] px-6 pb-6 pt-[84px]">
          {/* Stat cards */}
          <div className="mb-5 grid grid-cols-4 gap-4 max-md:grid-cols-2">
            <StatCard label="Doanh thu"  value={`${fmt(totalRevenue)} ₫`} color="#ae0070" sub={`${counts.PAID} giao dịch thành công`} />
            <StatCard label="Thành công" value={`${counts.PAID} GD`}      color="#16a34a" sub={`${counts.PAID ? Math.round(counts.PAID / counts.ALL * 100) : 0}% tỉ lệ thành công`} />
            <StatCard label="Thất bại"   value={`${counts.FAILED} GD`}    color="#dc2626" sub={`${counts.EXPIRED} đơn hết hạn`} />
            <StatCard label="Tổng đơn"   value={`${counts.ALL} GD`}       color="#374151" sub={`${counts.PENDING} đang chờ xử lý`} />
          </div>

          {/* Table */}
          <div
            className="overflow-hidden rounded-2xl border border-white/70 shadow-[0_4px_30px_rgba(0,0,0,0.04)]"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.92)' }}
          >
            {filtered.length === 0 ? (
              <div className="px-6 py-[72px] text-center">
                <div className="mb-3 text-[40px]">🔍</div>
                <div className="text-[15px] font-semibold text-[#6b7280]">Không tìm thấy giao dịch nào</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-[13.5px]">
                  <thead>
                    <tr className="bg-[rgba(245,237,242,0.8)]">
                      <Th className="w-[44px] text-center">
                        <input
                          type="checkbox"
                          checked={selected.size > 0 && selected.size === filtered.length}
                          ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)}
                          onChange={toggleAll}
                        />
                      </Th>
                      <Th>Trạng thái</Th>
                      <Th>Số tiền</Th>
                      <Th>Nội dung</Th>
                      <Th>Mã đơn</Th>
                      <Th>Mã GD MoMo</Th>
                      <Th>Hình thức</Th>
                      <Th>Result</Th>
                      <Th>Tạo lúc</Th>
                      <Th>Hoàn tất</Th>
                      <Th className="w-[80px] text-center">Thao tác</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => {
                      const sm  = STATUS_META[o.status] || STATUS_META.PENDING
                      const sel = selected.has(o.orderId)
                      return (
                        <tr
                          key={o.orderId}
                          onClick={() => setDetail(o.orderId)}
                          className={`cursor-pointer border-b border-[rgba(174,0,112,0.03)] transition-colors last:border-0 hover:bg-white/60 ${sel ? '!bg-[rgba(174,0,112,0.05)]' : ''}`}
                        >
                          <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={sel} onChange={() => toggleOne(o.orderId)} />
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold"
                              style={{ background: sm.bg, color: sm.color }}>
                              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: sm.dot }} />
                              {sm.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-[14px] font-extrabold text-[#ae0070] whitespace-nowrap">{fmt(o.amount)} ₫</td>
                          <td className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle text-[#374151]" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                          <td className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle font-mono text-[12px] text-[#4b5563]">{o.orderId}</td>
                          <td className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle font-mono text-[12px] text-[#4b5563]">{o.transId || '—'}</td>
                          <td className="px-4 py-3.5 align-middle">
                            {o.payType
                              ? <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[12px] font-semibold">{o.payType}</span>
                              : <span className="text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            {o.resultCode !== undefined
                              ? <span className="font-mono text-[13px] font-bold" style={{ color: o.resultCode === 0 ? '#16a34a' : '#dc2626' }}>
                                  {o.resultCode === 0 ? '✓ 0' : `✗ ${o.resultCode}`}
                                </span>
                              : <span className="text-[#9ca3af]">—</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[12px] text-[#6b7280]">{fmtDate(o.createdAt)}</td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[12px] text-[#6b7280]">
                            {o.paidAt ? fmtDate(o.paidAt) : <span className="text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openQueryForOrder(o.orderId)} title="Tra cứu MoMo API"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#6366f1] transition-all hover:bg-[#eef2ff] hover:text-[#4f46e5]">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
                                </svg>
                              </button>
                              <button onClick={() => doDelete([o.orderId])} title="Xóa"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#9ca3af] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                              </button>
                              {o.resultCode === 9000 && (
                                <button onClick={() => openConfirmForOrder(o.orderId, o.amount)} title="Xác nhận / Huỷ giao dịch (9000)"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#16a34a] transition-all hover:bg-[#dcfce7]">
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

            <div className="flex items-center justify-between border-t border-[rgba(174,0,112,0.1)] px-5 py-3 text-[12px] text-[#6b7280]">
              <span className="font-semibold">
                {filtered.length} giao dịch
                {filter !== 'ALL' && ` · lọc theo "${FILTERS.find(f => f.key === filter)?.label}"`}
                {search && ` · tìm "${search}"`}
              </span>
              {lastSync && (
                <span className="italic">
                  Cập nhật lúc {lastSync.toLocaleTimeString('vi-VN')}
                  {fetching && ' · đang tải...'}
                </span>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}

// ─── SUB COMPONENTS ──────────────────────────────────────────

function AdminOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-[5%] -top-[5%] h-[45vw] w-[45vw] rounded-full bg-[#ff9cb7] opacity-55 blur-[70px]"
        style={{ animation: 'om1 7s infinite alternate ease-in-out' }} />
      <div className="absolute -bottom-[5%] -right-[5%] h-[55vw] w-[55vw] rounded-full bg-[#b0bec5] opacity-55 blur-[70px]"
        style={{ animation: 'om2 9s infinite alternate ease-in-out' }} />
      <div className="absolute -right-[5%] top-[20%] h-[40vw] w-[40vw] rounded-full bg-[#dfb2ea] opacity-55 blur-[70px]"
        style={{ animation: 'om3 8s infinite alternate ease-in-out' }} />
      <div className="absolute -bottom-[5%] left-[5%] h-[35vw] w-[35vw] rounded-full bg-[#80cbc4] opacity-55 blur-[70px]"
        style={{ animation: 'om1 8.5s infinite alternate ease-in-out' }} />
    </div>
  )
}

function StatCard({ label, value, color, sub }) {
  return (
    <div
      className="rounded-2xl border border-white/70 px-[22px] py-5 shadow-[0_2px_20px_rgba(174,0,112,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(174,0,112,0.08)]"
      style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.92)' }}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#6b7280]">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-[-0.5px]" style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-[#6b7280]">{sub}</div>}
    </div>
  )
}

function Th({ children, className = '' }) {
  return (
    <th className={`border-b border-[rgba(174,0,112,0.1)] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-[#6b7280] whitespace-nowrap ${className}`}>
      {children}
    </th>
  )
}

// ── MODAL BASE ────────────────────────────────────────────────
function ModalOverlay({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-5"
      style={{ background: 'rgba(17,7,13,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'fadein 0.15s ease' }}
      onClick={onClose}
    >
      {children}
    </div>
  )
}

function ModalBox({ children, onClick, maxW = 'max-w-[520px]' }) {
  return (
    <div
      className={`flex w-full ${maxW} max-h-[88vh] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(174,0,112,0.08)]`}
      style={{ animation: 'slideup 0.2s ease' }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

function ModalHeader({ label, id, onClose }) {
  return (
    <div className="flex flex-shrink-0 items-start justify-between border-b border-[#f3f4f6] px-[22px] pb-4 pt-5">
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.5px] text-[#6b7280]">{label}</div>
        <div className="font-mono text-[13px] text-[#374151]">{id}</div>
      </div>
      <button onClick={onClose}
        className="ml-3 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[14px] text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]">
        ✕
      </button>
    </div>
  )
}

// ── DETAIL MODAL ──────────────────────────────────────────────
function DetailModal({ order, onClose, onDelete, onQuery, onConfirm }) {
  const sm    = STATUS_META[order.status] || STATUS_META.PENDING
  const extra = decodeExtra(order.extraData)
  const copy  = text => navigator.clipboard?.writeText(text)

  return (
    <ModalOverlay onClose={onClose}>
      <ModalBox onClick={e => e.stopPropagation()}>
        <ModalHeader label="Chi tiết giao dịch" id={order.orderId} onClose={onClose} />

        {/* Hero */}
        <div className="flex flex-shrink-0 flex-col gap-2 px-[22px] py-5" style={{ background: sm.bg }}>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold" style={{ color: sm.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.dot }} />{sm.label}
          </span>
          <div className="text-[28px] font-extrabold tracking-[-1px]" style={{ color: sm.color }}>{fmt(order.amount)} ₫</div>
          <div className="text-[13px] font-medium text-[#374151]">{order.orderInfo || '—'}</div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          <MSection title="Thông tin giao dịch">
            <MRow label="Mã đơn"     value={order.orderId}   mono copy={() => copy(order.orderId)} />
            <MRow label="Request ID" value={order.requestId} mono copy={() => copy(order.requestId)} />
            <MRow label="Mã GD MoMo" value={order.transId}   mono copy={() => copy(order.transId)} />
          </MSection>
          <MSection title="Kết quả">
            <MRow label="Result Code" value={
              order.resultCode !== undefined
                ? <span className="font-mono font-bold" style={{ color: order.resultCode === 0 ? '#16a34a' : '#dc2626' }}>
                    {order.resultCode === 0 ? `✓ ${order.resultCode} — Thành công` : `✗ ${order.resultCode} — ${getResultDesc(order.resultCode)}`}
                  </span>
                : null
            } />
            <MRow label="Message"   value={order.message} />
            <MRow label="Loại đơn" value={order.orderType} />
            <MRow label="Hình thức" value={order.payType ? <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[12px] font-semibold">{order.payType}</span> : null} />
            <MRow label="Nguồn"     value={order.source  ? <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[12px] font-semibold">{order.source}</span>  : null} />
          </MSection>
          <MSection title="Thời gian">
            <MRow label="Tạo lúc"       value={fmtDate(order.createdAt)} />
            <MRow label="MoMo phản hồi" value={fmtMs(order.responseTime)} />
            <MRow label="Hoàn tất lúc"  value={fmtDate(order.paidAt)} />
          </MSection>
          {order.extraData && (
            <MSection title="Extra Data">
              <div className="mb-1 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151] whitespace-pre-wrap break-all">
                {typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra}
              </div>
            </MSection>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-[22px] py-3.5">
          <div className="flex gap-2">
            <ModalBtn variant="danger" onClick={() => { onClose(); onDelete(order.orderId) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Xóa giao dịch
            </ModalBtn>
            <ModalBtn variant="indigo" onClick={() => onQuery(order.orderId)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
              </svg>
              Tra cứu MoMo
            </ModalBtn>
            {order.resultCode === 9000 && (
              <ModalBtn variant="green" onClick={() => { onClose(); onConfirm(order.orderId, order.amount) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Xác nhận (9000)
              </ModalBtn>
            )}
          </div>
          <ModalBtn variant="neutral" onClick={onClose}>Đóng</ModalBtn>
        </div>
      </ModalBox>
    </ModalOverlay>
  )
}

// ── QUERY MODAL ───────────────────────────────────────────────
function QueryModal({ orderId, setOrderId, loading, result, error, onQuery, onClose }) {
  const copy = text => navigator.clipboard?.writeText(String(text))
  const rc     = result?.resultCode
  const isOk   = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null

  return (
    <ModalOverlay onClose={onClose}>
      <ModalBox onClick={e => e.stopPropagation()} maxW="max-w-[580px]">
        <ModalHeader label="Tra cứu giao dịch MoMo" id="Nhập Order ID để tra cứu" onClose={onClose} />

        <div className="flex-shrink-0 border-b border-[#f3f4f6] px-[22px] py-4">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#6b7280]">Order ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nhập mã đơn hàng (orderId)..."
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && onQuery()}
              autoFocus
              className="flex-1 rounded-[10px] border-[1.5px] border-[rgba(174,0,112,0.1)] bg-[#fafafa] px-3.5 py-2.5 font-mono text-[14px] text-[#111827] outline-none transition-all focus:border-[#6366f1] focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
            />
            <button onClick={onQuery} disabled={loading || !orderId.trim()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#4f46e5] px-4 py-2.5 text-[13px] font-bold text-white transition-all hover:not-disabled:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50">
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-anim"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
              {loading ? 'Đang tra cứu...' : 'Tra cứu'}
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-[#6b7280]">API sẽ gọi trực tiếp đến MoMo server để lấy trạng thái thực tế.</div>
        </div>

        {error && (
          <div className="mx-[22px] my-3 flex flex-shrink-0 items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[#dc2626]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-shrink-0 flex-col gap-1 px-[22px] py-4"
              style={{ background: isOk ? '#dcfce7' : rc === 1000 || rc === 7000 ? '#fef3c7' : '#fee2e2' }}>
              <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]"
                style={{ color: isOk ? '#16a34a' : rc === 1000 || rc === 7000 ? '#d97706' : '#dc2626' }}>
                {isOk ? '✓' : '✗'} {rc}
              </div>
              <div className="text-[14px] font-bold text-[#374151]">{rcDesc}</div>
              {result.message && <div className="text-[12px] text-[#6b7280]">{result.message}</div>}
            </div>
            <MSection title="Thông tin đơn hàng">
              <MRow label="Order ID"   value={result.orderId}   mono copy={() => copy(result.orderId)} />
              <MRow label="Request ID" value={result.requestId} mono copy={() => copy(result.requestId)} />
              <MRow label="Trans ID"   value={result.transId}   mono copy={() => copy(result.transId)} />
              <MRow label="Order Info" value={result.orderInfo} />
            </MSection>
            <MSection title="Kết quả thanh toán">
              <MRow label="Result Code" value={rc !== undefined
                ? <span className="font-mono font-bold" style={{ color: isOk ? '#16a34a' : '#dc2626' }}>{rc} — {rcDesc}</span>
                : null} />
              <MRow label="Số tiền"    value={result.amount !== undefined ? `${fmt(result.amount)} ₫` : null} />
              <MRow label="Hình thức"  value={result.payType   ? <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[12px] font-semibold">{result.payType}</span>   : null} />
              <MRow label="Order Type" value={result.orderType ? <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[12px] font-semibold">{result.orderType}</span> : null} />
            </MSection>
            <MSection title="Thời gian">
              <MRow label="Response Time" value={result.responseTime ? fmtMs(result.responseTime) : null} />
              <MRow label="Pay Time"      value={result.payTime      ? fmtMs(result.payTime)      : null} />
            </MSection>
            <MSection title="Raw Response">
              <div className="mb-1 max-h-[200px] overflow-y-auto rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151] whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </div>
            </MSection>
          </div>
        )}

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-[22px] py-3.5">
          <span className="text-[12px] text-[#9ca3af]"> · MoMo API v2</span>
          <ModalBtn variant="neutral" onClick={onClose}>Đóng</ModalBtn>
        </div>
      </ModalBox>
    </ModalOverlay>
  )
}

// ── CONFIRM MODAL ─────────────────────────────────────────────
function ConfirmModal({ orderId, amount, loading, result, error, onConfirm, onCancel, onClose }) {
  const rc   = result?.resultCode
  const isOk = rc === 0

  return (
    <ModalOverlay onClose={onClose}>
      <ModalBox onClick={e => e.stopPropagation()} maxW="max-w-[580px]">
        <ModalHeader label="Xác nhận / Huỷ giao dịch"
          id={`POST /v2/gateway/api/confirm · ${orderId}`} onClose={onClose} />

        <div className="flex-shrink-0 border-b border-[#f3f4f6] px-[22px] py-4">
          <div className="mb-3 text-[13px] text-[#374151]">
            Giao dịch <strong className="font-mono">{orderId}</strong> đang ở trạng thái{' '}
            <strong className="text-[#d97706]">9000 — Authorized</strong>.<br />
            Số tiền: <strong>{parseInt(amount || 0).toLocaleString('vi-VN')} ₫</strong>
          </div>
          <div className="flex gap-2">
            <button onClick={onConfirm} disabled={loading || !!result}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#16a34a] px-4 py-2.5 text-[13px] font-bold text-white transition-all hover:not-disabled:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-50">
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-anim"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              Capture (xác nhận)
            </button>
            <button onClick={onCancel} disabled={loading || !!result}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#dc2626] px-4 py-2.5 text-[13px] font-bold text-white transition-all hover:not-disabled:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50">
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-anim"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>}
              Cancel (huỷ)
            </button>
          </div>
          <div className="mt-2 text-[11px] text-[#6b7280]">Capture → chuyển tiền về ví đối tác. Cancel → hoàn tiền về người dùng.</div>
        </div>

        {error && (
          <div className="mx-[22px] my-3 flex flex-shrink-0 items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[#dc2626]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1 px-[22px] py-4" style={{ background: isOk ? '#dcfce7' : '#fee2e2' }}>
              <div className="font-mono text-[22px] font-extrabold" style={{ color: isOk ? '#16a34a' : '#dc2626' }}>
                {isOk ? '✓' : '✗'} {rc}
              </div>
              <div className="text-[14px] font-bold text-[#374151]">
                {result.requestType === 'capture' ? 'Capture' : 'Cancel'} — {getResultDesc(rc)}
              </div>
              {result.message && <div className="text-[12px] text-[#6b7280]">{result.message}</div>}
            </div>
            <MSection title="Raw Response">
              <div className="mb-1 max-h-[180px] overflow-y-auto rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151] whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </div>
            </MSection>
          </div>
        )}

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-[22px] py-3.5">
          <span className="text-[12px] text-[#9ca3af]">Chỉ áp dụng cho giao dịch resultCode = 9000</span>
          <ModalBtn variant="neutral" onClick={onClose}>Đóng</ModalBtn>
        </div>
      </ModalBox>
    </ModalOverlay>
  )
}

// ── MODAL SECTIONS & ROWS ─────────────────────────────────────
function MSection({ title, children }) {
  return (
    <div className="px-[22px]">
      <div className="border-t border-[#f3f4f6] pb-2 pt-3.5 text-[10px] font-bold uppercase tracking-[0.8px] text-[#6b7280] first:border-0">
        {title}
      </div>
      {children}
    </div>
  )
}

function MRow({ label, value, mono, copy }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 border-b border-[#f9fafb] py-2.5 last:border-0">
      <span className="min-w-[130px] flex-shrink-0 pt-px text-[12px] font-semibold text-[#6b7280]">{label}</span>
      <span className={`flex flex-1 items-center gap-1.5 break-all text-[13px] text-[#111827] ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
        {copy && value && value !== '—' && (
          <button onClick={copy} title="Copy"
            className="inline-flex flex-shrink-0 items-center rounded p-0.5 text-[#9ca3af] transition-colors hover:text-[#ae0070]">
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

function ModalBtn({ variant, onClick, children, disabled }) {
  const base = 'inline-flex items-center gap-1.5 rounded-[9px] border px-3.5 py-2 text-[13px] font-bold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    danger:  'border-[#fecaca] bg-[#fff5f5] text-[#dc2626] hover:bg-[#fee2e2] hover:border-[#dc2626]',
    indigo:  'border-[rgba(99,102,241,0.3)] bg-[#eef2ff] text-[#4f46e5] hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5]',
    green:   'border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] text-[#16a34a] hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a]',
    neutral: 'border-[rgba(174,0,112,0.1)] bg-[#f9fafb] text-[#374151] hover:bg-white',
  }
  return (
    <button className={`${base} ${variants[variant]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}