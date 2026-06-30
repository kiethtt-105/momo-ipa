// pages/admin-dashboard.js — REBUILT
// Logic fix: scoped = date+search filtered (for stats). filtered = scoped + status filter (for table).
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const REFRESH_INTERVAL = 1000
const EXPIRE_MINUTES = 10

const STATUS_META = {
  PAID:    { label: 'Thành công', color: '#16a34a', bg: '#dcfce7', dot: '#22c55e' },
  FAILED:  { label: 'Thất bại',   color: '#dc2626', bg: '#fee2e2', dot: '#ef4444' },
  PENDING: { label: 'Chờ xử lý', color: '#d97706', bg: '#fef3c7', dot: '#f59e0b' },
  EXPIRED: { label: 'Hết hạn',   color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
}

const FILTERS = [
  { key: 'ALL',     label: 'Tất cả'     },
  { key: 'PAID',    label: 'Thành công' },
  { key: 'PENDING', label: 'Chờ xử lý' },
  { key: 'FAILED',  label: 'Thất bại'  },
  { key: 'EXPIRED', label: 'Hết hạn'   },
]

const NAV_ITEMS = [
  { key: 'history', label: 'Lịch sử giao dịch', sub: 'Toàn bộ đơn hàng',  icon: IconHistory },
  { key: 'create',  label: 'Tạo giao dịch',     sub: 'P2P / Scan',  icon: IconPlus   },
  { key: 'lookup',  label: 'Tra cứu giao dịch', sub: 'Theo mã đơn MoMo',  icon: IconSearch },
]

function openCreateTransactionPopup() {
  window.open('/admin/create-transaction', '_blank');
}

const fmt     = n  => parseInt(n || 0).toLocaleString('vi-VN')
const fmtDate = s  => s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '—'
const fmtMs   = ms => ms ? new Date(parseInt(ms)).toLocaleString('vi-VN', { hour12: false }) : '—'
const decodeExtra = b64 => {
  if (!b64) return null
  try { return JSON.parse(atob(b64)) } catch { return b64 }
}

const toDayStr   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const parseDayStr = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d) }
const MONTH_NAMES_VN = ['Một','Hai','Ba','Tư','Năm','Sáu','Bảy','Tám','Chín','Mười','Mười một','Mười hai']
const WEEKDAYS_VN = ['H','B','T','N','S','B','C']

function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d
  })
}

const DATE_PRESETS = [
  { key: 'allTime',   label: 'Tất cả',    range: () => ['', ''] },
  { key: 'yesterday', label: 'Hôm qua',   range: () => { const d = new Date(); d.setDate(d.getDate()-1); const s = toDayStr(d); return [s, s] } },
  { key: 'today',     label: 'Hôm nay',   range: () => { const s = toDayStr(new Date()); return [s, s] } },
  { key: 'thisWeek',  label: 'Tuần này',  range: () => {
    const now = new Date(); const day = now.getDay() === 0 ? 7 : now.getDay()
    const start = new Date(now); start.setDate(now.getDate() - day + 1)
    return [toDayStr(start), toDayStr(now)]
  }},
  { key: 'thisMonth', label: 'Tháng này', range: () => {
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return [toDayStr(start), toDayStr(now)]
  }},
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
  0:'Thành công',10:'Hệ thống đang bảo trì',11:'Truy cập bị từ chối',12:'Phiên bản API không được hỗ trợ',
  13:'Xác thực merchant thất bại',20:'Request sai định dạng',21:'Số tiền không hợp lệ',22:'orderId không hợp lệ',
  23:'requestId không hợp lệ',24:'Chữ ký không hợp lệ',26:'Thông tin đơn hàng không hợp lệ',29:'Vượt quá giới hạn tần suất API',
  1000:'Đang chờ xác nhận từ người dùng',1001:'Thanh toán thất bại (số dư không đủ)',1002:'Từ chối bởi nhà phát hành',
  1003:'Đơn hàng bị huỷ hoặc hết hạn',1004:'Số tiền vượt hạn mức cho phép',1005:'URL thanh toán đã hết hạn',
  1006:'Người dùng từ chối xác nhận',1007:'Tài khoản không được xác minh',1017:'Giao dịch bị huỷ bởi hệ thống',
  1026:'Bị giới hạn vì chính sách của MoMo',2019:'orderGroupId không hợp lệ',4001:'Giao dịch bị hạn chế (KYC)',
  4010:'Xác thực 2 yếu tố thất bại',4011:'OTP chưa được gửi hoặc đã hết hạn',4100:'Người dùng chưa đăng nhập',
  7000:'Đang xử lý',7002:'Đang xử lý bởi nhà cung cấp',9000:'Giao dịch đã được xác nhận thành công',
}
const getResultDesc = code => RESULT_CODE_MAP[code] !== undefined ? RESULT_CODE_MAP[code] : 'Mã lỗi không xác định'

// ─── SIDEBAR (tách riêng + memo để không re-render theo `orders`/polling) ──
// Chỉ re-render khi 1 trong các props dưới đây thực sự đổi giá trị.
// Quan trọng: goToSection/logout truyền vào PHẢI được useCallback ở component
// cha, nếu không React.memo vô nghĩa vì function reference đổi mỗi render.
const Sidebar = memo(function Sidebar({
  sidebarOpen, setSidebarOpen, activeSection, goToSection,
  pendingCount, fetching, lastSync, logout,
}) {
  return (
    <>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[250] bg-[rgba(17,7,13,0.45)] backdrop-blur-[2px] lg:hidden" style={{ animation:'fadein 0.15s ease' }} onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-[260] flex w-[252px] max-w-[80vw] flex-shrink-0 flex-col border-r border-[rgba(174,0,112,0.1)] bg-white/95 shadow-[4px_0_24px_rgba(174,0,112,0.06)] backdrop-blur-[20px] transition-transform duration-300 ease-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-[rgba(174,0,112,0.1)] px-5 py-4">
          <div className="flex items-center gap-[9px]">
            <img src="/Main.png" alt="" className="h-[30px] w-[30px] rounded-lg object-contain" />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-extrabold tracking-[-0.3px] text-[#ae0070]">MoMo Admin</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-[#6b7280]">
                <span className={`h-[6px] w-[6px] flex-shrink-0 rounded-full transition-colors duration-300 ${fetching ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`} style={fetching ? { animation:'pulse-dot 0.8s infinite' } : undefined} />
                {lastSync ? `Sync ${lastSync.toLocaleTimeString('vi-VN')}` : 'Đang kết nối…'}
              </span>
            </div>
          </div>
          <button className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-all hover:bg-[#f3f4f6] lg:hidden" onClick={() => setSidebarOpen(false)}>
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">Quản lý giao dịch</div>
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map(item => {
              const Icon   = item.icon
              const active = activeSection === item.key
              return (
                <button key={item.key}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all ${
                    active ? 'bg-[#ae0070] text-white shadow-[0_4px_14px_rgba(174,0,112,0.25)]' : 'text-[#111827] hover:bg-[#fff0f7] hover:text-[#ae0070]'
                  }`}
                  onClick={() => goToSection(item.key)}
                >
                  <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-white' : 'text-[#ae0070]'}`} />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13.5px] font-bold">{item.label}</span>
                    <span className={`text-[11px] font-medium ${active ? 'text-white/75' : 'text-[#6b7280]'}`}>{item.sub}</span>
                  </span>
                  {item.key === 'history' && pendingCount > 0 && (
                    <span className={`ml-auto flex-shrink-0 rounded-full px-[7px] py-[1px] text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-[#fef3c7] text-[#d97706]'}`}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Logout */}
        <div className="flex-shrink-0 border-t border-[rgba(174,0,112,0.1)] px-3 py-4">
          <button
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]"
            onClick={logout}
          >
            <IconLogout className="h-[18px] w-[18px] flex-shrink-0" />
            <span className="text-[13.5px] font-bold">Đăng xuất</span>
          </button>
        </div>
      </aside>
    </>
  )
})

// ─── ICON COMPONENTS ───────────────────────────────────────────────────────
function IconHistory(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg> }
function IconPlus(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> }
function IconSearch(props)  { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg> }
function IconLogout(props)  { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function IconMenu(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg> }
function IconX(props)       { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }

// ─── ANIMATED ORBS ─────────────────────────────────────────────────────────
function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute h-[520px] w-[520px] rounded-full bg-[#ae0070] opacity-[0.07]" style={{ top: '-120px', left: '-140px', animation: 'om1 18s ease-in-out infinite alternate' }} />
      <div className="absolute h-[400px] w-[400px] rounded-full bg-[#ae0070] opacity-[0.05]" style={{ bottom: '-100px', right: '-100px', animation: 'om2 22s ease-in-out infinite alternate' }} />
      <div className="absolute h-[300px] w-[300px] rounded-full bg-[#ae0070] opacity-[0.04]" style={{ top: '40%', left: '55%', animation: 'om3 26s ease-in-out infinite alternate' }} />
    </div>
  )
}

// ─── STAT CARD ─────────────────────────────────────────────────────────────
const StatCard = memo(function StatCard({ label, value, color, sub }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-[0_2px_16px_rgba(174,0,112,0.04)] backdrop-blur-[12px]">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</div>
      <div className="text-[22px] font-extrabold tracking-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-[11.5px] text-[#9ca3af]">{sub}</div>}
    </div>
  )
})

// ─── SORTABLE TH ───────────────────────────────────────────────────────────
const SortableTh = memo(function SortableTh({ label, sortKey: sk, currentKey, dir, onSort }) {
  const active = currentKey === sk
  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap border-b border-[rgba(174,0,112,0.08)] px-4 py-[13px] text-left text-[11px] font-bold uppercase tracking-wide text-[#6b7280] transition-colors hover:text-[#ae0070]"
      onClick={() => onSort(sk)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ae0070" strokeWidth="3">{dir==='asc'?<path d="m18 15-6-6-6 6"/>:<path d="m6 9 6 6 6-6"/>}</svg>
          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-30"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
        }
      </span>
    </th>
  )
})

// ─── ORDER CARD (mobile) ────────────────────────────────────────────────────
const OrderCard = memo(function OrderCard({ o, selected, onToggle, onOpenDetail, onQuery, onDelete, onConfirm }) {
  const sm = STATUS_META[o.status] || STATUS_META.PENDING
  return (
    <div
      className={`flex cursor-pointer flex-col gap-2 border-b border-[rgba(174,0,112,0.05)] px-4 py-3.5 transition-colors ${selected ? 'bg-[rgba(174,0,112,0.04)]' : 'hover:bg-white/50'}`}
      onClick={() => onOpenDetail(o.orderId)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <input type="checkbox" checked={selected} onChange={e => { e.stopPropagation(); onToggle(o.orderId) }} onClick={e => e.stopPropagation()} className="flex-shrink-0" />
          <span className="inline-flex items-center gap-1.5 rounded-[20px] px-[10px] py-[4px] text-xs font-bold" style={{ background: sm.bg, color: sm.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.dot }} />
            {sm.label}
          </span>
        </div>
        <span className="text-[15px] font-extrabold text-[#ae0070]">{fmt(o.amount)} ₫</span>
      </div>
      <div className="flex items-start justify-between gap-2 pl-6">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-[#374151]">{o.orderInfo || '—'}</div>
          <div className="mt-0.5 font-mono text-[11px] text-[#9ca3af]">{o.orderId}</div>
          <div className="mt-0.5 text-[11px] text-[#9ca3af]">{fmtDate(o.createdAt)}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
          <button className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#6366f1] transition-all hover:bg-[#eef2ff]" onClick={() => onQuery(o.orderId)} title="Tra cứu">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#9ca3af] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]" onClick={() => onDelete([o.orderId])} title="Xóa">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
          {o.resultCode === 9000 && (
            <button className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white" onClick={() => onConfirm(o.orderId, o.amount)} title="Xác nhận">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

// ─── SECTION / ROW (modal helpers) ─────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="msection-wrap px-[22px]">
      <div className="msection-title border-t border-[#f3f4f6] py-3.5 pb-2 pt-3.5 text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, mono, copy }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 border-b border-[#f9fafb] py-[9px] last:border-b-0">
      <span className="min-w-[130px] flex-shrink-0 pt-px text-xs font-semibold text-[#6b7280]">{label}</span>
      <span className={`flex flex-1 items-center gap-1.5 break-all text-[13px] text-[#111827] ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        {copy && value && value !== '—' && (
          <button className="flex-shrink-0 rounded p-0.5 text-[#9ca3af] transition-colors hover:text-[#ae0070]" onClick={copy} title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        )}
      </span>
    </div>
  )
}

// ─── DATE RANGE PICKER ─────────────────────────────────────────────────────
function DateRangePicker({ dateFrom, setDateFrom, dateTo, setDateTo, setActivePresetKey }) {
  const [open, setOpen]   = useState(false)
  const [view, setView]   = useState(() => { const d = dateFrom ? parseDayStr(dateFrom) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [hover, setHover] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const onDocClick = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const today = toDayStr(new Date())
  const days  = buildCalendarGrid(view.getFullYear(), view.getMonth())
  const pendingStart = dateFrom && !dateTo

  const inRange = dayStr => {
    if (dateFrom && dateTo) return dayStr >= dateFrom && dayStr <= dateTo
    if (pendingStart && hover) return dayStr >= Math.min(dateFrom, hover) && dayStr <= Math.max(dateFrom, hover)
    return false
  }

  const pickDay = d => {
    const dayStr = toDayStr(d)
    setActivePresetKey(null)
    if (!dateFrom || (dateFrom && dateTo)) {
      setDateFrom(dayStr); setDateTo('')
    } else {
      if (dayStr < dateFrom) { setDateTo(dateFrom); setDateFrom(dayStr) } else { setDateTo(dayStr) }
      setOpen(false)
    }
  }

  const shiftMonth = delta => setView(v => new Date(v.getFullYear(), v.getMonth() + delta, 1))

  const summary = !dateFrom && !dateTo
    ? 'Tất cả thời gian'
    : dateFrom === dateTo
      ? new Date(dateFrom).toLocaleDateString('vi-VN')
      : `${dateFrom ? new Date(dateFrom).toLocaleDateString('vi-VN') : '…'} – ${dateTo ? new Date(dateTo).toLocaleDateString('vi-VN') : '…'}`

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
          open || dateFrom ? 'border-[#ae0070] bg-[#fff0f7] text-[#ae0070]' : 'border-[rgba(174,0,112,0.1)] bg-white/70 text-[#6b7280] hover:bg-[#fff0f7] hover:text-[#ae0070]'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        {summary}
        {(dateFrom || dateTo) && (
          <span role="button" onClick={e => { e.stopPropagation(); setDateFrom(''); setDateTo(''); setActivePresetKey(null) }} className="ml-0.5 leading-none text-[#6b7280] hover:text-[#dc2626]" title="Xóa lọc ngày">✕</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[200] w-[280px] rounded-[16px] border border-white/70 bg-white p-3.5 shadow-[0_20px_50px_rgba(174,0,112,0.16),0_0_0_1px_rgba(174,0,112,0.06)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] transition-all hover:bg-[#fff0f7] hover:text-[#ae0070]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div className="text-[13px] font-bold text-[#111827]">Tháng {MONTH_NAMES_VN[view.getMonth()]} {view.getFullYear()}</div>
            <button type="button" onClick={() => shiftMonth(1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] transition-all hover:bg-[#fff0f7] hover:text-[#ae0070]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS_VN.map((w, i) => (
              <div key={i} className="text-[10px] font-bold uppercase text-[#6b7280]">{w}</div>
            ))}
            {days.map((d, i) => {
              const dayStr  = toDayStr(d)
              const inMonth = d.getMonth() === view.getMonth()
              const isToday = dayStr === today
              const isStart = dayStr === dateFrom
              const isEnd   = dayStr === dateTo
              const isEdge  = isStart || isEnd
              const isIn    = inRange(dayStr)
              return (
                <button key={i} type="button"
                  onClick={() => pickDay(d)}
                  onMouseEnter={() => pendingStart && setHover(dayStr)}
                  className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-all
                    ${!inMonth ? 'text-[#d1d5db]' : 'text-[#111827]'}
                    ${isIn && !isEdge ? 'bg-[#fff0f7] rounded-none' : ''}
                    ${isEdge ? 'bg-[#ae0070] text-white' : ''}
                    ${!isEdge && inMonth ? 'hover:bg-[#fff0f7] hover:text-[#ae0070]' : ''}
                    ${isToday && !isEdge ? 'ring-1 ring-inset ring-[#ae0070]' : ''}
                  `}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[#f3f4f6] pt-2.5">
            <button type="button" className="text-[11px] font-bold text-[#6b7280] hover:text-[#dc2626]" onClick={() => { setDateFrom(''); setDateTo(''); setActivePresetKey(null); setOpen(false) }}>Xóa</button>
            <button type="button" className="text-[11px] font-bold text-[#ae0070]" onClick={() => { const s = toDayStr(new Date()); setDateFrom(s); setDateTo(s); setActivePresetKey(null); setView(new Date()); setOpen(false) }}>Hôm nay</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DETAIL MODAL ──────────────────────────────────────────────────────────
function DetailModal({ order: o, onClose, onDelete, onQuery, onConfirm }) {
  const sm    = STATUS_META[o.status] || STATUS_META.PENDING
  const copy  = t => navigator.clipboard?.writeText(String(t))
  const extra = decodeExtra(o.extraData)

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(17,7,13,0.5)] p-5 backdrop-blur-[8px]" style={{ animation:'fadein 0.15s ease' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(174,0,112,0.08)]" style={{ animation:'slideup 0.2s ease' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between border-b border-[#f3f4f6] px-[22px] pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-[20px] px-[11px] py-[5px] text-xs font-bold" style={{ background:sm.bg, color:sm.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background:sm.dot }} />{sm.label}
            </span>
            <span className="text-[20px] font-extrabold tracking-tight text-[#ae0070]">{fmt(o.amount)} ₫</span>
          </div>
          <button className="ml-3 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-sm text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-1">
          <Section title="Thông tin giao dịch">
            <Row label="Mã đơn hàng"   value={o.orderId}   mono copy={() => copy(o.orderId)} />
            <Row label="Nội dung"       value={o.orderInfo || '—'} />
            <Row label="Số tiền"        value={`${fmt(o.amount)} ₫`} />
            <Row label="Hình thức"      value={o.payType || (o.orderId?.startsWith('POS')||o.orderId?.startsWith('iPOS')?'POS':'P2P')} />
            <Row label="Mã GD MoMo"     value={o.transId || '—'} mono copy={() => copy(o.transId)} />
            <Row label="Result Code"    value={o.resultCode !== undefined
              ? <span className="font-mono font-bold" style={{ color: o.resultCode===0?'#16a34a':'#dc2626' }}>{o.resultCode} — {getResultDesc(o.resultCode)}</span>
              : '—'} />
            <Row label="Thông điệp"     value={o.message || '—'} />
          </Section>

          <Section title="Thời gian">
            <Row label="Tạo đơn"        value={fmtDate(o.createdAt)} />
            <Row label="Thanh toán"     value={o.paidAt ? fmtDate(o.paidAt) : '—'} />
            <Row label="responseTime"   value={o.responseTime ? fmtMs(o.responseTime) : '—'} />
          </Section>

          {extra && (
            <Section title="Extra Data">
              <div className="max-h-[160px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">
                {typeof extra === 'object' ? JSON.stringify(extra, null, 2) : String(extra)}
              </div>
            </Section>
          )}

          {o.payUrl && (
            <Section title="Thanh toán nhanh (QR / Link)">
              <div className="flex flex-col items-center gap-3 px-1 py-2 sm:flex-row sm:items-start">
                {o.qrCodeImage && (
                  <img
                    src={o.qrCodeImage}
                    alt="QR thanh toán"
                    className="h-[160px] w-[160px] flex-shrink-0 rounded-lg border border-[#e5e7eb] bg-white p-1.5"
                  />
                )}
                <div className="flex w-full flex-1 flex-col gap-2">
                  <div className="break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 font-mono text-[11.5px] text-[#374151]">
                    {o.payUrl}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={o.payUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(174,0,112,0.25)] bg-[#fff0f7] px-3.5 py-2 text-[13px] font-bold text-[#ae0070] transition-all hover:bg-[#ae0070] hover:text-white"
                    >
                      Mở link thanh toán
                    </a>
                    <button
                      className="inline-flex items-center gap-[7px] rounded-[9px] border border-[#e5e7eb] bg-white px-3.5 py-2 text-[13px] font-bold text-[#374151] transition-all hover:bg-[#f3f4f6]"
                      onClick={() => copy(o.payUrl)}
                    >
                      Copy link
                    </button>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {o.requestId && (
            <Section title="IDs kỹ thuật">
              <Row label="requestId"    value={o.requestId}   mono copy={() => copy(o.requestId)} />
              <Row label="partnerCode"  value={o.partnerCode} mono />
              <Row label="orderGroupId" value={o.orderGroupId || '—'} mono />
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] px-[22px] py-3.5">
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-[7px] rounded-[9px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2 text-[13px] font-bold text-[#dc2626] transition-all hover:bg-[#fee2e2] hover:border-[#dc2626]" onClick={() => { onClose(); onDelete(o.orderId) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Xóa
            </button>
            <button className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(99,102,241,0.3)] bg-[#eef2ff] px-3.5 py-2 text-[13px] font-bold text-[#4f46e5] transition-all hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5]" onClick={() => onQuery(o.orderId)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
              Tra cứu MoMo
            </button>
            {o.resultCode === 9000 && (
              <button className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] px-3.5 py-2 text-[13px] font-bold text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a]" onClick={() => { onClose(); onConfirm(o.orderId, o.amount) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Xác nhận (9000)
              </button>
            )}
          </div>
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── CONFIRM MODAL ─────────────────────────────────────────────────────────
function ConfirmModal({ orderId, amount, loading, result, error, onConfirm, onCancel, onClose }) {
  const rc   = result?.resultCode
  const isOk = rc === 0

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(17,7,13,0.5)] p-5 backdrop-blur-[8px]" style={{ animation:'fadein 0.15s ease' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(174,0,112,0.08)]" style={{ animation:'slideup 0.2s ease' }} onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-start justify-between border-b border-[#f3f4f6] px-[22px] pb-4 pt-5">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Xác nhận / Huỷ giao dịch</div>
            <div className="text-xs text-[#6b7280]">POST /v2/gateway/api/confirm · {orderId}</div>
          </div>
          <button className="ml-3 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-sm text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]" onClick={onClose}>✕</button>
        </div>

        <div className="flex-shrink-0 border-b border-[#f3f4f6] px-[22px] py-4">
          <div className="mb-3 text-[13px] text-[#374151]">
            Giao dịch <strong className="font-mono">{orderId}</strong> đang ở trạng thái <strong className="text-[#d97706]">9000 — Authorized</strong>.
            <br />Số tiền: <strong>{parseInt(amount||0).toLocaleString('vi-VN')} ₫</strong>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#16a34a] px-[18px] py-2.5 text-[13px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50" onClick={onConfirm} disabled={loading || !!result}>
              {loading ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                       : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              Capture (xác nhận)
            </button>
            <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#dc2626] px-[18px] py-2.5 text-[13px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50" onClick={onCancel} disabled={loading || !!result}>
              {loading ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                       : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>}
              Cancel (huỷ)
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-[#6b7280]">Capture → chuyển tiền về ví đối tác. Cancel → hoàn tiền về người dùng.</div>
        </div>

        {error && (
          <div className="mx-[22px] my-3 flex flex-shrink-0 items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[#dc2626]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto py-1">
            <div className="flex flex-shrink-0 flex-col gap-1 px-[22px] py-4" style={{ background: isOk?'#dcfce7':'#fee2e2' }}>
              <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: isOk?'#16a34a':'#dc2626' }}>{isOk?'✓':'✗'} {rc}</div>
              <div className="text-sm font-bold text-[#374151]">{result.requestType==='capture'?'Capture':'Cancel'} — {getResultDesc(rc)}</div>
              {result.message && <div className="text-xs text-[#6b7280]">{result.message}</div>}
            </div>
            <Section title="Raw Response">
              <div className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">{JSON.stringify(result, null, 2)}</div>
            </Section>
          </div>
        )}

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-[22px] py-3.5">
          <div className="text-xs text-[#9ca3af]">Chỉ áp dụng cho giao dịch resultCode = 9000</div>
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── QUERY RESULT MODAL (popup tra cứu MoMo) ──────────────────────────────
function QueryResultModal({ orderId, loading, result, error, onClose, stacked }) {
  const copy   = t => navigator.clipboard?.writeText(String(t))
  const rc     = result?.resultCode
  const isOk   = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null

  return (
    <div
      className={`fixed inset-0 z-[320] flex items-center justify-center p-5 ${stacked ? 'bg-[rgba(17,7,13,0.35)]' : 'bg-[rgba(17,7,13,0.5)] backdrop-blur-[8px]'}`}
      style={{ animation:'fadein 0.15s ease' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.25),0_0_0_1px_rgba(99,102,241,0.1)]"
        style={{ animation:'slideup 0.2s ease' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#f3f4f6] px-[22px] py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#eef2ff] text-[#4f46e5]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <div>
              <div className="text-[15px] font-extrabold tracking-[-0.2px] text-[#111827]">Tra cứu MoMo</div>
              <div className="max-w-[320px] truncate font-mono text-[11px] text-[#9ca3af]" title={orderId}>{orderId}</div>
            </div>
          </div>
          <button className="ml-3 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-sm text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
              <div className="text-[13px] font-semibold text-[#6b7280]">Đang tra cứu trên MoMo server...</div>
            </div>
          )}

          {!loading && error && (
            <div className="mx-[22px] my-4 flex items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[#dc2626]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
              {error}
            </div>
          )}

          {!loading && result && (
            <>
              <div className="flex flex-col gap-1 px-[22px] py-4" style={{ background: isOk?'#f0fdf4':'#fff5f5' }}>
                <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: isOk?'#16a34a':'#dc2626' }}>{isOk?'✓':'✗'} {rc}</div>
                <div className="text-sm font-bold text-[#374151]">{rcDesc}</div>
                {result.message && <div className="text-xs text-[#6b7280]">{result.message}</div>}
              </div>

              <Section title="Thông tin giao dịch">
                <Row label="orderId"      value={result.orderId}   mono copy={() => copy(result.orderId)} />
                <Row label="requestId"    value={result.requestId} mono copy={() => copy(result.requestId)} />
                <Row label="transId"      value={result.transId?.toString()||'—'} mono />
                <Row label="partnerCode"  value={result.partnerCode} mono />
                <Row label="amount"        value={result.amount !== undefined ? `${fmt(result.amount)} ₫` : '—'} />
                <Row label="payType"       value={result.payType || '—'} />
                <Row label="paymentOption" value={result.paymentOption || '—'} />
                <Row label="responseTime"  value={result.responseTime ? fmtMs(result.responseTime) : '—'} />
              </Section>

              <Section title="Raw Response">
                <div className="mb-4 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">{JSON.stringify(result, null, 2)}</div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-end border-t border-[#f3f4f6] px-[22px] py-3.5">
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── HISTORY SECTION ───────────────────────────────────────────────────────
function HistorySection({
  counts, totalRevenue, filter, setFilter, search, setSearch,
  dateFrom, setDateFrom, dateTo, setDateTo,
  activePresetKey, setActivePresetKey, filtered,
  selected, toggleOne, toggleAll, sortKey, sortDir, toggleSort,
  setDetail, openQueryForOrder, openConfirmForOrder, doDelete,
}) {
  const successRate = counts.ALL ? Math.round(counts.PAID / counts.ALL * 100) : 0

  return (
    <>
      {/* Title + status filter tabs */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-[-0.3px] text-[#111827]">Lịch sử giao dịch</h1>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {filtered.length} giao dịch{filter !== 'ALL' && ` · "${FILTERS.find(f => f.key === filter)?.label}"`}
          </p>
        </div>

        {/* Status tabs — desktop */}
        <nav className="hidden flex-wrap gap-0.5 md:flex">
          {FILTERS.map(f => (
            <button key={f.key}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
                filter === f.key ? 'bg-[#ae0070] text-white' : 'bg-transparent text-[#6b7280] hover:bg-[#fff0f7] hover:text-[#ae0070]'
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

        {/* Status select — mobile */}
        <div className="relative w-full md:hidden">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full appearance-none rounded-lg border border-[rgba(174,0,112,0.1)] bg-[#fff0f7] px-3.5 py-2 pr-8 text-[13px] font-semibold text-[#ae0070]">
            {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label} ({counts[f.key]})</option>)}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#ae0070]"><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/70 bg-white/88 px-4 py-2.5 shadow-[0_2px_20px_rgba(174,0,112,0.04)] backdrop-blur-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {DATE_PRESETS.map(p => {
            const active = activePresetKey === p.key
            return (
              <button key={p.key}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  active ? 'bg-[#ae0070] text-white' : 'bg-white/70 text-[#6b7280] hover:bg-[#fff0f7] hover:text-[#ae0070]'
                }`}
                onClick={() => { const [from,to]=p.range(); setDateFrom(from); setDateTo(to); setActivePresetKey(p.key) }}
              >
                {p.label}
              </button>
            )
          })}
          <DateRangePicker dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} setActivePresetKey={setActivePresetKey} />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pointer-events-none absolute left-[11px] text-[#6b7280]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Tìm kiếm..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-[160px] rounded-[10px] border border-[rgba(174,0,112,0.1)] bg-white/70 py-[7px] pl-[34px] pr-8 text-[13px] text-[#111827] transition-all focus:border-[#ae0070] focus:bg-white focus:shadow-[0_0_0_3px_rgba(174,0,112,0.08)] focus:w-[220px]" />
            {search && <button className="absolute right-[10px] text-xs leading-none text-[#6b7280]" onClick={() => setSearch('')}>✕</button>}
          </div>
          {selected.size > 0 && (
            <button className="flex-shrink-0 whitespace-nowrap rounded-[9px] bg-[#dc2626] px-3.5 py-[7px] text-[13px] font-bold text-white transition-all hover:bg-[#b91c1c]" onClick={() => doDelete([...selected])}>
              Xóa ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Stat cards — based on scoped (date+search), not further filtered by status tab */}
      <div className="mb-5 grid grid-cols-2 gap-4 max-md:gap-3 md:grid-cols-4">
        <StatCard label="Doanh thu"   value={`${fmt(totalRevenue)} ₫`} color="#ae0070" sub={`${counts.PAID} giao dịch thành công`} />
        <StatCard label="Thành công"  value={`${counts.PAID} GD`}      color="#16a34a"  sub={`Tỉ lệ ${successRate}%`} />
        <StatCard label="Thất bại / Hết hạn" value={`${counts.FAILED + counts.EXPIRED} GD`} color="#dc2626" sub={`${counts.FAILED} thất bại · ${counts.EXPIRED} hết hạn`} />
        <StatCard label="Tổng đơn"    value={`${counts.ALL} GD`}       color="#374151"  sub={`${counts.PENDING} đang chờ xử lý`} />
      </div>

      {/* Table / card list */}
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/92 shadow-[0_4px_30px_rgba(0,0,0,0.04)] backdrop-blur-[16px]">
        {filtered.length === 0 ? (
          <div className="px-6 py-[72px] text-center">
            <div className="mb-3 text-4xl">🔍</div>
            <div className="text-[15px] font-semibold text-[#6b7280]">Không tìm thấy giao dịch nào</div>
            <div className="mt-1 text-xs text-[#9ca3af]">Thử thay đổi bộ lọc hoặc khoảng thời gian</div>
          </div>
        ) : (
          <>
            {/* Desktop table ≥1024px */}
            <div className="hidden max-h-[65vh] overflow-auto lg:block">
              <table className="w-full min-w-[980px] table-auto border-collapse text-[13.5px]">
                <colgroup>
                  <col className="w-[36px]" /><col className="w-[110px]" /><col className="w-[90px]" />
                  <col className="w-[24%]"  /><col className="w-[110px]" /><col className="w-[110px]" />
                  <col className="w-[70px]" /><col className="w-[70px]" /><col className="w-[130px]" /><col className="w-[90px]" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#f5edf2]">
                    <th className="whitespace-nowrap border-b border-[rgba(174,0,112,0.08)] px-4 py-[13px] text-center text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                      <input type="checkbox"
                        checked={selected.size > 0 && selected.size === filtered.length}
                        ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)}
                        onChange={toggleAll} />
                    </th>
                    <SortableTh label="Trạng thái" sortKey="status"     currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Số tiền"    sortKey="amount"     currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Nội dung"   sortKey="orderInfo"  currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Mã đơn"     sortKey="orderId"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Mã GD MoMo" sortKey="transId"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Hình thức"  sortKey="payType"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Result"     sortKey="resultCode" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Thời gian"  sortKey="createdAt"  currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className="whitespace-nowrap border-b border-[rgba(174,0,112,0.08)] px-4 py-[13px] text-center text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const sm  = STATUS_META[o.status] || STATUS_META.PENDING
                    const sel = selected.has(o.orderId)
                    return (
                      <tr key={o.orderId}
                        className={`cursor-pointer border-b border-[rgba(174,0,112,0.03)] transition-colors last:border-b-0 hover:bg-white/60 ${sel ? 'bg-[rgba(174,0,112,0.05)]' : ''}`}
                        onClick={() => setDetail(o.orderId)}
                      >
                        <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={sel} onChange={() => toggleOne(o.orderId)} />
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[20px] px-[11px] py-[5px] text-xs font-bold" style={{ background:sm.bg, color:sm.color }}>
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background:sm.dot }} />
                            {sm.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-sm font-extrabold text-[#ae0070]">{fmt(o.amount)} ₫</td>
                        <td className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle text-[#374151]" title={o.orderInfo}>{o.orderInfo || '—'}</td>
                        <td className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle font-mono text-xs text-[#4b5563]">{o.orderId}</td>
                        <td className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3.5 align-middle font-mono text-xs text-[#4b5563]">{o.transId || '—'}</td>
                        <td className="px-4 py-3.5 align-middle">
                          {o.payType ? <span className="rounded-md bg-black/[0.06] px-[9px] py-[3px] text-xs font-semibold">{o.payType}</span> : <span className="text-[#9ca3af]">—</span>}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          {o.resultCode !== undefined
                            ? <span className="font-mono text-[13px] font-bold" style={{ color: o.resultCode===0?'#16a34a':'#dc2626' }}>{o.resultCode===0?'✓ 0':`✗ ${o.resultCode}`}</span>
                            : <span className="text-[#9ca3af]">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-xs text-[#6b7280]">
                          <div>{fmtDate(o.createdAt)}</div>
                          {o.paidAt && <div className="mt-0.5 text-[#16a34a]">✓ {fmtDate(o.paidAt)}</div>}
                        </td>
                        <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <button className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#6366f1] transition-all hover:bg-[#eef2ff] hover:text-[#4f46e5]" onClick={() => openQueryForOrder(o.orderId)} title="Tra cứu MoMo API">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
                            </button>
                            <button className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#9ca3af] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]" onClick={() => doDelete([o.orderId])} title="Xóa">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                            {o.resultCode === 9000 && (
                              <button className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white" onClick={() => openConfirmForOrder(o.orderId, o.amount)} title="Xác nhận / Huỷ (9000)">
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

            {/* Mobile card list <1024px */}
            <div className="lg:hidden">
              <div className="flex items-center gap-2.5 border-b border-[rgba(174,0,112,0.06)] bg-[#f5edf2] px-4 py-2.5">
                <input type="checkbox"
                  checked={selected.size > 0 && selected.size === filtered.length}
                  ref={el => el && (el.indeterminate = selected.size > 0 && selected.size < filtered.length)}
                  onChange={toggleAll} />
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Chọn tất cả · {filtered.length} giao dịch</span>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {filtered.map(o => (
                  <OrderCard key={o.orderId} o={o} selected={selected.has(o.orderId)}
                    onToggle={toggleOne} onOpenDetail={setDetail}
                    onQuery={openQueryForOrder} onDelete={doDelete}
                    onConfirm={openConfirmForOrder} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── CREATE SECTION ────────────────────────────────────────────────────────
function CreateSection() {
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-[-0.3px] text-[#111827]">Tạo giao dịch</h1>
          <p className="mt-0.5 text-xs text-[#6b7280]">Tạo thanh toán mới qua P2P hoặc quét mã QR (Scan)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-white/70 px-3.5 py-[7px] text-[13px] font-semibold text-[#6b7280] transition-all hover:border-[#ae0070] hover:text-[#ae0070]"
            onClick={() => setReloadKey(k => k+1)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v6h-6"/></svg>
            Tải lại
          </button>
          <button
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[#ae0070] px-3.5 py-[7px] text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(174,0,112,0.25)] transition-all hover:-translate-y-px hover:bg-[#91005d]"
            onClick={openCreateTransactionPopup}
          >
            Mở trang tạo giao dịch ↗
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_4px_30px_rgba(0,0,0,0.04)]" style={{ height:'calc(100vh - 190px)' }}>
        <iframe key={reloadKey} src="/admin/create-transaction" title="Tạo giao dịch" className="h-full w-full border-0" />
      </div>
    </>
  )
}

// ─── LOOKUP SECTION ────────────────────────────────────────────────────────
function LookupSection({ orderId, setOrderId, loading, result, error, onQuery }) {
  const copy  = text => navigator.clipboard?.writeText(String(text))
  const rc    = result?.resultCode
  const isOk  = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[19px] font-extrabold tracking-[-0.3px] text-[#111827]">Tra cứu giao dịch</h1>
        <p className="mt-0.5 text-xs text-[#6b7280]">Gọi trực tiếp đến MoMo server để lấy trạng thái thực tế theo mã đơn (orderId)</p>
      </div>

      <div className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-white/70 bg-white/92 shadow-[0_4px_30px_rgba(0,0,0,0.04)] backdrop-blur-[16px]">
        <div className="border-b border-[rgba(174,0,112,0.06)] px-[22px] py-4">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Order ID</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-[10px] border-[1.5px] border-[rgba(174,0,112,0.1)] bg-white px-3.5 py-2.5 font-mono text-sm text-[#111827] transition-all focus:border-[#6366f1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
              type="text" placeholder="Nhập mã đơn hàng (orderId)..."
              value={orderId} onChange={e => setOrderId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && onQuery()}
            />
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#4f46e5] px-[18px] py-2.5 text-[13px] font-bold text-white transition-all hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onQuery} disabled={loading || !orderId.trim()}
            >
              {loading
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
              {loading ? 'Đang tra cứu...' : 'Tra cứu'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-[22px] my-3 flex items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[#dc2626]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="px-6 py-16 text-center">
            <div className="mb-3 text-4xl">🔎</div>
            <div className="text-[14px] font-semibold text-[#6b7280]">Nhập mã đơn để tra cứu</div>
            <div className="mt-1 text-xs text-[#9ca3af]">Kết quả sẽ hiển thị ngay sau khi truy vấn</div>
          </div>
        )}

        {result && (
          <>
            <div className="flex flex-col gap-1 px-[22px] py-4" style={{ background: isOk?'#f0fdf4':'#fff5f5' }}>
              <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: isOk?'#16a34a':'#dc2626' }}>{isOk?'✓':'✗'} {rc}</div>
              <div className="text-sm font-bold text-[#374151]">{rcDesc}</div>
              {result.message && <div className="text-xs text-[#6b7280]">{result.message}</div>}
            </div>

            <Section title="Thông tin giao dịch">
              <Row label="orderId"      value={result.orderId}   mono copy={() => copy(result.orderId)} />
              <Row label="requestId"    value={result.requestId} mono copy={() => copy(result.requestId)} />
              <Row label="transId"      value={result.transId?.toString()||'—'} mono />
              <Row label="partnerCode"  value={result.partnerCode} mono />
              <Row label="amount"        value={result.amount !== undefined ? `${fmt(result.amount)} ₫` : '—'} />
              <Row label="payType"       value={result.payType || '—'} />
              <Row label="paymentOption" value={result.paymentOption || '—'} />
              <Row label="responseTime"  value={result.responseTime ? fmtMs(result.responseTime) : '—'} />
            </Section>

            <Section title="Raw Response">
              <div className="mb-4 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">{JSON.stringify(result, null, 2)}</div>
            </Section>
          </>
        )}
      </div>
    </>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
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
  const [dateFrom,        setDateFrom]        = useState(() => DATE_PRESETS.find(p=>p.key==='thisWeek').range()[0])
  const [dateTo,          setDateTo]          = useState(() => DATE_PRESETS.find(p=>p.key==='thisWeek').range()[1])
  const [activePresetKey, setActivePresetKey] = useState('thisWeek')
  const [sortKey,         setSortKey]         = useState('createdAt')
  const [sortDir,         setSortDir]         = useState('desc')
  const [selected,        setSelected]        = useState(new Set())
  const [detail,          setDetail]          = useState(null)

  const [queryOrderId,    setQueryOrderId]    = useState('')
  const [queryLoading,    setQueryLoading]    = useState(false)
  const [queryResult,     setQueryResult]     = useState(null)
  const [queryError,      setQueryError]      = useState(null)
  const [queryModal,      setQueryModal]      = useState(false)

  const [confirmModal,    setConfirmModal]    = useState(false)
  const [confirmOrderId,  setConfirmOrderId]  = useState('')
  const [confirmAmount,   setConfirmAmount]   = useState(0)
  const [confirmLoading,  setConfirmLoading]  = useState(false)
  const [confirmResult,   setConfirmResult]   = useState(null)
  const [confirmError,    setConfirmError]    = useState(null)

  const ordersRef   = useRef([])
  const fetchingRef = useRef(false)
  const selectedRef = useRef(new Set())
  const detailRef   = useRef(null)
  const filteredRef = useRef([])

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
    fetchingRef.current = true; setFetching(true)
    try {
      const res  = await fetch('/api/momo/orders')
      if (res.status === 401) { setAuthed(false); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const raw  = data.orders || []
      setOrders(raw); setLastSync(new Date())
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
      fetchingRef.current = false; setFetching(false)
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
      if (e.key === 'Escape') { setDetail(null); setConfirmModal(false); setSidebarOpen(false) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const goToSection = useCallback(key => { setActiveSection(key); setSidebarOpen(false) }, [])

  const doMomoQuery = useCallback(async (idArg) => {
    const id = (idArg ?? queryOrderId).trim()
    if (!id) return
    setQueryLoading(true); setQueryResult(null); setQueryError(null)
    try {
      const res  = await fetch('/api/momo/query', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderId:id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      setQueryResult(data)
    } catch (err) {
      setQueryError(err.message || 'Lỗi không xác định')
    } finally {
      setQueryLoading(false)
    }
  }, [queryOrderId])

  const openQueryForOrder = useCallback(orderId => {
    setQueryOrderId(orderId); setQueryResult(null); setQueryError(null)
    setQueryModal(true); doMomoQuery(orderId)
  }, [doMomoQuery])

  const openConfirmForOrder = useCallback((orderId, amount) => {
    setConfirmOrderId(orderId); setConfirmAmount(amount)
    setConfirmResult(null); setConfirmError(null); setConfirmModal(true)
  }, [])

  const doMomoConfirm = async (requestType) => {
    setConfirmLoading(true); setConfirmResult(null); setConfirmError(null)
    try {
      const res  = await fetch('/api/momo/confirm', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderId:confirmOrderId, amount:confirmAmount, requestType }) })
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

  // ─── DATA PIPELINE (FIXED LOGIC) ───────────────────────────────────────
  // Step 1: normalize statuses
  const displayed = useMemo(() => orders.map(normalizeStatus), [orders])

  // Step 2: apply search + date range → "scoped" (used for stat cards)
  const scoped = useMemo(() => displayed
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
      const dayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (dateFrom && dayStr < dateFrom) return false
      if (dateTo   && dayStr > dateTo)   return false
      return true
    }), [displayed, search, dateFrom, dateTo])

  // Step 3: counts based on scoped (reflects current search+date, not status filter)
  const counts = useMemo(() => ({
    ALL:     scoped.length,
    PAID:    scoped.filter(o => o.status === 'PAID').length,
    FAILED:  scoped.filter(o => o.status === 'FAILED').length,
    PENDING: scoped.filter(o => o.status === 'PENDING').length,
    EXPIRED: scoped.filter(o => o.status === 'EXPIRED').length,
  }), [scoped])

  // Step 4: stat cards use scoped revenue (all PAID within date+search)
  const totalRevenue = useMemo(() => scoped
    .filter(o => o.status === 'PAID')
    .reduce((s, o) => s + parseInt(o.amount || 0), 0), [scoped])

  // Step 5: table = scoped + status filter + sort
  const filtered = useMemo(() => scoped
    .filter(o => filter === 'ALL' || o.status === filter)
    .sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'createdAt' || sortKey === 'paidAt') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      } else if (sortKey === 'amount') {
        av = parseInt(av || 0); bv = parseInt(bv || 0)
      } else {
        av = (av??'').toString().toLowerCase(); bv = (bv??'').toString().toLowerCase()
      }
      if (av < bv) return sortDir==='asc' ? -1 : 1
      if (av > bv) return sortDir==='asc' ?  1 : -1
      return 0
    }), [scoped, filter, sortKey, sortDir])

  const detailOrder = detail ? displayed.find(o => o.orderId === detail) : null

  useEffect(() => { filteredRef.current = filtered }, [filtered])

  const toggleOne = useCallback(id => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected(s => {
      const ids = filteredRef.current.map(o => o.orderId)
      return s.size === ids.length ? new Set() : new Set(ids)
    })
  }, [])
  const toggleSort = useCallback(key => {
    setSortKey(prevKey => {
      if (prevKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prevKey }
      setSortDir('desc')
      return key
    })
  }, [])

  const doDelete = useCallback(async (ids) => {
    if (!confirm(`Xóa ${ids.length} đơn?\nKhông thể hoàn tác!`)) return
    try {
      await Promise.all(ids.map(id => fetch('/api/momo/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderId:id }) })))
      setDetail(d => (d && ids.includes(d)) ? null : d)
      setSelected(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n })
      await fetchOrders({ force: true })
    } catch (err) {
      console.error(err); alert('Lỗi khi xóa')
    }
  }, [fetchOrders])

  async function login() {
    setPwError(false)
    try {
      const res = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password }) })
      if (res.ok) { setAuthed(true); setPassword('') } else { setPwError(true); setPassword('') }
    } catch { setPwError(true) }
  }

  const logout = useCallback(() => {
    if (!confirm('Đăng xuất khỏi trang quản trị?')) return
    fetch('/api/admin/session', { method:'DELETE' }).finally(() => setAuthed(false))
  }, [])

  // ─── LOADING STATE ──────────────────────────────────────────────────────
  if (checkingSession) return (
    <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[Inter,sans-serif] flex items-center justify-center">
      <Orbs />
      <div className="relative z-10 h-2 w-2 rounded-full bg-[#f59e0b]" style={{ animation:'pulse-dot 0.8s infinite' }} />
    </div>
  )

  // ─── LOGIN STATE ────────────────────────────────────────────────────────
  if (!authed) return (
    <>
      <Head>
        <title>Admin · Đăng nhập</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <link rel="icon" type="image/png" href="/Admin.png" />
      </Head>
      <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[Inter,sans-serif]">
        <Orbs />
        <div className="relative z-10 flex min-h-screen items-center justify-center p-5">
          <div className="w-full max-w-[400px] rounded-3xl bg-white/95 px-9 py-10 text-center shadow-[0_24px_60px_rgba(174,0,112,0.1),0_0_0_1px_rgba(255,255,255,0.8)] backdrop-blur-[30px]">
            <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-[rgba(174,0,112,0.1)] bg-white shadow-[0_4px_12px_rgba(174,0,112,0.08)]">
              <img src="/Main.png" alt="Logo" className="h-11 w-11 object-contain" />
            </div>
            <h1 className="mb-5 text-[22px] font-extrabold tracking-[-0.5px] text-[#111827]">Nhập mật khẩu để tiếp tục</h1>
            <div className="text-left">
              <input
                type="password" value={password} autoFocus
                onChange={e => { setPassword(e.target.value); setPwError(false) }}
                onKeyDown={e => e.key==='Enter' && login()}
                placeholder="Mật khẩu..."
                className={`mb-3 w-full rounded-xl border-[1.5px] bg-[rgba(245,237,242,0.5)] px-4 py-[13px] font-[Inter,sans-serif] text-[15px] text-[#111827] transition-all focus:border-[#ae0070] focus:bg-white focus:shadow-[0_0_0_4px_rgba(174,0,112,0.07)] ${
                  pwError ? 'border-[#dc2626] bg-[#fff5f5]' : 'border-[rgba(174,0,112,0.15)]'
                }`}
              />
            </div>
            {pwError && <p className="mb-[14px] text-[13px] font-semibold text-[#dc2626]">⚠ Mật khẩu không chính xác</p>}
            <button
              className="w-full rounded-xl bg-[#ae0070] py-[13px] font-[Inter,sans-serif] text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.2)] transition-all hover:-translate-y-px hover:bg-[#91005d] hover:shadow-[0_8px_24px_rgba(174,0,112,0.25)]"
              onClick={login}
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </div>
    </>
  )

  const currentNav = NAV_ITEMS.find(n => n.key === activeSection)

  // ─── MAIN DASHBOARD ─────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>ADMIN · {currentNav?.label || 'Dashboard'}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[Inter,sans-serif] text-[#111827]">
        <Orbs />

        {/* Detail Modal */}
        {detailOrder && (
          <DetailModal
            order={detailOrder}
            onClose={() => setDetail(null)}
            onDelete={id => doDelete([id])}
            onQuery={id => openQueryForOrder(id)}
            onConfirm={(id, amount) => { setDetail(null); openConfirmForOrder(id, amount) }}
          />
        )}

        {/* Confirm Modal */}
        {confirmModal && (
          <ConfirmModal
            orderId={confirmOrderId} amount={confirmAmount}
            loading={confirmLoading} result={confirmResult} error={confirmError}
            onConfirm={() => doMomoConfirm('capture')}
            onCancel={() => doMomoConfirm('cancel')}
            onClose={() => { setConfirmModal(false); setConfirmResult(null); setConfirmError(null) }}
          />
        )}

        {/* Query Result Modal (Tra cứu MoMo) */}
        {queryModal && (
          <QueryResultModal
            orderId={queryOrderId}
            loading={queryLoading} result={queryResult} error={queryError}
            stacked={!!detailOrder}
            onClose={() => { setQueryModal(false); setQueryResult(null); setQueryError(null) }}
          />
        )}

        <div className="relative z-[1] flex min-h-screen">
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeSection={activeSection}
          goToSection={goToSection}
          pendingCount={counts.PENDING}
          fetching={fetching}
          lastSync={lastSync}
          logout={logout}
        />

          {/* Main content */}
          <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[252px]">
            {/* Mobile top bar */}
            <header className="sticky inset-x-0 top-0 z-[200] flex flex-shrink-0 items-center gap-3 border-b border-[rgba(174,0,112,0.08)] bg-white/88 px-4 py-3 shadow-[0_1px_16px_rgba(174,0,112,0.06)] backdrop-blur-[20px] lg:hidden">
              <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[#ae0070] transition-all hover:bg-[#fff0f7]" onClick={() => setSidebarOpen(true)}>
                <IconMenu className="h-5 w-5" />
              </button>
              <span className="truncate text-[15px] font-extrabold text-[#111827]">{currentNav?.label}</span>
              <span className={`ml-auto h-2 w-2 flex-shrink-0 rounded-full transition-colors duration-300 ${fetching ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`} style={fetching ? { animation:'pulse-dot 0.8s infinite' } : undefined} />
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
                  orderId={queryOrderId} setOrderId={setQueryOrderId}
                  loading={queryLoading} result={queryResult} error={queryError}
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