import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ─── CONSTANTS ───────────────────────────────────────────────
const REFRESH_INTERVAL = 1000
const EXPIRE_MINUTES   = 10

const STATUS_META = {
  PAID:    { label: 'Thành công', text: 'text-emerald-300', ring: 'ring-emerald-400/30', bg: 'bg-emerald-400/15', dot: 'bg-emerald-400' },
  FAILED:  { label: 'Thất bại',   text: 'text-rose-300',    ring: 'ring-rose-400/30',    bg: 'bg-rose-400/15',    dot: 'bg-rose-400' },
  PENDING: { label: 'Chờ xử lý',  text: 'text-amber-300',   ring: 'ring-amber-400/30',   bg: 'bg-amber-400/15',   dot: 'bg-amber-400' },
  EXPIRED: { label: 'Hết hạn',    text: 'text-slate-300',   ring: 'ring-slate-400/30',   bg: 'bg-slate-400/15',   dot: 'bg-slate-400' },
}

// ─── UTILS ───────────────────────────────────────────────────
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

// ─── RESULT CODE DESCRIPTIONS (MoMo docs) ────────────────────
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

  const ordersRef   = useRef([])
  const fetchingRef = useRef(false)
  const selectedRef = useRef(new Set())
  const detailRef   = useRef(null)

  useEffect(() => { ordersRef.current   = orders   }, [orders])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { detailRef.current   = detail   }, [detail])

  // ── Kiểm tra session ──────────────────────────────────────
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

  // ── DERIVED DATA ──────────────────────────────────────────
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
    <PageShell>
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-3 w-3 animate-ping rounded-full bg-fuchsia-400" />
      </div>
    </PageShell>
  )

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin · Đăng nhập</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <PageShell>
        <div className="relative z-10 flex min-h-screen items-center justify-center p-5">
          <div className="w-full max-w-[400px] rounded-3xl border border-white/15 bg-white/[0.07] p-9 text-center shadow-[0_24px_70px_-20px_rgba(214,36,159,0.45)] backdrop-blur-2xl">
            <div className="mx-auto mb-5 flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg">
              <img src="/Main.png" alt="Logo" className="h-11 w-11 object-contain" />
            </div>
            <h1 className="font-display text-[22px] font-extrabold tracking-tight text-white">Quản trị viên</h1>
            <p className="mb-7 mt-1.5 text-[13px] text-fuchsia-100/60">Hệ thống quản lý giao dịch MoMo</p>
            <div>
              <input
                type="password" placeholder="Mật khẩu quản trị"
                value={password} autoFocus
                onChange={e => { setPassword(e.target.value); setPwError(false) }}
                onKeyDown={e => e.key === 'Enter' && login()}
                className={`mb-3 w-full rounded-xl border bg-white/5 px-4 py-3.5 text-[15px] text-white placeholder:text-fuchsia-100/30 outline-none transition focus:bg-white/10 focus:ring-4 ${
                  pwError ? 'border-rose-400/60 focus:ring-rose-400/15' : 'border-white/15 focus:border-fuchsia-400/50 focus:ring-fuchsia-400/15'
                }`}
              />
            </div>
            {pwError && <p className="mb-3.5 text-[13px] font-semibold text-rose-300">⚠ Mật khẩu không chính xác</p>}
            <button
              onClick={login}
              className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_24px_-6px_rgba(214,36,159,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(214,36,159,0.7)]"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </PageShell>
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
      <PageShell>
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

        <div className="relative z-10 min-h-screen">
          {/* ── HEADER ── */}
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#1a0b2e]/60 backdrop-blur-xl">
            <div className="mx-auto flex h-[60px] max-w-[1400px] flex-wrap items-center gap-3 px-5">
              <div className="flex items-center gap-2.5">
                <img src="/Main.png" alt="" className="h-7 w-7 rounded-lg object-contain" />
                <span className="font-display text-[15px] font-bold text-white">MoMo Admin</span>
                <span
                  title={lastSync ? `Sync: ${fmtDate(lastSync)}` : 'Chưa sync'}
                  className={`h-2 w-2 rounded-full ${fetching ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`}
                />
              </div>

              <nav className="order-3 flex w-full gap-1.5 overflow-x-auto pb-0.5 sm:order-none sm:w-auto">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                      filter === f.key
                        ? 'bg-gradient-to-r from-fuchsia-500/80 to-pink-600/80 text-white shadow-md ring-1 ring-white/20'
                        : 'text-fuchsia-100/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {f.label}
                    <span className={`rounded-full px-1.5 text-[11px] ${filter === f.key ? 'bg-white/25' : 'bg-white/10'}`}>
                      {counts[f.key]}
                    </span>
                  </button>
                ))}
              </nav>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-fuchsia-200/50"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    type="text" placeholder="Tìm kiếm..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="w-[150px] bg-transparent text-[13px] text-white placeholder:text-fuchsia-100/30 outline-none focus:w-[180px] transition-[width]"
                  />
                  {search && <button onClick={() => setSearch('')} className="text-fuchsia-200/50 hover:text-white">✕</button>}
                </div>

                {selected.size > 0 && (
                  <button
                    onClick={() => doDelete([...selected])}
                    className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 text-[13px] font-bold text-rose-200 transition hover:bg-rose-500/30"
                  >
                    🗑 Xóa ({selected.size})
                  </button>
                )}

                {/* ── QUERY BUTTON ── */}
                <button
                  onClick={() => { setQueryOrderId(''); setQueryResult(null); setQueryError(null); setQueryModal(true) }}
                  title="Tra cứu trạng thái giao dịch MoMo"
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-[13px] font-bold text-indigo-200 transition hover:bg-indigo-500/30"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
                  </svg>
                  Tra cứu MoMo
                </button>

                <button
                  onClick={() => router.push('/admin/scan')}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-white/15"
                >
                  📷 Scan QR
                </button>
                <button
                  onClick={() => fetchOrders({ force: true })} disabled={fetching}
                  className="flex h-[32px] w-[32px] items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fetching ? 'animate-spin' : ''}>
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M8 16H3v5"/>
                  </svg>
                </button>
                <button
                  onClick={() => { fetch('/api/admin/session', { method: 'DELETE' }).finally(() => setAuthed(false)) }}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-fuchsia-100/60 transition hover:text-white"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          </header>

          {/* ── MAIN ── */}
          <main className="mx-auto max-w-[1400px] p-5">
            {/* STAT CARDS */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Doanh thu"   value={`${fmt(totalRevenue)} ₫`} accent="text-fuchsia-300"  sub={`${counts.PAID} giao dịch thành công`} />
              <StatCard label="Thành công"  value={`${counts.PAID} GD`}      accent="text-emerald-300"  sub={`${counts.PAID ? Math.round(counts.PAID / counts.ALL * 100) : 0}% tỉ lệ thành công`} />
              <StatCard label="Thất bại"    value={`${counts.FAILED} GD`}    accent="text-rose-300"     sub={`${counts.EXPIRED} đơn hết hạn`} />
              <StatCard label="Tổng đơn"    value={`${counts.ALL} GD`}       accent="text-white"        sub={`${counts.PENDING} đang chờ xử lý`} />
            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.05] backdrop-blur-xl">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-20 text-center">
                  <div className="text-3xl opacity-60">🔍</div>
                  <div className="text-[14px] text-fuchsia-100/50">Không tìm thấy giao dịch nào</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-fuchsia-100/45">
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.size > 0 && selected.size === filtered.length}
                            ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)}
                            onChange={toggleAll}
                            className="accent-fuchsia-500"
                          />
                        </th>
                        <th className="px-3 py-3">Trạng thái</th>
                        <th className="px-3 py-3">Số tiền</th>
                        <th className="px-3 py-3">Nội dung</th>
                        <th className="px-3 py-3">Mã đơn</th>
                        <th className="px-3 py-3">Mã GD MoMo</th>
                        <th className="px-3 py-3">Hình thức</th>
                        <th className="px-3 py-3">Result</th>
                        <th className="px-3 py-3">Tạo lúc</th>
                        <th className="px-3 py-3">Hoàn tất</th>
                        <th className="px-3 py-3 text-center">Thao tác</th>
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
                            className={`cursor-pointer border-b border-white/5 transition hover:bg-white/[0.06] ${sel ? 'bg-fuchsia-500/10' : ''}`}
                          >
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={sel} onChange={() => toggleOne(o.orderId)} className="accent-fuchsia-500" />
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${sm.bg} ${sm.text} ring-1 ${sm.ring}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
                                {sm.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-bold text-white">{fmt(o.amount)} ₫</td>
                            <td className="max-w-[180px] truncate px-3 py-3 text-fuchsia-100/70" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                            <td className="px-3 py-3 font-mono text-[12px] text-fuchsia-100/60">{o.orderId}</td>
                            <td className="px-3 py-3 font-mono text-[12px] text-fuchsia-100/60">{o.transId || '—'}</td>
                            <td className="px-3 py-3">
                              {o.payType
                                ? <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-fuchsia-100/70">{o.payType}</span>
                                : <span className="text-fuchsia-100/30">—</span>}
                            </td>
                            <td className="px-3 py-3 font-mono text-[12px]">
                              {o.resultCode !== undefined
                                ? <span className={o.resultCode === 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                    {o.resultCode === 0 ? '✓ 0' : `✗ ${o.resultCode}`}
                                  </span>
                                : <span className="text-fuchsia-100/30">—</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-fuchsia-100/50">{fmtDate(o.createdAt)}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-fuchsia-100/50">{o.paidAt ? fmtDate(o.paidAt) : <span className="text-fuchsia-100/30">—</span>}</td>
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-center gap-1.5">
                                {/* Tra cứu MoMo */}
                                <button
                                  onClick={() => openQueryForOrder(o.orderId)}
                                  title="Tra cứu MoMo API"
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-indigo-400/30 bg-indigo-500/15 text-indigo-200 transition hover:bg-indigo-500/40"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
                                  </svg>
                                </button>
                                {/* Xóa */}
                                <button
                                  onClick={() => doDelete([o.orderId])}
                                  title="Xóa"
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-400/30 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/40"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                                    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                  </svg>
                                </button>
                                {/* Confirm — chỉ hiện khi resultCode 9000 */}
                                {o.resultCode === 9000 && (
                                  <button
                                    onClick={() => openConfirmForOrder(o.orderId, o.amount)}
                                    title="Xác nhận / Huỷ giao dịch (9000)"
                                    className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 transition hover:bg-emerald-500/40"
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

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-[12px] text-fuchsia-100/45">
                <span>
                  {filtered.length} giao dịch
                  {filter !== 'ALL' && ` · lọc theo "${FILTERS.find(f => f.key === filter)?.label}"`}
                  {search && ` · tìm "${search}"`}
                </span>
                {lastSync && (
                  <span>
                    Cập nhật lúc {lastSync.toLocaleTimeString('vi-VN')}
                    {fetching && ' · đang tải...'}
                  </span>
                )}
              </div>
            </div>
          </main>
        </div>
      </PageShell>
    </>
  )
}

// ─── PAGE SHELL (background + glow orbs) ──────────────────────
function PageShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#150821] font-sans text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Sora', sans-serif; }
        @keyframes drift { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-40px) scale(1.08)} }
        @keyframes modalIn { from{transform:translateY(14px);opacity:0} to{transform:none;opacity:1} }
        .animate-modal { animation: modalIn .18s ease both; }
      `}</style>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-fuchsia-600/30 blur-[110px]" style={{ animation: 'drift 16s ease-in-out infinite' }} />
        <div className="absolute right-[-10%] top-1/4 h-[380px] w-[380px] rounded-full bg-violet-600/25 blur-[110px]" style={{ animation: 'drift 20s ease-in-out infinite reverse' }} />
        <div className="absolute bottom-[-15%] left-1/3 h-[440px] w-[440px] rounded-full bg-pink-500/20 blur-[120px]" style={{ animation: 'drift 24s ease-in-out infinite' }} />
        <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-indigo-500/20 blur-[100px]" style={{ animation: 'drift 18s ease-in-out infinite reverse' }} />
      </div>
      {children}
    </div>
  )
}

// ─── SUB COMPONENTS ──────────────────────────────────────────

function StatCard({ label, value, accent, sub }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 backdrop-blur-xl transition hover:border-white/20 sm:p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-100/45">{label}</div>
      <div className={`mt-1 font-display text-[22px] font-extrabold tracking-tight sm:text-[26px] ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-fuchsia-100/40">{sub}</div>}
    </div>
  )
}

function ModalShell({ children, wide, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`animate-modal flex max-h-[88vh] w-full flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#1d0e2e]/95 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl ${wide ? 'max-w-[580px]' : 'max-w-[520px]'}`}
      >
        {children}
      </div>
    </div>
  )
}

function DetailModal({ order, onClose, onDelete, onQuery, onConfirm }) {
  const sm    = STATUS_META[order.status] || STATUS_META.PENDING
  const extra = decodeExtra(order.extraData)
  const copy  = text => navigator.clipboard?.writeText(text)

  return (
    <ModalShell onClose={onClose}>
      <div className="flex flex-shrink-0 items-start justify-between border-b border-white/10 px-6 py-5">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuchsia-100/40">Chi tiết giao dịch</div>
          <div className="font-mono text-[13px] text-fuchsia-100/80">{order.orderId}</div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-fuchsia-100/70 transition hover:bg-rose-500/30 hover:text-white">✕</button>
      </div>

      <div className={`flex flex-shrink-0 flex-col gap-2 px-6 py-5 ${sm.bg}`}>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold ${sm.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
          {sm.label}
        </span>
        <div className={`font-display text-[28px] font-extrabold tracking-tight ${sm.text}`}>{fmt(order.amount)} ₫</div>
        <div className="text-[13px] font-medium text-fuchsia-100/70">{order.orderInfo || '—'}</div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        <Section title="Thông tin giao dịch">
          <Row label="Mã đơn"     value={order.orderId}   mono copy={() => copy(order.orderId)} />
          <Row label="Request ID" value={order.requestId} mono copy={() => copy(order.requestId)} />
          <Row label="Mã GD MoMo" value={order.transId}   mono copy={() => copy(order.transId)} />
        </Section>

        <Section title="Kết quả">
          <Row label="Result Code" value={
            order.resultCode !== undefined
              ? <span className={`font-mono font-bold ${order.resultCode === 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {order.resultCode === 0
                    ? `✓ ${order.resultCode} — Thành công`
                    : `✗ ${order.resultCode} — ${getResultDesc(order.resultCode)}`}
                </span>
              : null
          } />
          <Row label="Message"   value={order.message} />
          <Row label="Loại đơn" value={order.orderType} />
          <Row label="Hình thức" value={order.payType ? <Chip>{order.payType}</Chip> : null} />
          <Row label="Nguồn"     value={order.source  ? <Chip>{order.source}</Chip>  : null} />
        </Section>

        <Section title="Thời gian">
          <Row label="Tạo lúc"       value={fmtDate(order.createdAt)} />
          <Row label="MoMo phản hồi" value={fmtMs(order.responseTime)} />
          <Row label="Hoàn tất lúc"  value={fmtDate(order.paidAt)} />
        </Section>

        {order.extraData && (
          <Section title="Extra Data">
            <pre className="mx-6 mb-1 whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11.5px] text-fuchsia-100/70">
              {typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra}
            </pre>
          </Section>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center justify-between border-t border-white/10 px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { onClose(); onDelete(order.orderId) }} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-[13px] font-bold text-rose-200 transition hover:bg-rose-500/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Xóa giao dịch
          </button>
          <button onClick={() => onQuery(order.orderId)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-2 text-[13px] font-bold text-indigo-200 transition hover:bg-indigo-500/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
            </svg>
            Tra cứu MoMo
          </button>
          {order.resultCode === 9000 && (
            <button onClick={() => { onClose(); onConfirm(order.orderId, order.amount) }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-[13px] font-bold text-emerald-200 transition hover:bg-emerald-500/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Xác nhận (9000)
            </button>
          )}
        </div>
        <button onClick={onClose} className="rounded-lg border border-white/15 bg-white/5 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15">Đóng</button>
      </div>
    </ModalShell>
  )
}

// ─── QUERY MODAL (MoMo API) ───────────────────────────────────
function QueryModal({ orderId, setOrderId, loading, result, error, onQuery, onClose }) {
  const copy = text => navigator.clipboard?.writeText(String(text))

  const rc     = result?.resultCode
  const isOk   = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null
  const heroBg = isOk ? 'bg-emerald-400/15' : (rc === 1000 || rc === 7000) ? 'bg-amber-400/15' : 'bg-rose-400/15'
  const heroText = isOk ? 'text-emerald-300' : (rc === 1000 || rc === 7000) ? 'text-amber-300' : 'text-rose-300'

  return (
    <ModalShell wide onClose={onClose}>
      <div className="flex flex-shrink-0 items-start justify-between border-b border-white/10 px-6 py-5">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuchsia-100/40">Tra cứu giao dịch MoMo</div>
          <div className="text-[12px] text-fuchsia-100/50">POST /v2/gateway/api/query</div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-fuchsia-100/70 transition hover:bg-rose-500/30 hover:text-white">✕</button>
      </div>

      <div className="flex-shrink-0 border-b border-white/10 px-6 py-4">
        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-fuchsia-100/40">Order ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nhập mã đơn hàng (orderId)..."
            value={orderId}
            onChange={e => setOrderId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && onQuery()}
            autoFocus
            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 font-mono text-[14px] text-white outline-none transition focus:border-indigo-400/60 focus:bg-white/10 focus:ring-4 focus:ring-indigo-400/15"
          />
          <button
            onClick={onQuery} disabled={loading || !orderId.trim()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-500 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-600 disabled:opacity-40"
          >
            {loading
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            }
            {loading ? 'Đang tra cứu...' : 'Tra cứu'}
          </button>
        </div>
        <div className="mt-1.5 text-[11px] text-fuchsia-100/40">API sẽ gọi trực tiếp đến MoMo server để lấy trạng thái thực tế.</div>
      </div>

      {error && (
        <div className="mx-6 mt-3 flex flex-shrink-0 items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-rose-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          {error}
        </div>
      )}

      {result && (
        <div className="flex-1 overflow-y-auto">
          <div className={`flex flex-col gap-1 px-6 py-4 ${heroBg}`}>
            <div className={`font-mono text-[22px] font-extrabold tracking-tight ${heroText}`}>{isOk ? '✓' : '✗'} {rc}</div>
            <div className="text-[14px] font-bold text-fuchsia-50">{rcDesc}</div>
            {result.message && <div className="text-[12px] text-fuchsia-100/50">{result.message}</div>}
          </div>

          <Section title="Thông tin đơn hàng">
            <Row label="Order ID"    value={result.orderId}    mono copy={() => copy(result.orderId)} />
            <Row label="Request ID"  value={result.requestId}  mono copy={() => copy(result.requestId)} />
            <Row label="Trans ID"    value={result.transId}    mono copy={() => copy(result.transId)} />
            <Row label="Order Info"  value={result.orderInfo} />
          </Section>

          <Section title="Kết quả thanh toán">
            <Row label="Result Code" value={
              rc !== undefined
                ? <span className={`font-mono font-bold ${isOk ? 'text-emerald-300' : 'text-rose-300'}`}>{rc} — {rcDesc}</span>
                : null
            } />
            <Row label="Số tiền"     value={result.amount !== undefined ? `${fmt(result.amount)} ₫` : null} />
            <Row label="Hình thức"   value={result.payType   ? <Chip>{result.payType}</Chip>   : null} />
            <Row label="Order Type"  value={result.orderType ? <Chip>{result.orderType}</Chip> : null} />
          </Section>

          <Section title="Thời gian">
            <Row label="Response Time" value={result.responseTime ? fmtMs(result.responseTime) : null} />
            <Row label="Pay Time"      value={result.payTime      ? fmtMs(result.payTime)      : null} />
          </Section>

          <Section title="Raw Response">
            <pre className="mx-6 mb-1 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11.5px] text-fuchsia-100/70">
              {JSON.stringify(result, null, 2)}
            </pre>
          </Section>
        </div>
      )}

      <div className="flex flex-shrink-0 items-center justify-between border-t border-white/10 px-6 py-4">
        <div className="text-[12px] text-fuchsia-100/40">Timeout tối thiểu: <strong className="text-fuchsia-100/60">30s</strong> · MoMo API v2</div>
        <button onClick={onClose} className="rounded-lg border border-white/15 bg-white/5 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15">Đóng</button>
      </div>
    </ModalShell>
  )
}

function ConfirmModal({ orderId, amount, loading, result, error, onConfirm, onCancel, onClose }) {
  const rc   = result?.resultCode
  const isOk = rc === 0

  return (
    <ModalShell wide onClose={onClose}>
      <div className="flex flex-shrink-0 items-start justify-between border-b border-white/10 px-6 py-5">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuchsia-100/40">Xác nhận / Huỷ giao dịch</div>
          <div className="text-[12px] text-fuchsia-100/50">POST /v2/gateway/api/confirm · {orderId}</div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-fuchsia-100/70 transition hover:bg-rose-500/30 hover:text-white">✕</button>
      </div>

      <div className="flex-shrink-0 border-b border-white/10 px-6 py-4">
        <div className="mb-3 text-[13px] text-fuchsia-100/70">
          Giao dịch <strong className="font-mono text-white">{orderId}</strong> đang ở trạng thái <strong className="text-amber-300">9000 — Authorized</strong>.
          <br />Số tiền: <strong className="text-white">{parseInt(amount || 0).toLocaleString('vi-VN')} ₫</strong>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm} disabled={loading || !!result}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {loading
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            }
            Capture (xác nhận)
          </button>
          <button
            onClick={onCancel} disabled={loading || !!result}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
          >
            {loading
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M3 12a9 9 0 0 1 9-9"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            }
            Cancel (huỷ)
          </button>
        </div>
        <div className="mt-1.5 text-[11px] text-fuchsia-100/40">Capture → chuyển tiền về ví đối tác. Cancel → hoàn tiền về người dùng.</div>
      </div>

      {error && (
        <div className="mx-6 mt-3 flex flex-shrink-0 items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-rose-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          {error}
        </div>
      )}

      {result && (
        <div className="flex-1 overflow-y-auto">
          <div className={`flex flex-col gap-1 px-6 py-4 ${isOk ? 'bg-emerald-400/15' : 'bg-rose-400/15'}`}>
            <div className={`font-mono text-[22px] font-extrabold tracking-tight ${isOk ? 'text-emerald-300' : 'text-rose-300'}`}>{isOk ? '✓' : '✗'} {rc}</div>
            <div className="text-[14px] font-bold text-fuchsia-50">
              {result.requestType === 'capture' ? 'Capture' : 'Cancel'} — {getResultDesc(rc)}
            </div>
            {result.message && <div className="text-[12px] text-fuchsia-100/50">{result.message}</div>}
          </div>
          <Section title="Raw Response">
            <pre className="mx-6 mb-1 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11.5px] text-fuchsia-100/70">
              {JSON.stringify(result, null, 2)}
            </pre>
          </Section>
        </div>
      )}

      <div className="flex flex-shrink-0 items-center justify-between border-t border-white/10 px-6 py-4">
        <div className="text-[12px] text-fuchsia-100/40">Chỉ áp dụng cho giao dịch resultCode = 9000</div>
        <button onClick={onClose} className="rounded-lg border border-white/15 bg-white/5 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15">Đóng</button>
      </div>
    </ModalShell>
  )
}

function Chip({ children }) {
  return <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-fuchsia-100/70">{children}</span>
}

function Section({ title, children }) {
  return (
    <div className="border-t border-white/10 px-6 py-3 first:border-t-0">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100/35">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, mono, copy }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 border-b border-white/5 py-2 last:border-b-0">
      <span className="min-w-[120px] flex-shrink-0 pt-0.5 text-[12px] font-semibold text-fuchsia-100/40">{label}</span>
      <span className={`flex flex-1 items-center gap-1.5 break-all text-[13px] text-fuchsia-50 ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
        {copy && value && value !== '—' && (
          <button onClick={copy} title="Copy" className="flex-shrink-0 rounded p-0.5 text-fuchsia-100/40 transition hover:text-fuchsia-200">
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