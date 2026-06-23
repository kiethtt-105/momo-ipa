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

const FILTERS = [
  { key: 'ALL',     label: 'Tất cả'     },
  { key: 'PAID',    label: 'Thành công' },
  { key: 'PENDING', label: 'Chờ xử lý'  },
  { key: 'FAILED',  label: 'Thất bại'   },
  { key: 'EXPIRED', label: 'Hết hạn'    },
]

const NAV_ITEMS = [
  { key: 'history', label: 'Lịch sử giao dịch', sub: 'Toàn bộ đơn hàng',     icon: IconHistory },
  { key: 'create',  label: 'Tạo giao dịch',      sub: 'P2P / Scan',          icon: IconPlus    },
  { key: 'lookup',  label: 'Tra cứu giao dịch',  sub: 'Theo mã đơn MoMo',    icon: IconSearch  },
]

// ─── MỞ TRANG "TẠO GIAO DỊCH" Ở CỬA SỔ RIÊNG (tuỳ chọn, ngoài iframe) ──
function openCreateTransactionPopup() {
  const w = 460
  const h = 780
  const left = Math.max(0, (window.screen.width  - w) / 2)
  const top  = Math.max(0, (window.screen.height - h) / 2)
  const win = window.open(
    '/admin/create-transaction',
    'momo_ctx',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no`
  )
  win?.focus()
}

// ─── UTILS ─────────────────────────────────────────────────
const fmt      = n  => parseInt(n || 0).toLocaleString('vi-VN')
const fmtDate  = s  => s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '—'
const fmtMs    = ms => ms ? new Date(parseInt(ms)).toLocaleString('vi-VN', { hour12: false }) : '—'
const decodeExtra = b64 => {
  if (!b64) return null
  try { return JSON.parse(atob(b64)) } catch { return b64 }
}

const toDayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const DATE_PRESETS = [
  { key: 'yesterday', label: 'Hôm qua', range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toDayStr(d); return [s, s] } },
  { key: 'today',     label: 'Hôm nay', range: () => { const s = toDayStr(new Date()); return [s, s] } },
  { key: 'thisWeek',  label: 'Tuần này', range: () => {
      const now = new Date()
      const day = now.getDay() === 0 ? 7 : now.getDay()
      const start = new Date(now)
      start.setDate(now.getDate() - day + 1)
      return [toDayStr(start), toDayStr(now)]
    } },
  { key: 'thisMonth', label: 'Tháng này', range: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return [toDayStr(start), toDayStr(now)]
    } },
]

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
const getResultDesc = code => RESULT_CODE_MAP[code] !== undefined ? RESULT_CODE_MAP[code] : `Mã lỗi không xác định`

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function AdminDashboardPage() {
  const router = useRouter()

  const [authed,          setAuthed]          = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password,        setPassword]        = useState('')
  const [pwError,         setPwError]         = useState(false)

  const [activeSection,   setActiveSection]   = useState('history')
  const [sidebarOpen,     setSidebarOpen]     = useState(false)     

  const [orders,          setOrders]          = useState([])
  const [fetching,        setFetching]        = useState(false)
  const [lastSync,        setLastSync]        = useState(null)
  const [filter,          setFilter]          = useState('ALL')
  const [search,          setSearch]          = useState('')
  const [dateFrom,        setDateFrom]        = useState(() => DATE_PRESETS.find(p => p.key === 'thisWeek').range()[0])
  const [dateTo,          setDateTo]          = useState(() => DATE_PRESETS.find(p => p.key === 'thisWeek').range()[1])
  const [activePresetKey, setActivePresetKey] = useState('thisWeek') 
  const [sortKey,         setSortKey]         = useState('createdAt')
  const [sortDir,         setSortDir]         = useState('desc')
  const [selected,        setSelected]        = useState(new Set())
  const [detail,          setDetail]          = useState(null)

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
      console.error('[AdminDashboard] fetch error:', err)
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

  // ── ESC đóng modal / drawer ────────────────────────────────
  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') {
        setDetail(null)
        setConfirmModal(false)
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // Đóng drawer mobile mỗi khi đổi mục trong sidebar
  const goToSection = (key) => {
    setActiveSection(key)
    setSidebarOpen(false)
  }

  // ── MOMO QUERY API — dùng cho trang "Tra cứu giao dịch" ────
  const doMomoQuery = async (idArg) => {
    const id = (idArg ?? queryOrderId).trim()
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

  // Mở trang "Tra cứu giao dịch" với orderId đã điền sẵn, tiện cho việc xem chi tiết và thao tác tiếp
  const openQueryForOrder = (orderId) => {
    setQueryOrderId(orderId)
    setQueryResult(null)
    setQueryError(null)
    goToSection('lookup')
    doMomoQuery(orderId)
  }

  // Mở confirm modal cho đơn có resultCode 9000, với tuỳ chọn capture hoặc cancel
  const openConfirmForOrder = (orderId, amount) => {
    setConfirmOrderId(orderId)
    setConfirmAmount(amount)
    setConfirmResult(null)
    setConfirmError(null)
    setConfirmModal(true)
  }

  // Gọi API confirm của MoMo, với requestType là 'capture' hoặc 'cancel' tuỳ theo hành động người dùng chọn
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

  // ── XỬ LÝ DỮ LIỆU HIỂN THỊ ─────────────────────────────────
  const displayed = orders.map(normalizeStatus)

  // Tính toán số lượng theo từng trạng thái, để hiển thị ở sidebar và thống kê
  const counts = {
    ALL:     displayed.length,
    PAID:    displayed.filter(o => o.status === 'PAID').length,
    FAILED:  displayed.filter(o => o.status === 'FAILED').length,
    PENDING: displayed.filter(o => o.status === 'PENDING').length,
    EXPIRED: displayed.filter(o => o.status === 'EXPIRED').length,
  }

  // Tính tổng doanh thu từ các đơn đã thanh toán, để hiển thị ở thống kê
  const totalRevenue = displayed
    .filter(o => o.status === 'PAID')
    .reduce((s, o) => s + parseInt(o.amount || 0), 0)

  // Áp dụng các bộ lọc: trạng thái, tìm kiếm, khoảng ngày, rồi sắp xếp theo cột được chọn
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
    .filter(o => {
      if (!dateFrom && !dateTo) return true
      if (!o.createdAt) return false
      const d = new Date(o.createdAt)
      const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (dateFrom && dayStr < dateFrom) return false
      if (dateTo && dayStr > dateTo) return false
      return true
    })
    .sort((a, b) => {
      let av = a[sortKey]
      let bv = b[sortKey]
      if (sortKey === 'createdAt' || sortKey === 'paidAt') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      } else if (sortKey === 'amount') {
        av = parseInt(av || 0)
        bv = parseInt(bv || 0)
      } else {
        av = (av ?? '').toString().toLowerCase()
        bv = (bv ?? '').toString().toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  // Tìm đơn đang xem chi tiết, để truyền vào DetailModal
  const detailOrder = detail ? displayed.find(o => o.orderId === detail) : null

  // Hàm toggle chọn 1 đơn hoặc chọn tất cả, dùng cho checkbox ở HistorySection
  const toggleOne = id => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  // Nếu đã chọn tất cả thì bỏ chọn hết, còn nếu chưa chọn tất cả thì chọn tất cả (trong phạm vi đang hiển thị sau khi đã lọc)
  const toggleAll = () =>
    selected.size === filtered.length
      ? setSelected(new Set())
      : setSelected(new Set(filtered.map(o => o.orderId)))

  // Hàm toggle sắp xếp: nếu đã đang sắp xếp theo cột đó thì đổi chiều, còn nếu chưa thì bắt đầu sắp xếp theo cột đó với chiều mặc định là giảm dần
  const toggleSort = key => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Hàm xoá đơn, gọi API xoá cho từng đơn được chọn. 
  // Nếu đơn đang xem chi tiết nằm trong số đó thì cũng đóng modal chi tiết luôn
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

  // Hàm đăng nhập, gọi API đăng nhập với mật khẩu đã nhập. 
  // Nếu thành công thì chuyển sang trạng thái đã xác thực, còn nếu thất bại thì hiện lỗi
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

  // Hàm đăng xuất, gọi API xoá session. 
  // Dù thành công hay thất bại thì cũng chuyển sang trạng thái chưa xác thực
  function logout() {
    if (!confirm('Đăng xuất khỏi trang quản trị?')) return
    fetch('/api/admin/session', { method: 'DELETE' }).finally(() => setAuthed(false))
  }

  // ── ĐANG KIỂM TRA SESSION ─────────────────────────────────
  if (checkingSession) return (
    <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[var(--admin-font)] flex items-center justify-center">
      <Orbs />
      <div className="relative z-10 h-2 w-2 rounded-full bg-[#f59e0b]" style={{ animation: 'pulse-dot 0.8s infinite' }} />
    </div>
  )

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin · Đăng nhập</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Admin.png" />
      </Head>
      <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[var(--admin-font)]">
        <Orbs />
        <div className="relative z-10 flex min-h-screen items-center justify-center p-5">
          <div className="w-full max-w-[400px] rounded-3xl bg-white/95 px-9 py-10 text-center shadow-[0_24px_60px_rgba(174,0,112,0.1),0_0_0_1px_rgba(255,255,255,0.8)] backdrop-blur-[30px]">
            <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-[rgba(174,0,112,0.1)] bg-white shadow-[0_4px_12px_rgba(174,0,112,0.08)]">
              <img src="/Main.png" alt="Logo" className="h-11 w-11 object-contain" />
            </div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-[var(--admin-text)]">Quản trị Giao dịch</h1>
            <div className="text-left">
              <input
                type="password"
                value={password} autoFocus
                onChange={e => { setPassword(e.target.value); setPwError(false) }}
                onKeyDown={e => e.key === 'Enter' && login()}
                className={`mb-3 w-full rounded-xl border-[1.5px] bg-[rgba(245,237,242,0.5)] px-4 py-[13px] font-[var(--admin-font)] text-[15px] text-[var(--admin-text)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(174,0,112,0.07)] ${
                  pwError ? 'border-[var(--admin-danger)] bg-[#fff5f5]' : 'border-[rgba(174,0,112,0.15)]'
                }`}
              />
            </div>
            {pwError && <p className="mb-[14px] text-[13px] font-semibold text-[var(--admin-danger)]">⚠ Mật khẩu không chính xác</p>}
            <button
              className="w-full rounded-xl bg-[var(--mm)] py-[13px] font-[var(--admin-font)] text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-px hover:bg-[#91005d] hover:shadow-[0_8px_24px_rgba(174,0,112,0.25)]"
              onClick={login}
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // Tìm đơn đang xem chi tiết, để truyền vào DetailModal
  const currentNav = NAV_ITEMS.find(n => n.key === activeSection)

  // ── MAIN DASHBOARD ───────────────────────────────────────
  return (
    <>
      <Head>
        <title>ADMIN · {currentNav?.label || 'Dashboard'}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[var(--admin-font)] text-[var(--admin-text)]">
        <Orbs />

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

        {/* ── MOBILE SIDEBAR OVERLAY ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[250] bg-[rgba(17,7,13,0.45)] backdrop-blur-[2px] lg:hidden"
            style={{ animation: 'fadein 0.15s ease' }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="relative z-[1] flex min-h-screen">
          {/* ── SIDEBAR ── cố định trên desktop (lg+), trượt ẩn/hiện trên mobile */}
          <aside
            className={`fixed inset-y-0 left-0 z-[260] flex w-[252px] max-w-[80vw] flex-shrink-0 flex-col border-r border-[var(--border)] bg-white/95 shadow-[4px_0_24px_rgba(174,0,112,0.06)] backdrop-blur-[20px] transition-transform duration-300 ease-out lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {/* Logo + close (mobile) */}
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-[9px]">
                <img src="/Main.png" alt="" className="h-[30px] w-[30px] rounded-lg object-contain" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[15px] font-extrabold tracking-[-0.3px] text-[var(--mm)]">MoMo Admin</span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--admin-muted)]">
                    <span
                      className={`h-[6px] w-[6px] flex-shrink-0 rounded-full transition-colors duration-300 ${fetching ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`}
                      style={fetching ? { animation: 'pulse-dot 0.8s infinite' } : undefined}
                    />
                    {lastSync ? `Sync ${lastSync.toLocaleTimeString('vi-VN')}` : 'Đang kết nối…'}
                  </span>
                </div>
              </div>
              <button
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--admin-muted)] transition-all hover:bg-[#f3f4f6] lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--admin-muted)]">Quản lý giao dịch</div>
              <div className="flex flex-col gap-1">
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon
                  const active = activeSection === item.key
                  return (
                    <button
                      key={item.key}
                      className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all ${
                        active
                          ? 'bg-[var(--mm)] text-white shadow-[0_4px_14px_rgba(174,0,112,0.25)]'
                          : 'text-[var(--admin-text)] hover:bg-[var(--mm-light)] hover:text-[var(--mm)]'
                      }`}
                      onClick={() => goToSection(item.key)}
                    >
                      <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-white' : 'text-[var(--mm)]'}`} />
                      <span className="flex flex-col leading-tight">
                        <span className="text-[13.5px] font-bold">{item.label}</span>
                        <span className={`text-[11px] font-medium ${active ? 'text-white/75' : 'text-[var(--admin-muted)]'}`}>{item.sub}</span>
                      </span>
                      {item.key === 'history' && counts.PENDING > 0 && (
                        <span className={`ml-auto flex-shrink-0 rounded-full px-[7px] py-[1px] text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-[#fef3c7] text-[#d97706]'}`}>
                          {counts.PENDING}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </nav>

            {/* Logout — neo cố định dưới cùng sidebar */}
            <div className="flex-shrink-0 border-t border-[var(--border)] px-3 py-4">
              <button
                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[var(--admin-muted)] transition-all hover:bg-[#fee2e2] hover:text-[var(--admin-danger)]"
                onClick={logout}
              >
                <IconLogout className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="text-[13.5px] font-bold">Đăng xuất</span>
              </button>
            </div>
          </aside>

          {/* ── NỘI DUNG CHÍNH ── */}
          <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[252px]">
            {/* Top bar mobile — chỉ hiện khi sidebar ẩn (< lg) */}
            <header className="sticky inset-x-0 top-0 z-[200] flex flex-shrink-0 items-center gap-3 border-b border-[var(--border)] bg-white/88 px-4 py-3 shadow-[0_1px_16px_rgba(174,0,112,0.06)] backdrop-blur-[20px] lg:hidden">
              <button
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--mm)] transition-all hover:bg-[var(--mm-light)]"
                onClick={() => setSidebarOpen(true)}
              >
                <IconMenu className="h-5 w-5" />
              </button>
              <span className="truncate text-[15px] font-extrabold text-[var(--admin-text)]">{currentNav?.label}</span>
              <span
                className={`ml-auto h-2 w-2 flex-shrink-0 rounded-full transition-colors duration-300 ${fetching ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`}
                style={fetching ? { animation: 'pulse-dot 0.8s infinite' } : undefined}
              />
            </header>

            <main className="mx-auto w-full max-w-[1500px] flex-1 p-6 max-md:p-3.5">
              {activeSection === 'history' && (
                <HistorySection
                  counts={counts} totalRevenue={totalRevenue}
                  filter={filter} setFilter={setFilter}
                  search={search} setSearch={setSearch}
                  dateFrom={dateFrom} setDateFrom={setDateFrom}
                  dateTo={dateTo} setDateTo={setDateTo}
                  activePresetKey={activePresetKey} setActivePresetKey={setActivePresetKey}
                  filtered={filtered}
                  selected={selected} toggleOne={toggleOne} toggleAll={toggleAll}
                  sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                  setDetail={setDetail}
                  openQueryForOrder={openQueryForOrder}
                  openConfirmForOrder={openConfirmForOrder}
                  doDelete={doDelete}
                />
              )}

              {activeSection === 'create' && <CreateSection />}

              {activeSection === 'lookup' && (
                <LookupSection
                  orderId={queryOrderId}
                  setOrderId={setQueryOrderId}
                  loading={queryLoading}
                  result={queryResult}
                  error={queryError}
                  onQuery={() => doMomoQuery()}
                />
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  )
}

// COMPONENT: HISTORY SECTION 
// Phần hiển thị danh sách đơn hàng, với các bộ lọc, tìm kiếm, sắp xếp, thao tác nhanh trên từng đơn hoặc hàng loạt
function HistorySection({
  counts, totalRevenue, filter, setFilter, search, setSearch,
  dateFrom, setDateFrom, dateTo, setDateTo,
  activePresetKey, setActivePresetKey, filtered,
  selected, toggleOne, toggleAll, sortKey, sortDir, toggleSort,
  setDetail, openQueryForOrder, openConfirmForOrder, doDelete,
}) {
  return (
    <>
      {/* Tiêu đề + bộ lọc trạng thái */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-[-0.3px] text-[var(--admin-text)]">Lịch sử giao dịch</h1>
          <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
            {filtered.length} giao dịch{filter !== 'ALL' && ` · "${FILTERS.find(f => f.key === filter)?.label}"`}
          </p>
        </div>

        {/* Tabs trạng thái — desktop */}
        <nav className="hidden flex-wrap gap-0.5 md:flex">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 font-[var(--admin-font)] text-[13px] font-semibold transition-all ${
                filter === f.key
                  ? 'bg-[var(--mm)] text-white'
                  : 'bg-transparent text-[var(--admin-muted)] hover:bg-[var(--mm-light)] hover:text-[var(--mm)]'
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className={`rounded-[20px] px-[7px] py-0.5 text-[11px] font-bold leading-[1.4] ${filter === f.key ? 'bg-white/25' : 'bg-black/[0.08]'}`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </nav>

        {/* Select trạng thái — mobile */}
        <div className="relative w-full md:hidden">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--mm-light)] px-3.5 py-2 pr-8 font-[var(--admin-font)] text-[13px] font-semibold text-[var(--mm)]"
          >
            {FILTERS.map(f => (
              <option key={f.key} value={f.key}>{f.label} ({counts[f.key]})</option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mm)]">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </div>

      {/* Toolbar: ngày + tìm kiếm + xoá */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/70 bg-[var(--admin-surface)] px-4 py-2.5 shadow-[0_2px_20px_rgba(174,0,112,0.04)] backdrop-blur-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {DATE_PRESETS.map(p => {
            const [from, to] = p.range()
            const active = activePresetKey === p.key
            return (
              <button
                key={p.key}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  active ? 'bg-[var(--mm)] text-white' : 'bg-white/70 text-[var(--admin-muted)] hover:bg-[var(--mm-light)] hover:text-[var(--mm)]'
                }`}
                onClick={() => { setDateFrom(from); setDateTo(to); setActivePresetKey(p.key) }}
              >
                {p.label}
              </button>
            )
          })}
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/70 px-2 py-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-[var(--admin-muted)]">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePresetKey(null) }} max={dateTo || undefined}
              className="border-none bg-transparent font-[var(--admin-font)] text-xs text-[var(--admin-text)] outline-none" title="Từ ngày" />
            <span className="text-[var(--admin-muted)]">–</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePresetKey(null) }} min={dateFrom || undefined}
              className="border-none bg-transparent font-[var(--admin-font)] text-xs text-[var(--admin-text)] outline-none" title="Đến ngày" />
            {(dateFrom || dateTo) && (
              <button className="ml-0.5 flex-shrink-0 text-xs leading-none text-[var(--admin-muted)] hover:text-[var(--admin-danger)]" onClick={() => { setDateFrom(''); setDateTo(''); setActivePresetKey(null) }} title="Xóa lọc ngày">✕</button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pointer-events-none absolute left-[11px] text-[var(--admin-muted)]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text" placeholder="Tìm kiếm..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-[160px] rounded-[10px] border border-[var(--border)] bg-white/70 py-[7px] pl-[34px] pr-8 font-[var(--admin-font)] text-[13px] text-[var(--admin-text)] transition-all focus:border-[var(--mm)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.08)] focus:w-[220px]"
            />
            {search && <button className="absolute right-[10px] text-xs leading-none text-[var(--admin-muted)]" onClick={() => setSearch('')}>✕</button>}
          </div>
          {selected.size > 0 && (
            <button className="flex-shrink-0 whitespace-nowrap rounded-[9px] bg-[var(--admin-danger)] px-3.5 py-[7px] font-[var(--admin-font)] text-[13px] font-bold text-white" onClick={() => doDelete([...selected])}>
              🗑 Xóa ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="mb-5 grid grid-cols-2 gap-4 max-md:gap-3 md:grid-cols-4">
        <StatCard label="Doanh thu"  value={`${fmt(totalRevenue)} ₫`} color="var(--mm)" sub={`${counts.PAID} giao dịch thành công`} />
        <StatCard label="Thành công" value={`${counts.PAID} GD`}      color="#16a34a"   sub={`${counts.PAID ? Math.round(counts.PAID / counts.ALL * 100) : 0}% tỉ lệ thành công`} />
        <StatCard label="Thất bại"   value={`${counts.FAILED} GD`}    color="#dc2626"   sub={`${counts.EXPIRED} đơn hết hạn`} />
        <StatCard label="Tổng đơn"   value={`${counts.ALL} GD`}       color="#374151"   sub={`${counts.PENDING} đang chờ xử lý`} />
      </div>

      {/* TABLE / CARD LIST */}
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-[var(--admin-surface)] shadow-[0_4px_30px_rgba(0,0,0,0.04)] backdrop-blur-[16px]">
        {filtered.length === 0 ? (
          <div className="px-6 py-[72px] text-center">
            <div className="mb-3 text-4xl">🔍</div>
            <div className="text-[15px] font-semibold text-[var(--admin-muted)]">Không tìm thấy giao dịch nào</div>
          </div>
        ) : (
          <>
            {/* Desktop table (≥1024px) */}
            <div className="hidden max-h-[65vh] overflow-auto lg:block">
              <table className="w-full min-w-[980px] table-auto border-collapse text-[13.5px]">
                <colgroup>
                  <col className="w-[36px]" /><col className="w-[100px]" /><col className="w-[85px]" />
                  <col className="w-[24%]" /><col className="w-[110px]" /><col className="w-[110px]" />
                  <col className="w-[70px]" /><col className="w-[70px]" /><col className="w-[130px]" /><col className="w-[90px]" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#f5edf2]">
                    <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-[13px] text-center text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">
                      <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length}
                        ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)} onChange={toggleAll} />
                    </th>
                    <SortableTh label="Trạng thái" sortKey="status"     currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Số tiền"    sortKey="amount"     currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Nội dung"   sortKey="orderInfo"  currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Mã đơn"     sortKey="orderId"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Mã GD MoMo" sortKey="transId"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Hình thức"  sortKey="payType"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Result"     sortKey="resultCode" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Thời gian"  sortKey="createdAt"  currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-[13px] text-center text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const sm  = STATUS_META[o.status] || STATUS_META.PENDING
                    const sel = selected.has(o.orderId)
                    return (
                      <tr key={o.orderId}
                        className={`cursor-pointer border-b border-[rgba(174,0,112,0.03)] transition-colors last:border-b-0 hover:bg-white/60 ${sel ? 'bg-[rgba(174,0,112,0.05)]' : ''}`}
                        onClick={() => setDetail(o.orderId)}>
                        <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={sel} onChange={() => toggleOne(o.orderId)} />
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[20px] px-[11px] py-[5px] text-xs font-bold" style={{ background: sm.bg, color: sm.color }}>
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: sm.dot }} />
                            {sm.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-sm font-extrabold text-[var(--mm)]">{fmt(o.amount)} ₫</td>
                        <td className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle text-[#374151]" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                        <td className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle font-mono text-xs text-[#4b5563]">{o.orderId}</td>
                        <td className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle font-mono text-xs text-[#4b5563]">{o.transId || '—'}</td>
                        <td className="px-4 py-3.5 align-middle">
                          {o.payType ? <span className="rounded-md bg-black/[0.06] px-[9px] py-[3px] text-xs font-semibold">{o.payType}</span> : <span className="text-[#9ca3af]">—</span>}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          {o.resultCode !== undefined
                            ? <span className="font-mono text-[13px] font-bold" style={{ color: o.resultCode === 0 ? '#16a34a' : '#dc2626' }}>{o.resultCode === 0 ? '✓ 0' : `✗ ${o.resultCode}`}</span>
                            : <span className="text-[#9ca3af]">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-xs text-[var(--admin-muted)]">
                          <div>{fmtDate(o.createdAt)}</div>
                          {o.paidAt && <div className="mt-0.5 text-[#16a34a]">✓ {fmtDate(o.paidAt)}</div>}
                        </td>
                        <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <button className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#6366f1] transition-all hover:bg-[#eef2ff] hover:text-[#4f46e5]" onClick={() => openQueryForOrder(o.orderId)} title="Tra cứu MoMo API">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
                            </button>
                            <button className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#9ca3af] transition-all hover:bg-[#fee2e2] hover:text-[var(--admin-danger)]" onClick={() => doDelete([o.orderId])} title="Xóa">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                            {o.resultCode === 9000 && (
                              <button className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white" onClick={() => openConfirmForOrder(o.orderId, o.amount)} title="Xác nhận / Huỷ giao dịch (9000)">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
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

            {/* Card list (<1024px) */}
            <div className="lg:hidden">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-[#f5edf2] px-4 py-2.5">
                <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length}
                  ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)} onChange={toggleAll} />
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Chọn tất cả · {filtered.length} giao dịch</span>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {filtered.map(o => (
                  <OrderCard
                    key={o.orderId} o={o} selected={selected.has(o.orderId)}
                    onToggle={() => toggleOne(o.orderId)} onOpenDetail={() => setDetail(o.orderId)}
                    onQuery={() => openQueryForOrder(o.orderId)} onDelete={() => doDelete([o.orderId])}
                    onConfirm={() => openConfirmForOrder(o.orderId, o.amount)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// COMPONENT: CREATE SECTION
// Phần hiển thị khung tạo giao dịch mới, được load từ trang con /admin/create-transaction qua iframe
function CreateSection() {
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-[-0.3px] text-[var(--admin-text)]">Tạo giao dịch</h1>
          <p className="mt-0.5 text-xs text-[var(--admin-muted)]">Tạo thanh toán mới qua P2P hoặc quét mã QR (Scan)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[var(--border)] bg-white/70 px-3.5 py-[7px] font-[var(--admin-font)] text-[13px] font-semibold text-[var(--admin-muted)] transition-all hover:border-[var(--mm)] hover:text-[var(--mm)]"
            onClick={() => setReloadKey(k => k + 1)}
            title="Tải lại khung tạo giao dịch"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v6h-6"/></svg>
            Tải lại
          </button>
          <button
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[var(--mm)] px-3.5 py-[7px] font-[var(--admin-font)] text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(174,0,112,0.25)] transition-all hover:-translate-y-px hover:bg-[#91005d]"
            onClick={openCreateTransactionPopup}
            title="Mở ở cửa sổ riêng"
          >
            Mở cửa sổ riêng ↗
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_4px_30px_rgba(0,0,0,0.04)]" style={{ height: 'calc(100vh - 190px)' }}>
        <iframe
          key={reloadKey}
          src="/admin/create-transaction"
          title="Tạo giao dịch"
          className="h-full w-full border-0"
        />
      </div>
    </>
  )
}

// COMPONENT: LOOKUP SECTION
// Phần hiển thị khung tra cứu giao dịch theo mã đơn hàng (orderId), gọi trực tiếp MoMo API để lấy trạng thái thực tế
function LookupSection({ orderId, setOrderId, loading, result, error, onQuery }) {
  const copy = text => navigator.clipboard?.writeText(String(text))
  const rc     = result?.resultCode
  const isOk   = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[19px] font-extrabold tracking-[-0.3px] text-[var(--admin-text)]">Tra cứu giao dịch</h1>
        <p className="mt-0.5 text-xs text-[var(--admin-muted)]">Gọi trực tiếp đến MoMo server để lấy trạng thái thực tế theo mã đơn (orderId)</p>
      </div>

      <div className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-white/70 bg-[var(--admin-surface)] shadow-[0_4px_30px_rgba(0,0,0,0.04)] backdrop-blur-[16px]">
        <div className="border-b border-[var(--border)] px-[22px] py-4">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Order ID</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-[10px] border-[1.5px] border-[var(--border)] bg-white px-3.5 py-2.5 font-mono text-sm text-[var(--admin-text)] transition-all focus:border-[#6366f1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
              type="text" placeholder="Nhập mã đơn hàng (orderId)..."
              value={orderId} onChange={e => setOrderId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && onQuery()}
            />
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#4f46e5] px-[18px] py-2.5 font-[var(--admin-font)] text-[13px] font-bold text-white transition-all hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onQuery} disabled={loading || !orderId.trim()}
            >
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
              {loading ? 'Đang tra cứu...' : 'Tra cứu'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-[22px] my-3 flex items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--admin-danger)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="px-6 py-16 text-center">
            <div className="mb-3 text-4xl">🔎</div>
            <div className="text-[14px] font-semibold text-[var(--admin-muted)]">Nhập mã đơn hàng để xem trạng thái giao dịch</div>
          </div>
        )}

        {result && (
          <div className="pb-2">
            <div className="flex flex-col gap-1 px-[22px] py-4" style={{ background: isOk ? '#dcfce7' : rc === 1000 || rc === 7000 ? '#fef3c7' : '#fee2e2' }}>
              <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: isOk ? '#16a34a' : rc === 1000 || rc === 7000 ? '#d97706' : '#dc2626' }}>
                {isOk ? '✓' : '✗'} {rc}
              </div>
              <div className="text-sm font-bold text-[#374151]">{rcDesc}</div>
              {result.message && <div className="text-xs text-[var(--admin-muted)]">{result.message}</div>}
            </div>

            <Section title="Thông tin đơn hàng">
              <Row label="Order ID"   value={result.orderId}   mono copy={() => copy(result.orderId)} />
              <Row label="Request ID" value={result.requestId} mono copy={() => copy(result.requestId)} />
              <Row label="Trans ID"   value={result.transId}   mono copy={() => copy(result.transId)} />
              <Row label="Order Info" value={result.orderInfo} />
            </Section>

            <Section title="Kết quả thanh toán">
              <Row label="Result Code" value={rc !== undefined ? <span className="font-mono font-bold" style={{ color: isOk ? '#16a34a' : '#dc2626' }}>{rc} — {rcDesc}</span> : null} />
              <Row label="Số tiền"   value={result.amount !== undefined ? `${fmt(result.amount)} ₫` : null} />
              <Row label="Hình thức" value={result.payType   ? <span className="rounded-md bg-black/[0.06] px-[9px] py-[3px] text-xs font-semibold">{result.payType}</span>   : null} />
              <Row label="Order Type" value={result.orderType ? <span className="rounded-md bg-black/[0.06] px-[9px] py-[3px] text-xs font-semibold">{result.orderType}</span> : null} />
            </Section>

            <Section title="Thời gian">
              <Row label="Response Time" value={result.responseTime ? fmtMs(result.responseTime) : null} />
              <Row label="Pay Time"      value={result.payTime      ? fmtMs(result.payTime)      : null} />
            </Section>

            <Section title="Raw Response">
              <div className="max-h-[240px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">
                {JSON.stringify(result, null, 2)}
              </div>
            </Section>
          </div>
        )}
      </div>
    </>
  )
}


// COMPONENT: ORBS BACKGROUND
function Orbs() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute left-[-5%] top-[-5%] h-[45vw] max-h-[420px] w-[45vw] max-w-[420px] rounded-full bg-[#ff9cb7] opacity-55 blur-[70px]" style={{ animation: 'om1 7s infinite alternate ease-in-out' }} />
      <div className="absolute bottom-[-5%] right-[-5%] h-[55vw] max-h-[480px] w-[55vw] max-w-[480px] rounded-full bg-[#b0bec5] opacity-55 blur-[70px]" style={{ animation: 'om2 9s infinite alternate ease-in-out' }} />
      <div className="absolute right-[-5%] top-[20%] h-[40vw] max-h-[360px] w-[40vw] max-w-[360px] rounded-full bg-[#dfb2ea] opacity-55 blur-[70px]" style={{ animation: 'om3 8s infinite alternate ease-in-out' }} />
      <div className="absolute bottom-[-5%] left-[5%] h-[35vw] max-h-[320px] w-[35vw] max-w-[320px] rounded-full bg-[#80cbc4] opacity-55 blur-[70px]" style={{ animation: 'om1 8.5s infinite alternate ease-in-out' }} />
    </div>
  )
}

// COMPONENT: STAT CARD
function StatCard({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-[var(--admin-surface)] px-[22px] py-5 shadow-[0_2px_20px_rgba(174,0,112,0.04)] backdrop-blur-[12px] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(174,0,112,0.08)] max-md:px-4 max-md:py-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)] max-md:text-[10px]">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-[-0.5px] max-md:text-[20px]" style={{ color }}>{value}</div>
      {sub && <div className="mt-[5px] text-xs text-[var(--admin-muted)] max-md:truncate">{sub}</div>}
    </div>
  )
}

// COMPONENT: ORDER CARD (Dành cho mobile, hiển thị dạng card thay vì table)
function OrderCard({ o, selected, onToggle, onOpenDetail, onQuery, onDelete, onConfirm }) {
  const sm = STATUS_META[o.status] || STATUS_META.PENDING
  return (
    <div className={`cursor-pointer border-b border-[rgba(174,0,112,0.06)] px-4 py-3.5 transition-colors active:bg-white/60 last:border-b-0 ${selected ? 'bg-[rgba(174,0,112,0.05)]' : ''}`} onClick={onOpenDetail}>
      <div className="flex items-start gap-2.5">
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={e => e.stopPropagation()} className="mt-[3px] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[20px] px-[11px] py-[5px] text-xs font-bold" style={{ background: sm.bg, color: sm.color }}>
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: sm.dot }} />{sm.label}
            </span>
            <span className="flex-shrink-0 whitespace-nowrap text-[15px] font-extrabold text-[var(--mm)]">{fmt(o.amount)} ₫</span>
          </div>
          <div className="mt-2 truncate text-[13px] text-[#374151]" title={o.orderInfo}>{o.orderInfo || '—'}</div>
          <div className="mt-2.5 grid grid-cols-2 gap-y-1.5 gap-x-3">
            <InfoBit label="Mã đơn"     value={o.orderId} mono />
            <InfoBit label="Mã GD MoMo" value={o.transId || '—'} mono />
            <InfoBit label="Hình thức"  value={o.payType || '—'} />
            <InfoBit label="Result" value={
              o.resultCode !== undefined
                ? <span className="font-mono font-bold" style={{ color: o.resultCode === 0 ? '#16a34a' : '#dc2626' }}>{o.resultCode === 0 ? '✓ 0' : `✗ ${o.resultCode}`}</span>
                : '—'
            } />
            <InfoBit label="Tạo lúc"  value={fmtDate(o.createdAt)} />
            <InfoBit label="Hoàn tất" value={o.paidAt ? fmtDate(o.paidAt) : '—'} />
          </div>
          <div className="mt-3 flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
            <button className="inline-flex h-8 items-center gap-1 rounded-[7px] bg-[#eef2ff] px-2.5 text-[#4f46e5] transition-all active:bg-[#e0e7ff]" onClick={onQuery} title="Tra cứu MoMo API">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
              <span className="text-[11px] font-bold">Tra cứu</span>
            </button>
            {o.resultCode === 9000 && (
              <button className="inline-flex h-8 items-center gap-1 rounded-[7px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] px-2.5 text-[#16a34a] transition-all active:bg-[#dcfce7]" onClick={onConfirm} title="Xác nhận / Huỷ giao dịch (9000)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-[11px] font-bold">Xác nhận</span>
              </button>
            )}
            <button className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[7px] text-[#9ca3af] transition-all active:bg-[#fee2e2] active:text-[var(--admin-danger)]" onClick={onDelete} title="Xóa">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// COMPONENT: INFO BIT (Dùng trong OrderCard để hiển thị các thông tin phụ, có thể copy và định dạng mono nếu cần)
function InfoBit({ label, value, mono }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--admin-muted)]">{label}</div>
      <div className={`truncate text-[12px] text-[#374151] ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

//  COMPONENT: SORTABLE TH (Dùng trong table desktop để hiển thị header có thể sort, hiển thị mũi tên lên xuống và màu sắc khi active)
function SortableTh({ label, sortKey, currentKey, dir, onSort }) {
  const active = currentKey === sortKey
  return (
    <th className="cursor-pointer select-none whitespace-nowrap border-b border-[var(--border)] px-4 py-[13px] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)] transition-colors hover:bg-black/[0.03]" onClick={() => onSort(sortKey)}>
      <span className={`inline-flex items-center gap-1 ${active ? 'text-[var(--mm)]' : ''}`}>
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`flex-shrink-0 transition-all ${active ? 'opacity-100' : 'opacity-25'} ${active && dir === 'asc' ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </span>
    </th>
  )
}

// COMPONENT: DETAIL MODAL 
// (Hiển thị chi tiết giao dịch khi click vào một dòng trong table hoặc một card trong mobile, có thể copy các thông tin quan trọng và gọi các action như tra cứu, xóa, xác nhận)
function DetailModal({ order, onClose, onDelete, onQuery, onConfirm }) {
  const sm    = STATUS_META[order.status] || STATUS_META.PENDING
  const extra = decodeExtra(order.extraData)
  const copy  = text => navigator.clipboard?.writeText(text)

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(17,7,13,0.5)] p-5 backdrop-blur-[8px]" style={{ animation: 'fadein 0.15s ease' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(174,0,112,0.08)]" style={{ animation: 'slideup 0.2s ease' }} onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-start justify-between border-b border-[#f3f4f6] px-[22px] pb-4 pt-5">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Chi tiết giao dịch</div>
            <div className="font-mono text-[13px] text-[#374151]">{order.orderId}</div>
          </div>
          <button className="ml-3 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-sm text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[var(--admin-danger)]" onClick={onClose}>✕</button>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 px-[22px] py-5" style={{ background: sm.bg }}>
          <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-[20px] bg-white px-[11px] py-[5px] text-xs font-bold" style={{ color: sm.color }}>
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: sm.dot }} />{sm.label}
          </span>
          <div className="text-[28px] font-extrabold tracking-[-1px]" style={{ color: sm.color }}>{fmt(order.amount)} ₫</div>
          <div className="text-[13px] font-medium text-[#374151]">{order.orderInfo || '—'}</div>
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
                ? <span className="font-mono font-bold" style={{ color: order.resultCode === 0 ? '#16a34a' : '#dc2626' }}>
                    {order.resultCode === 0 ? `✓ ${order.resultCode} — Thành công` : `✗ ${order.resultCode} — ${getResultDesc(order.resultCode)}`}
                  </span>
                : null
            } />
            <Row label="Message"  value={order.message} />
            <Row label="Loại đơn" value={order.orderType} />
            <Row label="Hình thức" value={order.payType ? <span className="rounded-md bg-black/[0.06] px-[9px] py-[3px] text-xs font-semibold">{order.payType}</span> : null} />
            <Row label="Nguồn"     value={order.source  ? <span className="rounded-md bg-black/[0.06] px-[9px] py-[3px] text-xs font-semibold">{order.source}</span>  : null} />
          </Section>

          <Section title="Thời gian">
            <Row label="Tạo lúc"       value={fmtDate(order.createdAt)} />
            <Row label="MoMo phản hồi" value={fmtMs(order.responseTime)} />
            <Row label="Hoàn tất lúc"  value={fmtDate(order.paidAt)} />
          </Section>

          {order.extraData && (
            <Section title="Extra Data">
              <div className="mb-1 whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">
                {typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra}
              </div>
            </Section>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-[22px] py-3.5">
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-[7px] rounded-[9px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2 font-[var(--admin-font)] text-[13px] font-bold text-[var(--admin-danger)] transition-all hover:bg-[#fee2e2] hover:border-[var(--admin-danger)]" onClick={() => { onClose(); onDelete(order.orderId) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Xóa giao dịch
            </button>
            <button className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(99,102,241,0.3)] bg-[#eef2ff] px-3.5 py-2 font-[var(--admin-font)] text-[13px] font-bold text-[#4f46e5] transition-all hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5]" onClick={() => onQuery(order.orderId)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
              Tra cứu MoMo
            </button>
            {order.resultCode === 9000 && (
              <button className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] px-3.5 py-2 font-[var(--admin-font)] text-[13px] font-bold text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a]" onClick={() => { onClose(); onConfirm(order.orderId, order.amount) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Xác nhận (9000)
              </button>
            )}
          </div>
          <button className="rounded-[9px] border border-[var(--border)] bg-[#f9fafb] px-5 py-2 font-[var(--admin-font)] text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

// COMPONENT: CONFIRM MODAL
// (Hiển thị khi click vào nút xác nhận trên một giao dịch có resultCode = 9000, cho phép chọn Capture để chuyển tiền về ví đối tác hoặc Cancel để hoàn tiền về người dùng)
function ConfirmModal({ orderId, amount, loading, result, error, onConfirm, onCancel, onClose }) {
  const rc   = result?.resultCode
  const isOk = rc === 0

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(17,7,13,0.5)] p-5 backdrop-blur-[8px]" style={{ animation: 'fadein 0.15s ease' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(174,0,112,0.08)]" style={{ animation: 'slideup 0.2s ease' }} onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-start justify-between border-b border-[#f3f4f6] px-[22px] pb-4 pt-5">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">Xác nhận / Huỷ giao dịch</div>
            <div className="text-xs text-[#6b7280]">POST /v2/gateway/api/confirm · {orderId}</div>
          </div>
          <button className="ml-3 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-sm text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[var(--admin-danger)]" onClick={onClose}>✕</button>
        </div>

        <div className="flex-shrink-0 border-b border-[#f3f4f6] px-[22px] py-4">
          <div className="mb-3 text-[13px] text-[#374151]">
            Giao dịch <strong className="font-mono">{orderId}</strong> đang ở trạng thái <strong className="text-[#d97706]">9000 — Authorized</strong>.
            <br />Số tiền: <strong>{parseInt(amount || 0).toLocaleString('vi-VN')} ₫</strong>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#16a34a] px-[18px] py-2.5 font-[var(--admin-font)] text-[13px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50" onClick={onConfirm} disabled={loading || !!result}>
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              Capture (xác nhận)
            </button>
            <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#dc2626] px-[18px] py-2.5 font-[var(--admin-font)] text-[13px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50" onClick={onCancel} disabled={loading || !!result}>
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>}
              Cancel (huỷ)
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--admin-muted)]">Capture → chuyển tiền về ví đối tác. Cancel → hoàn tiền về người dùng.</div>
        </div>

        {error && (
          <div className="mx-[22px] my-3 flex flex-shrink-0 items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--admin-danger)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto py-1">
            <div className="flex flex-shrink-0 flex-col gap-1 px-[22px] py-4" style={{ background: isOk ? '#dcfce7' : '#fee2e2' }}>
              <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: isOk ? '#16a34a' : '#dc2626' }}>{isOk ? '✓' : '✗'} {rc}</div>
              <div className="text-sm font-bold text-[#374151]">{result.requestType === 'capture' ? 'Capture' : 'Cancel'} — {getResultDesc(rc)}</div>
              {result.message && <div className="text-xs text-[var(--admin-muted)]">{result.message}</div>}
            </div>
            <Section title="Raw Response">
              <div className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">{JSON.stringify(result, null, 2)}</div>
            </Section>
          </div>
        )}

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-[22px] py-3.5">
          <div className="text-xs text-[#9ca3af]">Chỉ áp dụng cho giao dịch resultCode = 9000</div>
          <button className="rounded-[9px] border border-[var(--border)] bg-[#f9fafb] px-5 py-2 font-[var(--admin-font)] text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

// COMPONENT: SECTION (Dùng để chia các phần thông tin trong DetailModal, có title và phần nội dung bên dưới, có thể tái sử dụng cho nhiều mục khác nhau)
function Section({ title, children }) {
  return (
    <div className="msection-wrap px-[22px]">
      <div className="msection-title border-t border-[#f3f4f6] py-3.5 pb-2 pt-3.5 text-[10px] font-bold uppercase tracking-wider text-[var(--admin-muted)]">{title}</div>
      {children}
    </div>
  )
}

// COMPONENT: ROW (Dùng để hiển thị một dòng thông tin trong DetailModal, có label và value, có thể định dạng mono và có nút copy nếu cần)
function Row({ label, value, mono, copy }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 border-b border-[#f9fafb] py-[9px] last:border-b-0">
      <span className="min-w-[130px] flex-shrink-0 pt-px text-xs font-semibold text-[var(--admin-muted)]">{label}</span>
      <span className={`flex flex-1 items-center gap-1.5 break-all text-[13px] text-[var(--admin-text)] ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        {copy && value && value !== '—' && (
          <button className="flex-shrink-0 rounded p-0.5 text-[#9ca3af] transition-colors hover:text-[var(--mm)]" onClick={copy} title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        )}
      </span>
    </div>
  )
}

// COMPONENT: ICONS (Các icon SVG được sử dụng trong giao diện, có thể tái sử dụng và nhận props để tuỳ chỉnh kích thước, màu sắc, v.v.)
function IconHistory(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
}
// Các icon SVG được sử dụng trong giao diện, có thể tái sử dụng và nhận props để tuỳ chỉnh kích thước, màu sắc, v.v.
function IconPlus(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
}
// Các icon SVG được sử dụng trong giao diện, có thể tái sử dụng và nhận props để tuỳ chỉnh kích thước, màu sắc, v.v.
function IconSearch(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
}
// Các icon SVG được sử dụng trong giao diện, có thể tái sử dụng và nhận props để tuỳ chỉnh kích thước, màu sắc, v.v.
function IconLogout(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}
// Các icon SVG được sử dụng trong giao diện, có thể tái sử dụng và nhận props để tuỳ chỉnh kích thước, màu sắc, v.v.
function IconMenu(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
}
// Các icon SVG được sử dụng trong giao diện, có thể tái sử dụng và nhận props để tuỳ chỉnh kích thước, màu sắc, v.v.
function IconX(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}