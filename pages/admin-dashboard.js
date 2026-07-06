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

// Trang giờ chỉ còn 1 khu vực nội dung duy nhất (Lịch sử giao dịch) nên sidebar
// không cần menu điều hướng để chọn mục nữa — Lịch sử giao dịch luôn hiển thị.
// Nút "Tra cứu giao dịch" đã chuyển thành 1 thanh cố định ở mép dưới màn hình
// (xem LookupBar), luôn hiện sẵn để bấm vào bất kỳ lúc nào.
const PAGE_TITLE = 'Lịch sử giao dịch'

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

// ─── TOP BAR (thay cho sidebar đã bỏ) ──────────────────────────────────────
// Trang chỉ còn 1 khu vực nội dung duy nhất (Lịch sử giao dịch) nên không cần
// sidebar/menu điều hướng nữa — mọi thứ (logo, trạng thái đồng bộ, số đơn
// đang chờ, nút đăng xuất) gộp vào 1 thanh ngang cố định trên cùng.
const TopBar = memo(function TopBar({ pendingCount, fetching, lastSync, logout }) {
  return (
    <header className="sticky inset-x-0 top-0 z-[200] flex flex-shrink-0 items-center gap-4 border-b border-[rgba(174,0,112,0.08)] bg-white/90 px-6 py-3.5 shadow-[0_1px_16px_rgba(174,0,112,0.05)] backdrop-blur-[20px] max-md:px-4 max-md:py-3">
      <div className="flex items-center gap-2.5">
        <img src="/Main.png" alt="" className="h-9 w-9 flex-shrink-0 rounded-[10px] object-contain shadow-[0_2px_8px_rgba(174,0,112,0.15)]" />
        <div className="flex flex-col leading-tight">
          <span className="whitespace-nowrap text-[14.5px] font-extrabold tracking-[-0.3px] text-[#ae0070]">MoMo Admin</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-[#9ca3af]">
            <span className={`h-[6px] w-[6px] flex-shrink-0 rounded-full transition-colors duration-300 ${fetching ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`} style={fetching ? { animation:'pulse-dot 0.8s infinite' } : undefined} />
            {lastSync ? `Đồng bộ ${lastSync.toLocaleTimeString('vi-VN')}` : 'Đang kết nối…'}
          </span>
        </div>
      </div>

      {pendingCount > 0 && (
        <span className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[rgba(217,119,6,0.15)] bg-[#fef3c7] px-3 py-[7px] text-[12px] font-bold text-[#d97706] max-sm:hidden">
          <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-[#f59e0b]" />
          {pendingCount} đơn đang chờ xử lý
        </span>
      )}

      <button
        className="ml-auto flex flex-shrink-0 items-center gap-2 rounded-[10px] border border-[rgba(174,0,112,0.1)] bg-white px-3.5 py-2 text-[13px] font-bold text-[#6b7280] shadow-[0_1px_4px_rgba(174,0,112,0.04)] transition-all hover:border-[rgba(220,38,38,0.25)] hover:bg-[#fee2e2] hover:text-[#dc2626]"
        onClick={logout}
        title="Đăng xuất"
      >
        <IconLogout className="h-4 w-4 flex-shrink-0" />
        <span className="max-sm:hidden">Đăng xuất</span>
      </button>
    </header>
  )
})

// ─── ICON COMPONENTS ───────────────────────────────────────────────────────
function IconHistory(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg> }
function IconPlus(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> }
function IconSearch(props)  { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg> }
function IconLogout(props)  { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function IconMenu(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg> }
function IconX(props)       { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconRefresh(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg> }
function IconMinus(props)      { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function IconSquare(props)     { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg> }
function IconRestoreWin(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="7.5" y="3.5" width="13" height="13" rx="2"/><path d="M16.5 16.5H5.5a2 2 0 0 1-2-2V5.5"/></svg> }

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
          {o.storeName && <div className="mt-0.5 truncate text-[11px] font-medium text-[#9ca3af]">🏪 {o.storeName}</div>}
          <div className="mt-0.5 font-mono text-[11px] text-[#9ca3af]">{o.orderId}</div>
          <div className="mt-0.5 text-[11px] text-[#9ca3af]">{fmtDate(o.createdAt)}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[#6366f1] transition-all hover:bg-[#eef2ff] active:scale-90"
            onClick={() => onQuery(o.orderId)}
            title="Tra cứu"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[#9ca3af] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626] active:scale-90"
            onClick={() => onDelete([o.orderId])}
            title="Xóa"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
          {o.resultCode === 9000 && (
            <button
              className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a] active:scale-90"
              onClick={() => onConfirm(o.orderId, o.amount)}
              title="Xác nhận 9000"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
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

// ─── FLOATING WINDOW (cửa sổ nổi, kéo-thả được) ────────────────────────────
// Thay cho modal cũ (nền tối full-screen chặn thao tác) — giờ mỗi popup
// (Chi tiết / Tra cứu / Xác nhận) là 1 "cửa sổ" nổi lơ lửng trên dashboard,
// đổ bóng mềm kiểu bong bóng, tự nâng lên trên (bring-to-front) khi bấm vào,
// và có thể kéo đi bất kỳ đâu qua thanh header — giống hệt tinh thần cửa sổ
// nổi đang xây ở create-transaction.js, áp dụng lại cho admin-dashboard.js.
let __floatWinTopZ = 300
function bringFloatWinToFront() { return ++__floatWinTopZ }

// Mỗi lần có cửa sổ mới mở, lệch nhẹ vị trí so với cửa sổ trước để tránh
// chồng khít 100% lên nhau (hiệu ứng "xếp chồng" như cửa sổ thật).
let __floatWinCascade = 0
function nextCascadeOffset() {
  __floatWinCascade = (__floatWinCascade + 1) % 6
  return { x: __floatWinCascade * 26, y: __floatWinCascade * 22 }
}

// ─── WINDOW REGISTRY (hệ đa cửa sổ thật) ───────────────────────────────────
// Sổ đăng ký toàn cục, độc lập với cây React của từng FloatingWindow — mỗi
// cửa sổ tự "đăng ký" mình khi mount và "gỡ đăng ký" khi đóng hẳn. Khi 1 cửa
// sổ bấm "thu nhỏ", nó chỉ cập nhật cờ minimized trong registry (chứ không
// unmount), rồi FloatingWinDock (thanh dock cố định dưới màn hình) render lại
// theo registry này để hiện icon "khôi phục" cho từng cửa sổ đang thu nhỏ.
// Nhờ tách registry ra ngoài, nhiều cửa sổ (Chi tiết / Tra cứu / Xác nhận /
// Xác nhận xoá...) có thể tồn tại song song, độc lập, đúng nghĩa multi-window.
const __floatWinRegistry  = new Map()
const __floatWinListeners = new Set()
function __notifyFloatWin() { __floatWinListeners.forEach(fn => fn()) }
function registerFloatWin(id, meta) { __floatWinRegistry.set(id, meta); __notifyFloatWin() }
function updateFloatWin(id, patch) {
  const cur = __floatWinRegistry.get(id)
  if (!cur) return
  __floatWinRegistry.set(id, { ...cur, ...patch })
  __notifyFloatWin()
}
function unregisterFloatWin(id) { __floatWinRegistry.delete(id); __notifyFloatWin() }
let __floatWinIdSeq = 0
function useFloatWinList() {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const fn = () => forceTick(t => t + 1)
    __floatWinListeners.add(fn)
    return () => __floatWinListeners.delete(fn)
  }, [])
  return Array.from(__floatWinRegistry.entries()).map(([id, meta]) => ({ id, ...meta }))
}

// Dock cố định dưới màn hình — chỉ hiện khi có ít nhất 1 cửa sổ đang thu nhỏ.
// Bấm vào 1 "thẻ" trong dock sẽ khôi phục đúng cửa sổ đó về vị trí cũ.
function FloatingWinDock() {
  const wins = useFloatWinList().filter(w => w.minimized)
  if (!wins.length) return null
  return (
    <div className="fixed inset-x-0 bottom-[76px] z-[500] flex flex-nowrap items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ animation: 'fadein 0.15s ease', justifyContent: wins.length > 3 ? 'flex-start' : 'center' }}>
      {wins.map(w => (
        <button
          key={w.id}
          onClick={w.onRestore}
          className="group flex max-w-[240px] flex-shrink-0 items-center gap-2 rounded-full border border-[rgba(174,0,112,0.12)] bg-white/95 py-2 pl-2 pr-3.5 shadow-[0_10px_30px_rgba(23,7,20,0.18),0_0_0_1px_rgba(174,0,112,0.05)] backdrop-blur-[16px] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(23,7,20,0.22)] active:scale-95"
          title="Khôi phục cửa sổ"
        >
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full" style={{ background: w.iconBg || '#fff0f7', color: w.iconColor || '#ae0070' }}>
            <IconRestoreWin className="h-3 w-3" />
          </span>
          <span className="truncate text-[12.5px] font-bold text-[#374151]">{w.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── LOOKUP BAR (thanh cố định ở đáy màn hình) ──────────────────────────────
// Luôn hiện sẵn, không cần bấm vào bất kỳ menu nào trước — bấm vào nút "Tra
// cứu giao dịch" ở đây sẽ mở 1 cửa sổ Tra cứu MoMo (LookupWindow) nổi lên.
function LookupBar({ onOpen }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[450] flex justify-center border-t border-[rgba(174,0,112,0.1)] bg-white/92 px-4 py-2.5 shadow-[0_-6px_24px_rgba(174,0,112,0.08)] backdrop-blur-[20px]">
      <button
        onClick={onOpen}
        className="flex items-center gap-2 rounded-full bg-[#ae0070] px-6 py-2.5 text-[13.5px] font-bold text-white shadow-[0_6px_20px_rgba(174,0,112,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#91005d] hover:shadow-[0_8px_24px_rgba(174,0,112,0.32)] active:scale-95"
      >
        <IconSearch className="h-4 w-4 flex-shrink-0" />
        Tra cứu giao dịch
      </button>
    </div>
  )
}

function FloatingWindow({ title, subtitle, icon, iconBg = '#fff0f7', iconColor = '#ae0070', onClose, children, footer, width = 560, taskbarLabel, cascade = true }) {
  const [pos,       setPos]       = useState(null)
  const [z,         setZ]         = useState(0)
  const [dragging,  setDragging]  = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const dragState  = useRef({ startX: 0, startY: 0, origX: 0, origY: 0 })
  const cascadeRef = useRef(null)
  const prevGeom   = useRef(null) // { pos } trước khi phóng to, để khôi phục lại
  const winId      = useRef(null)
  // cascade=false (dùng cho cửa sổ Chi tiết) → luôn canh đúng giữa màn hình,
  // không lệch theo hiệu ứng xếp chồng, để cửa sổ không trôi dần xuống dưới/
  // phải qua mỗi lần mở (gây cảm giác "mất chữ" dù phía trên còn thừa chỗ trống).
  if (cascadeRef.current === null) cascadeRef.current = cascade ? nextCascadeOffset() : { x: 0, y: 0 }
  if (winId.current === null) winId.current = `fw-${++__floatWinIdSeq}`

  // Canh giữa màn hình lúc mount (1 lần), cộng thêm lệch cascade để nhiều
  // cửa sổ mở cùng lúc không đè khít lên nhau.
  useEffect(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth  : 1200
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    const winW = Math.min(width, w - 32)
    const estH = Math.min(h * 0.85, 640)
    const baseX = Math.max(16, (w - winW) / 2)
    const baseY = Math.max(16, (h - estH) / 2)
    setPos({ x: baseX + cascadeRef.current.x, y: baseY + cascadeRef.current.y })
    setZ(bringFloatWinToFront())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Đăng ký cửa sổ vào registry chung khi mount, gỡ khi đóng hẳn — đây là
  // "nguồn sự thật" để FloatingWinDock biết cửa sổ nào đang bị thu nhỏ.
  useEffect(() => {
    registerFloatWin(winId.current, {
      label: taskbarLabel || 'Cửa sổ', iconBg, iconColor, minimized: false,
      onRestore: () => { setMinimized(false); setZ(bringFloatWinToFront()) },
    })
    return () => unregisterFloatWin(winId.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { updateFloatWin(winId.current, { minimized }) }, [minimized])

  function clamp(x, y) {
    const w = typeof window !== 'undefined' ? window.innerWidth  : 1200
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    return {
      x: Math.min(Math.max(x, -width + 120), w - 80),
      y: Math.min(Math.max(y, 0), h - 60),
    }
  }

  function onHeaderPointerDown(e) {
    if (e.target.closest('button')) return // không kéo khi bấm các nút điều khiển
    if (maximized) return // đang phóng to thì không kéo (bấm nút khôi phục trước)
    setZ(bringFloatWinToFront())
    setDragging(true)
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }
  function onPointerMove(e) {
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPos(clamp(dragState.current.origX + dx, dragState.current.origY + dy))
  }
  function onPointerUp() {
    setDragging(false)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }
  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleMaximize() {
    setZ(bringFloatWinToFront())
    if (!maximized) {
      prevGeom.current = pos
      setMaximized(true)
    } else {
      setMaximized(false)
      if (prevGeom.current) setPos(prevGeom.current)
    }
  }
  function minimize() {
    setMinimized(true)
  }

  if (!pos) return null    // chờ tính vị trí xong mới hiện, tránh nháy ở góc (0,0)
  if (minimized) return null // đang thu nhỏ — hiện dưới dạng thẻ trong FloatingWinDock

  return (
    <div
      className={`fixed flex flex-col overflow-hidden rounded-[20px] bg-white ${maximized ? '' : 'max-h-[88vh]'}`}
      style={maximized ? {
        left: 16, top: 16, right: 16, bottom: 16,
        width: 'auto', height: 'auto',
        zIndex: z,
        boxShadow: '0 24px 70px rgba(23,7,20,0.20), 0 8px 22px rgba(174,0,112,0.10), 0 0 0 1px rgba(174,0,112,0.07)',
        transition: 'left 0.2s ease, top 0.2s ease, right 0.2s ease, bottom 0.2s ease',
        animation: 'floatWinIn 0.22s cubic-bezier(0.34,1.35,0.64,1) both',
      } : {
        left: pos.x, top: pos.y,
        width: `min(${width}px, calc(100vw - 32px))`,
        zIndex: z,
        boxShadow: dragging
          ? '0 46px 110px rgba(23,7,20,0.38), 0 10px 30px rgba(174,0,112,0.18), 0 0 0 1px rgba(174,0,112,0.14)'
          : '0 24px 70px rgba(23,7,20,0.20), 0 8px 22px rgba(174,0,112,0.10), 0 0 0 1px rgba(174,0,112,0.07)',
        transition: dragging ? 'none' : 'box-shadow 0.25s ease, transform 0.15s ease',
        animation: 'floatWinIn 0.28s cubic-bezier(0.34,1.35,0.64,1) both',
      }}
      onMouseDownCapture={() => setZ(bringFloatWinToFront())}
    >
      {/* Header — kéo bằng vùng này, double-click để phóng to/khôi phục */}
      <div
        className={`flex flex-shrink-0 select-none items-center justify-between border-b border-[#f3f4f6] px-[22px] py-4 ${maximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={e => { if (!e.target.closest('button')) toggleMaximize() }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px]" style={{ background: iconBg, color: iconColor }}>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {title}
            {subtitle}
          </div>
        </div>
        <div className="ml-3 flex flex-shrink-0 items-center gap-1.5">
          <button
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280] transition-all hover:bg-[#e5e7eb] hover:text-[#374151]"
            onClick={minimize}
            title="Thu nhỏ"
          >
            <IconMinus className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280] transition-all hover:bg-[#e5e7eb] hover:text-[#374151]"
            onClick={toggleMaximize}
            title={maximized ? 'Khôi phục kích thước' : 'Phóng to'}
          >
            {maximized ? <IconRestoreWin className="h-3.5 w-3.5" /> : <IconSquare className="h-3 w-3" />}
          </button>
          <button
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#f3f4f6] text-sm text-[#6b7280] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626]"
            onClick={onClose}
            title="Đóng"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-1">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-[#f3f4f6] px-[22px] py-3.5">
          {footer}
        </div>
      )}

      <style jsx global>{`
        @keyframes floatWinIn {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

// ─── DETAIL MODAL ──────────────────────────────────────────────────────────
function DetailModal({ order: o, checking, onClose, onDelete, onQuery, onConfirm }) {
  const sm    = STATUS_META[o.status] || STATUS_META.PENDING
  const copy  = t => navigator.clipboard?.writeText(String(t))
  const extra = decodeExtra(o.extraData)

  return (
    <FloatingWindow
      width={600}
      cascade={true}
      onClose={onClose}
      taskbarLabel={`Chi tiết · ${o.orderId}`}
      title={
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-[20px] px-[11px] py-[5px] text-xs font-bold" style={{ background:sm.bg, color:sm.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background:sm.dot }} />{sm.label}
          </span>
          <span className="text-[20px] font-extrabold tracking-tight text-[#ae0070]">{fmt(o.amount)} ₫</span>
          {checking && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9ca3af]">
              <IconRefresh className="h-[11px] w-[11px] animate-spin" />
              Đang đối chiếu MoMo...
            </span>
          )}
        </div>
      }
      footer={
        <>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-[7px] rounded-[9px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2 text-[13px] font-bold text-[#dc2626] transition-all hover:bg-[#fee2e2] hover:border-[#dc2626] active:scale-95"
              onClick={() => { onClose(); onDelete(o.orderId) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Xóa đơn
            </button>
            <button
              className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(99,102,241,0.3)] bg-[#eef2ff] px-3.5 py-2 text-[13px] font-bold text-[#4f46e5] transition-all hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5] active:scale-95"
              onClick={() => onQuery(o.orderId)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/></svg>
              Tra cứu MoMo
            </button>
            {o.resultCode === 9000 && (
              <button
                className="inline-flex items-center gap-[7px] rounded-[9px] border border-[rgba(22,163,74,0.3)] bg-[#f0fdf4] px-3.5 py-2 text-[13px] font-bold text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a] active:scale-95"
                onClick={() => { onClose(); onConfirm(o.orderId, o.amount) }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Xác nhận (9000)
              </button>
            )}
          </div>
          <button
            className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white hover:border-[rgba(174,0,112,0.25)] active:scale-95"
            onClick={onClose}
          >
            Đóng
          </button>
        </>
      }
    >
      <Section title="Thông tin giao dịch">
        <Row label="Mã đơn hàng"   value={o.orderId}   mono copy={() => copy(o.orderId)} />
        <Row label="Nội dung"       value={o.orderInfo || '—'} />
        <Row label="Cửa hàng"       value={o.storeName || '—'} />
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
                  // Text/box phía trên vẫn hiện payUrl đầy đủ cho admin xem —
                  // chỉ nút bấm "mở" này đi qua status.js?open=1 để đồng bộ với
                  // hành vi ẩn URL bên trang create-transaction.js.
                  href={`/api/momo/status?orderId=${encodeURIComponent(o.orderId)}&open=1`}
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
    </FloatingWindow>
  )
}

// ─── CONFIRM MODAL ─────────────────────────────────────────────────────────
function ConfirmModal({ orderId, amount, loading, result, error, onConfirm, onCancel, onClose }) {
  const rc   = result?.resultCode
  const isOk = rc === 0

  return (
    <FloatingWindow
      width={580}
      onClose={onClose}
      taskbarLabel={`Xác nhận GD · ${orderId}`}
      title={<div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Xác nhận / Huỷ giao dịch</div>}
      subtitle={<div className="text-xs text-[#6b7280]">POST /v2/gateway/api/confirm · {orderId}</div>}
      footer={
        <>
          <div className="text-xs text-[#9ca3af]">Chỉ áp dụng cho giao dịch resultCode = 9000</div>
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </>
      }
    >
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
        <div className="py-1">
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
    </FloatingWindow>
  )
}


// ─── LOGOUT CONFIRM MODAL ───────────────────────────────────────────────────
// Thay cho window.confirm() gốc của trình duyệt (xấu, không đồng bộ giao diện) —
// giờ dùng đúng kiểu cửa sổ nổi (FloatingWindow) như các popup xác nhận khác
// trong trang (Xác nhận xoá, Xác nhận 9000...).
function LogoutConfirmModal({ onConfirm, onClose }) {
  return (
    <FloatingWindow
      width={400}
      onClose={onClose}
      taskbarLabel="Đăng xuất"
      iconBg="#fee2e2"
      iconColor="#dc2626"
      icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
      title={<div className="text-[15px] font-extrabold tracking-[-0.2px] text-[#111827]">Đăng xuất</div>}
      footer={
        <div className="ml-auto flex gap-2">
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="rounded-[9px] bg-[#dc2626] px-5 py-2 text-[13px] font-bold text-white transition-all hover:bg-[#b91c1c]"
            onClick={onConfirm}
          >
            Đăng xuất
          </button>
        </div>
      }
    >
      <div className="px-[22px] py-4">
        <p className="text-[13px] text-[#374151]">Bạn có chắc muốn đăng xuất khỏi trang quản trị không?</p>
      </div>
    </FloatingWindow>
  )
}

// ─── DELETE CONFIRM MODAL (xác nhận mật khẩu trước khi xoá) ────────────────
// Thay cho window.confirm() cũ — giờ xoá đơn (dù 1 đơn hay xoá hàng loạt) đều
// phải nhập lại mật khẩu quản trị để xác nhận, tránh bấm nhầm gây mất dữ liệu
// không thể hoàn tác. Mật khẩu được xác thực qua endpoint /api/admin/login
// có sẵn (cùng cơ chế với màn đăng nhập), không tự so sánh chuỗi ở client.
function DeleteConfirmModal({ count, password, setPassword, checking, error, onConfirm, onClose }) {
  return (
    <FloatingWindow
      width={440}
      onClose={onClose}
      taskbarLabel={`Xác nhận xoá (${count})`}
      iconBg="#fee2e2"
      iconColor="#dc2626"
      icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>}
      title={<div className="text-[15px] font-extrabold tracking-[-0.2px] text-[#111827]">Xác nhận xoá {count} đơn</div>}
      subtitle={<div className="text-xs font-semibold text-[#dc2626]">Không thể hoàn tác — nhập mật khẩu để tiếp tục</div>}
      footer={
        <div className="ml-auto flex gap-2">
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose} disabled={checking}>
            Huỷ
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#dc2626] px-5 py-2 text-[13px] font-bold text-white transition-all hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onConfirm}
            disabled={checking || !password}
          >
            {checking && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>}
            Xác nhận xoá
          </button>
        </div>
      }
    >
      <div className="px-[22px] py-4">
        <p className="mb-3 text-[13px] text-[#374151]">
          Bạn sắp xoá vĩnh viễn <strong>{count}</strong> giao dịch khỏi hệ thống. Vui lòng nhập mật khẩu quản trị để xác nhận.
        </p>
        <input
          type="password" autoFocus value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && password && !checking && onConfirm()}
          placeholder="Mật khẩu quản trị..."
          className={`w-full rounded-xl border-[1.5px] bg-[rgba(245,237,242,0.5)] px-4 py-[11px] font-[Inter,sans-serif] text-[14px] text-[#111827] transition-all focus:border-[#ae0070] focus:bg-white focus:shadow-[0_0_0_4px_rgba(174,0,112,0.07)] ${
            error ? 'border-[#dc2626] bg-[#fff5f5]' : 'border-[rgba(174,0,112,0.15)]'
          }`}
        />
        {error && <p className="mt-2 text-[12.5px] font-semibold text-[#dc2626]">⚠ Mật khẩu không chính xác</p>}
      </div>
    </FloatingWindow>
  )
}

// ─── COL FILTER BAR ────────────────────────────────────────────────────────
// Trước đây đây là 1 nút "Bộ lọc" mở popover nổi lên trên — dù đã sửa z-index,
// nhìn vẫn rối vì nó che mất nội dung phía dưới mỗi lần mở. Đổi hẳn cách làm:
// bỏ popover, đưa thẳng các select (Hình thức / Loại đơn / Result / Giờ) ra
// thành 1 hàng gọn, luôn hiển thị — dùng dropdown gốc của trình duyệt nên
// không bao giờ đè lên phần tử khác của trang, không cần bấm mở/đóng gì cả.
// Nhãn hiển thị cho các giá trị "source" thô lưu trong DB (tên route tạo đơn) —
// trước đây hiện thẳng ra chuỗi kỹ thuật như "admin-cancelled", "manual-lookup-
// reconciled" trong dropdown, rất khó đọc. Có map sẵn cho các nguồn đã biết,
// nguồn nào chưa có trong map (phòng khi thêm route mới sau này) sẽ tự viết
// hoa từng chữ + thay gạch ngang bằng khoảng trắng thay vì hiện thô.
const SOURCE_LABELS = {
  'pos':                      'POS / Scan',
  'create-p2p':                'P2P / QR',
  'create-p2p-shortcut':       'P2P / QR (Shortcut)',
  'shortcut-pos':               'POS (Shortcut)',
  'admin-cancelled':            'Admin huỷ',
  'manual-lookup-reconciled':   'Đối soát thủ công',
  'redirect-verified':          'Xác thực qua redirect',
  'status-verified':            'Xác thực trạng thái',
}
const sourceLabel = v => SOURCE_LABELS[v] || String(v).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

// ─── FILTER DROPDOWN (custom, thay cho <select> gốc của trình duyệt) ───────
// <select> native không thể style đồng bộ giữa các trình duyệt (bo góc, màu
// item được chọn, font...) — nhìn lệch tông hẳn so với phần còn lại của giao
// diện (bo tròn hết mọi nơi). Dựng lại 1 dropdown riêng, cùng ngôn ngữ thiết
// kế với lịch chọn ngày (DateRangePicker) bên trên: nút bo góc [10px], panel
// nổi bo góc lớn hơn kèm đổ bóng mềm, tự đóng khi click ra ngoài / nhấn Esc.
function FilterDropdown({ value, onChange, options, active }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey     = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const current = options.find(o => o.value === value)

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex h-[30px] max-w-[170px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border pl-[10px] pr-[8px] text-[12px] font-semibold transition-all ${
          active
            ? 'border-[#ae0070] bg-[#fff0f7] text-[#ae0070]'
            : 'border-[rgba(174,0,112,0.1)] bg-white/70 text-[#6b7280] hover:border-[rgba(174,0,112,0.25)]'
        }`}
      >
        <span className="truncate">{current?.label}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className={`flex-shrink-0 text-[#9ca3af] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-[210] max-h-[260px] w-max min-w-[180px] max-w-[260px] overflow-y-auto rounded-[14px] border border-white/70 bg-white p-1.5 shadow-[0_20px_50px_rgba(174,0,112,0.16),0_0_0_1px_rgba(174,0,112,0.06)]"
          style={{ animation: 'fadein 0.12s ease' }}
        >
          {options.map(opt => {
            const isSel = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 rounded-[9px] px-3 py-[7px] text-left text-[12.5px] font-semibold transition-colors ${
                  isSel ? 'bg-[#fff0f7] text-[#ae0070]' : 'text-[#374151] hover:bg-[#f9fafb]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ColFilterBar({ colFilters, setColFilters, colFilterOptions, filtered }) {
  const hasActive = Object.values(colFilters).some(v => v !== '')
  const set = (key, val) => setColFilters(f => ({ ...f, [key]: val }))
  const clear = () => setColFilters({ payType: '', source: '', resultCode: '', hour: '', store: '' })

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-b-2xl border-t px-4 py-2 text-[12px] transition-all ${hasActive ? 'border-[rgba(174,0,112,0.15)] bg-[#fff8fc]' : 'border-[rgba(174,0,112,0.06)] bg-[#fbf7fa]/60'}`}>
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>
        Lọc
      </span>

      <FilterDropdown
        active={!!colFilters.payType}
        value={colFilters.payType}
        onChange={v => set('payType', v)}
        options={[{ value: '', label: 'Hình thức: Tất cả' }, ...colFilterOptions.payType.map(v => ({ value: v, label: v }))]}
      />

      {colFilterOptions.source.length > 0 && (
        <FilterDropdown
          active={!!colFilters.source}
          value={colFilters.source}
          onChange={v => set('source', v)}
          options={[{ value: '', label: 'Loại đơn: Tất cả' }, ...colFilterOptions.source.map(v => ({ value: v, label: sourceLabel(v) }))]}
        />
      )}

      {/* Cửa hàng — trang này tạo giao dịch được cho nhiều shop khác nhau,
          nên cần lọc lại theo tên cửa hàng khi cần xem riêng 1 shop.
          Chỉ hiện khi có ít nhất 1 đơn đã có storeName trong khoảng đang xem
          (những đơn cũ / tạo qua POS-scan hiện chưa lưu storeName sẽ dần có
          khi phần lưu DB được bổ sung sau). */}
      {colFilterOptions.store.length > 0 && (
        <FilterDropdown
          active={!!colFilters.store}
          value={colFilters.store}
          onChange={v => set('store', v)}
          options={[{ value: '', label: 'Cửa hàng: Tất cả' }, ...colFilterOptions.store.map(v => ({ value: v, label: v }))]}
        />
      )}

      <FilterDropdown
        active={colFilters.resultCode !== ''}
        value={colFilters.resultCode}
        onChange={v => set('resultCode', v)}
        options={[
          { value: '',        label: 'Result: Tất cả' },
          { value: 'ok',      label: '✓ Thành công (0)' },
          { value: 'fail',    label: '✗ Thất bại (≠0)' },
          { value: 'pending', label: 'Chưa có result' },
        ]}
      />

      {colFilterOptions.hour.length > 0 && (
        <FilterDropdown
          active={colFilters.hour !== ''}
          value={colFilters.hour}
          onChange={v => set('hour', v)}
          options={[{ value: '', label: 'Giờ: Tất cả' }, ...colFilterOptions.hour.map(h => ({ value: String(h), label: `${String(h).padStart(2,'0')}:00 – ${String(h).padStart(2,'0')}:59` }))]}
        />
      )}

      {hasActive && (
        <button
          onClick={clear}
          className="flex flex-shrink-0 items-center gap-1 rounded-[7px] border border-[rgba(220,38,38,0.2)] bg-[#fff5f5] px-2 py-[5px] text-[11px] font-bold text-[#dc2626] transition-all hover:bg-[#fee2e2]"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
          Xóa lọc
        </button>
      )}

      <span className="ml-auto flex-shrink-0 text-[11px] font-semibold text-[#6b7280]">
        {filtered.length} kết quả
      </span>
    </div>
  )
}


// ─── HISTORY SECTION ───────────────────────────────────────────────────────
function HistorySection({
  counts, totalRevenue, filter, setFilter, search, setSearch,
  dateFrom, setDateFrom, dateTo, setDateTo,
  activePresetKey, setActivePresetKey, filtered,
  colFilters, setColFilters, colFilterOptions,
  selected, toggleOne, toggleAll, sortKey, sortDir, toggleSort,
  setDetail, openQueryForOrder, openConfirmForOrder, doDelete,
  reconcilingAll, pausePolling, pollPaused,
}) {
  const successRate = counts.ALL ? Math.round(counts.PAID / counts.ALL * 100) : 0

  // Thanh lọc nâng cao (payType/source/resultCode/hour) mặc định ẨN — bấm nút
  // "Lọc nâng cao" mới hiện ra, cho gọn mắt hơn bản cũ (luôn hiện tất cả).
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedActiveCount = Object.values(colFilters).filter(v => v !== '').length

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

      {/* Thanh lọc — tách rõ 2 tầng:
          · Lọc cơ bản (khoảng ngày + tìm kiếm) — luôn hiện, dùng nhiều nhất.
          · Lọc nâng cao (hình thức/loại đơn/result/giờ) — ẨN mặc định, chỉ
            hiện khi bấm nút "Lọc nâng cao", cho gọn mắt hơn bản cũ (luôn hiện
            hết mọi bộ lọc cùng lúc kể cả khi không dùng tới).
          Toàn bộ khối này pause polling khi có tương tác (mousedown/focus),
          để tránh việc tự tải lại giữa lúc đang mở 1 dropdown làm số lượng/
          tuỳ chọn trong <select> đổi ngay dưới con trỏ → bấm không kịp. */}
      <div
        className="relative z-20 mb-5 rounded-2xl border border-white/70 bg-white/88 shadow-[0_2px_20px_rgba(174,0,112,0.04)] backdrop-blur-[12px]"
        onMouseDownCapture={pausePolling}
        onFocusCapture={pausePolling}
      >
      {/* ── Lọc cơ bản ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5">
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

          {/* Nút bật/tắt Lọc nâng cao — badge hiện số bộ lọc đang áp dụng dù đang ẩn */}
          <button
            onClick={() => setAdvancedOpen(o => !o)}
            className={`flex h-[33px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] font-bold transition-all ${
              advancedOpen || advancedActiveCount > 0
                ? 'border-[#ae0070] bg-[#fff0f7] text-[#ae0070]'
                : 'border-[rgba(174,0,112,0.1)] bg-white/70 text-[#6b7280] hover:border-[rgba(174,0,112,0.25)] hover:text-[#ae0070]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>
            Lọc nâng cao
            {advancedActiveCount > 0 && (
              <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#ae0070] px-[4px] text-[10px] font-bold text-white">
                {advancedActiveCount}
              </span>
            )}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" className={`transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {/* Không còn nút "Cập nhật" thủ công — trạng thái các giao dịch đang
              chờ xử lý được tự động đối chiếu lại với MoMo mỗi 1 giây (cùng
              nhịp với việc tự tải lại danh sách), chỉ hiện 1 chấm nhỏ báo đang
              quét để người dùng yên tâm là hệ thống vẫn đang tự cập nhật.
              Khi polling tạm dừng do đang chỉnh bộ lọc thì thay bằng 1 nhãn
              xám nhạt, tự biến mất và chạy lại sau khi ngừng thao tác. */}
          {pollPaused ? (
            <span className="flex h-[33px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[rgba(107,114,128,0.15)] bg-[#f9fafb] px-3 text-[12.5px] font-semibold text-[#9ca3af]">
              <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-[#d1d5db]" />
              Đã tạm dừng tự làm mới
            </span>
          ) : reconcilingAll && (
            <span className="flex h-[33px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[rgba(174,0,112,0.15)] bg-[#fff0f7] px-3 text-[12.5px] font-semibold text-[#ae0070]">
              <IconRefresh className="h-[14px] w-[14px] flex-shrink-0 animate-spin" />
              Đang cập nhật...
            </span>
          )}
          {selected.size > 0 && (
            <button
              className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[#dc2626] px-3.5 py-[7px] text-[13px] font-bold text-white transition-all hover:bg-[#b91c1c] active:scale-95"
              onClick={() => doDelete([...selected])}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Xóa ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* ── Lọc nâng cao — ẨN mặc định, chỉ hiện khi bấm nút "Lọc nâng cao" ── */}
      {advancedOpen && (
        <div style={{ animation: 'fadein 0.15s ease' }}>
          <ColFilterBar colFilters={colFilters} setColFilters={setColFilters} colFilterOptions={colFilterOptions} filtered={filtered} />
        </div>
      )}
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
                  <col className="w-[130px]" /><col className="w-[22%]"  /><col className="w-[110px]" />
                  <col className="w-[110px]" /><col className="w-[70px]" /><col className="w-[70px]" /><col className="w-[80px]" />
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
                    <SortableTh label="Thời gian" sortKey="createdAt" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Nội dung"   sortKey="orderInfo"  currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Mã đơn"     sortKey="orderId"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Mã GD MoMo" sortKey="transId"    currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Hình thức" sortKey="payType" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Result"     sortKey="resultCode" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
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
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-xs text-[#6b7280]">
                          <div>{fmtDate(o.createdAt)}</div>
                          {o.paidAt && <div className="mt-0.5 text-[#16a34a]">✓ {fmtDate(o.paidAt)}</div>}
                        </td>
                        <td className="max-w-0 px-4 py-3.5 align-middle text-[#374151]">
                          <div className="truncate" title={o.orderInfo}>{o.orderInfo || '—'}</div>
                          {o.storeName && (
                            <div className="mt-0.5 truncate text-[11px] font-medium text-[#9ca3af]" title={o.storeName}>
                              🏪 {o.storeName}
                            </div>
                          )}
                        </td>
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
                        {/* Đã bỏ nút "Tra cứu" ở đây — bấm vào cả dòng đã mở Chi tiết, mà
                            trong Chi tiết đã có sẵn hành động tra cứu MoMo rồi, nên nút
                            riêng ở cột này là thừa. Chỉ còn Xóa và Xác nhận (nếu 9000). */}
                        <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <button
                              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[#9ca3af] transition-all hover:bg-[#fee2e2] hover:text-[#dc2626] active:scale-90"
                              onClick={() => doDelete([o.orderId])}
                              title="Xóa giao dịch này"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                            {o.resultCode === 9000 && (
                              <button
                                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[rgba(22,163,74,0.25)] bg-[#f0fdf4] text-[#16a34a] transition-all hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a] active:scale-90"
                                onClick={() => openConfirmForOrder(o.orderId, o.amount)}
                                title="Xác nhận / Huỷ (9000 Authorized)"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
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

// ─── LOOKUP WINDOW (cửa sổ nổi tra cứu — hỗ trợ ĐA CỬA SỔ) ────────────────
// Thay cho LookupSection cũ (nhúng thẳng vào trang, chỉ có 1 bản duy nhất).
// Giờ đây mỗi lần bấm "Tra cứu giao dịch" ở sidebar sẽ tạo ra 1 FloatingWindow
// mới, độc lập với các cửa sổ tra cứu khác đang mở — y hệt cách Chi tiết /
// Xác nhận đã hoạt động. Nếu win.orderId rỗng (mở từ menu), cửa sổ hiện ô nhập
// orderId để tự tra; nếu đã có orderId (mở từ 1 dòng trong bảng), tự tra ngay.
function LookupWindow({ win, onQuery, onClose }) {
  const [input, setInput] = useState(win.orderId || '')
  const copy   = text => navigator.clipboard?.writeText(String(text))
  const rc     = win.result?.resultCode
  const isOk   = rc === 0 || rc === 9000
  const rcDesc = rc !== undefined ? getResultDesc(rc) : null
  const submit = () => input.trim() && onQuery(input)

  return (
    <FloatingWindow
      width={560}
      onClose={onClose}
      iconBg="#eef2ff"
      iconColor="#4f46e5"
      taskbarLabel={win.orderId ? `Tra cứu MoMo · ${win.orderId}` : 'Tra cứu giao dịch (mới)'}
      icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
      title={<div className="text-[15px] font-extrabold tracking-[-0.2px] text-[#111827]">Tra cứu MoMo</div>}
      subtitle={win.orderId
        ? <div className="max-w-[320px] truncate font-mono text-[11px] text-[#9ca3af]" title={win.orderId}>{win.orderId}</div>
        : <div className="text-xs text-[#9ca3af]">Gọi trực tiếp đến MoMo server theo orderId</div>}
      footer={
        <div className="ml-auto">
          <button className="rounded-[9px] border border-[rgba(174,0,112,0.1)] bg-[#f9fafb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition-all hover:bg-white" onClick={onClose}>Đóng</button>
        </div>
      }
    >
      {/* Ô nhập orderId — luôn hiện để có thể tra lại 1 mã khác trong cùng cửa sổ */}
      <div className="border-b border-[rgba(174,0,112,0.06)] px-[22px] py-4">
        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Order ID</label>
        <div className="flex gap-2">
          <input
            autoFocus={!win.orderId}
            className="flex-1 rounded-[10px] border-[1.5px] border-[rgba(174,0,112,0.1)] bg-white px-3.5 py-2.5 font-mono text-sm text-[#111827] transition-all focus:border-[#6366f1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
            type="text" placeholder="Nhập mã đơn hàng (orderId)..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !win.loading && submit()}
          />
          <button
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#4f46e5] px-[18px] py-2.5 text-[13px] font-bold text-white transition-all hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={submit} disabled={win.loading || !input.trim()}
          >
            {win.loading
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
            {win.loading ? 'Đang tra cứu...' : 'Tra cứu'}
          </button>
        </div>
      </div>

      {win.loading && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5" style={{ animation:'rot 0.8s linear infinite' }}><path d="M3 12a9 9 0 0 1 9-9"/></svg>
          <div className="text-[13px] font-semibold text-[#6b7280]">Đang tra cứu trên MoMo server...</div>
        </div>
      )}

      {!win.loading && win.error && (
        <div className="mx-[22px] my-3 flex items-center gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2.5 text-[13px] font-semibold text-[#dc2626]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          {win.error}
        </div>
      )}

      {!win.result && !win.error && !win.loading && (
        <div className="px-6 py-14 text-center">
          <div className="mb-3 text-4xl">🔎</div>
          <div className="text-[14px] font-semibold text-[#6b7280]">Nhập mã đơn để tra cứu</div>
          <div className="mt-1 text-xs text-[#9ca3af]">Kết quả sẽ hiển thị ngay sau khi truy vấn</div>
        </div>
      )}

      {win.result && (
        <>
          {win.result._reconciled && (
            <div className="mx-[22px] mt-4 flex items-center gap-2 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13px] font-semibold text-[#92400e]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
              Phát hiện lệch trạng thái (IPN có thể đã bị rớt) — đã tự động cập nhật lại
            </div>
          )}
          <div className="flex flex-col gap-1 px-[22px] py-4" style={{ background: isOk?'#f0fdf4':'#fff5f5' }}>
            <div className="font-mono text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: isOk?'#16a34a':'#dc2626' }}>{isOk?'✓':'✗'} {rc}</div>
            <div className="text-sm font-bold text-[#374151]">{rcDesc}</div>
            {win.result.message && <div className="text-xs text-[#6b7280]">{win.result.message}</div>}
          </div>

          <Section title="Thông tin giao dịch">
            <Row label="orderId"      value={win.result.orderId}   mono copy={() => copy(win.result.orderId)} />
            <Row label="requestId"    value={win.result.requestId} mono copy={() => copy(win.result.requestId)} />
            <Row label="transId"      value={win.result.transId?.toString()||'—'} mono />
            <Row label="partnerCode"  value={win.result.partnerCode} mono />
            <Row label="amount"        value={win.result.amount !== undefined ? `${fmt(win.result.amount)} ₫` : '—'} />
            <Row label="payType"       value={win.result.payType || '—'} />
            <Row label="paymentOption" value={win.result.paymentOption || '—'} />
            <Row label="responseTime"  value={win.result.responseTime ? fmtMs(win.result.responseTime) : '—'} />
          </Section>

          <Section title="Raw Response">
            <div className="mb-4 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 font-mono text-[11.5px] text-[#374151]">{JSON.stringify(win.result, null, 2)}</div>
          </Section>
        </>
      )}
    </FloatingWindow>
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

  const [orders,          setOrders]          = useState([])
  const [fetching,        setFetching]        = useState(false)
  const [reconcilingAll,  setReconcilingAll]  = useState(false)
  const [lastSync,        setLastSync]        = useState(null)
  const [filter,          setFilter]          = useState('ALL')
  const [search,          setSearch]          = useState('')
  // Mặc định xem giao dịch HÔM NAY khi vào trang (trước đây mặc định "Tuần này").
  const [dateFrom,        setDateFrom]        = useState(() => DATE_PRESETS.find(p=>p.key==='today').range()[0])
  const [dateTo,          setDateTo]          = useState(() => DATE_PRESETS.find(p=>p.key==='today').range()[1])
  const [activePresetKey, setActivePresetKey] = useState('today')
  const [sortKey,         setSortKey]         = useState('createdAt')
  const [sortDir,         setSortDir]         = useState('desc')
  const [selected,        setSelected]        = useState(new Set())
  // Mỗi lần bấm vào 1 dòng giao dịch sẽ MỞ THÊM 1 cửa sổ Chi tiết MỚI, độc lập
  // với các cửa sổ Chi tiết đã mở trước đó — không còn dùng chung/ghi đè lên
  // 1 cửa sổ duy nhất như trước. detailWindows là danh sách các cửa sổ đang mở.
  const [detailWindows,   setDetailWindows]   = useState([]) // [{ id, orderId, checking }]
  const detailWinSeq = useRef(0)
  // colFilters gộp cả bộ lọc theo cột (payType/source/resultCode) và bộ lọc
  // theo GIỜ (hour) — hour chỉ liệt kê các khung giờ THỰC SỰ có giao dịch
  // (xem colFilterOptions bên dưới), giờ nào không có đơn thì không hiện lựa chọn đó.
  const [colFilters,      setColFilters]      = useState({ payType: '', source: '', resultCode: '', hour: '', store: '' })

  // ─── CỬA SỔ TRA CỨU (chỉ 1 cửa sổ) ─────────────────────────────────────
  // Theo yêu cầu: "Tra cứu giao dịch" chỉ cần 1 cửa sổ tại 1 thời điểm — mở
  // tra cứu mới (dù từ menu hay từ 1 dòng trong bảng) sẽ TÁI SỬ DỤNG / GHI ĐÈ
  // cửa sổ đang mở thay vì tạo thêm cửa sổ mới chồng lên nhau.
  const [queryWindow,    setQueryWindow]    = useState(null) // { orderId, loading, result, error } | null
  const queryWinSeq = useRef(0)

  const [confirmModal,    setConfirmModal]    = useState(false)
  const [confirmOrderId,  setConfirmOrderId]  = useState('')
  const [confirmAmount,   setConfirmAmount]   = useState(0)
  const [confirmLoading,  setConfirmLoading]  = useState(false)
  const [confirmResult,   setConfirmResult]   = useState(null)
  const [confirmError,    setConfirmError]    = useState(null)

  // Popup nhập mật khẩu để xác nhận trước khi xoá đơn — deleteRequest giữ
  // danh sách orderId đang chờ xoá; chỉ thực sự gọi API xoá sau khi mật khẩu
  // được xác thực đúng qua /api/admin/login.
  const [deleteRequest,   setDeleteRequest]   = useState(null) // { ids: string[] } | null
  const [deletePassword,  setDeletePassword]  = useState('')
  const [deleteChecking,  setDeleteChecking]  = useState(false)
  const [deleteError,     setDeleteError]     = useState(false)

  const ordersRef   = useRef([])
  const fetchingRef = useRef(false)
  const reconcilingAllRef = useRef(false)
  const selectedRef = useRef(new Set())

  const filteredRef = useRef([])

  useEffect(() => { ordersRef.current   = orders   }, [orders])
  useEffect(() => { selectedRef.current = selected }, [selected])

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

  // Tự động quét lại tất cả giao dịch đang PENDING bằng cách gọi /api/momo/query
  // cho từng đơn — backend sẽ tự đối chiếu (reconcile) với MoMo và sửa Redis nếu
  // IPN bị rớt. Không còn nút bấm thủ công: hàm này được gọi lại mỗi 1 giây cùng
  // nhịp với fetchOrders (xem effect polling bên dưới), nên nếu 1 lượt quét chưa
  // xong trong 1s thì lượt sau sẽ tự bỏ qua (guard reconcilingAllRef) thay vì
  // chồng request lên nhau. Giới hạn chạy đồng thời (CONCURRENCY) để không spam
  // API MoMo cùng lúc khi có nhiều đơn đang chờ.
  const reconcileAllPending = useCallback(async () => {
    if (reconcilingAllRef.current) return
    const targets = ordersRef.current
      .map(normalizeStatus)
      .filter(o => o.status === 'PENDING')
      .map(o => o.orderId)
    if (targets.length === 0) return

    reconcilingAllRef.current = true; setReconcilingAll(true)
    try {
      const CONCURRENCY = 4
      let idx = 0
      let reconciled = 0
      const worker = async () => {
        while (idx < targets.length) {
          const orderId = targets[idx++]
          try {
            const res  = await fetch('/api/momo/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId }),
            })
            const data = await res.json().catch(() => null)
            if (data?._reconciled) reconciled += 1
          } catch (err) {
            console.error('[AdminDashboard] reconcileAllPending lỗi với', orderId, err)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))
      if (reconciled > 0) await fetchOrders({ force: true })
    } finally {
      reconcilingAllRef.current = false; setReconcilingAll(false)
    }
  }, [fetchOrders])

  // Vòng lặp tự làm mới duy nhất: mỗi 1 giây vừa tải lại danh sách đơn hàng vừa
  // đối chiếu lại các đơn đang chờ xử lý với MoMo — không cần người dùng bấm gì.
  //
  // Tạm dừng khi đang tương tác với thanh lọc: mỗi lượt tự tải lại có thể làm
  // đổi số lượng/danh sách tuỳ chọn trong các <select> (payType/source/hour...),
  // khiến dropdown đang mở bị đóng lại hoặc lựa chọn bị lệch vị trí ngay dưới
  // con trỏ → người dùng "bấm không kịp". Giải pháp: bất kỳ tương tác nào với
  // thanh lọc (mousedown/focus) sẽ tạm dừng polling trong POLL_PAUSE_MS, và
  // mỗi tương tác mới sẽ tự gia hạn thêm — polling chỉ chạy lại sau khi người
  // dùng thực sự dừng thao tác với bộ lọc.
  const POLL_PAUSE_MS = 4000
  const [pollPaused,    setPollPaused]    = useState(false)
  const pollPausedRef   = useRef(false)
  const pollResumeTimer = useRef(null)
  useEffect(() => { pollPausedRef.current = pollPaused }, [pollPaused])

  const pausePolling = useCallback(() => {
    if (!pollPausedRef.current) setPollPaused(true)
    if (pollResumeTimer.current) clearTimeout(pollResumeTimer.current)
    pollResumeTimer.current = setTimeout(() => setPollPaused(false), POLL_PAUSE_MS)
  }, [])
  useEffect(() => () => { if (pollResumeTimer.current) clearTimeout(pollResumeTimer.current) }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      if (pollPausedRef.current) return
      fetchOrders(); reconcileAllPending()
    }, REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [authed, fetchOrders, reconcileAllPending])

  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') { setDetailWindows([]); setConfirmModal(false); setDeleteRequest(null) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const updateQueryWindow = useCallback((id, patch) => {
    setQueryWindow(w => (w && w.id === id) ? { ...w, ...patch } : w)
  }, [])

  const closeQueryWindow = useCallback(() => {
    setQueryWindow(null)
  }, [])

  // Thực hiện tra cứu cho cửa sổ đang mở (theo id, để tránh cập nhật nhầm nếu
  // cửa sổ đã bị đóng/thay thế trong lúc request đang chạy).
  const runQuery = useCallback(async (id, orderIdArg) => {
    const orderId = orderIdArg.trim()
    if (!orderId) return
    updateQueryWindow(id, { orderId, loading: true, result: null, error: null })
    try {
      const res  = await fetch('/api/momo/query', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      updateQueryWindow(id, { loading: false, result: data })
      // Nếu backend phát hiện trạng thái lưu trữ bị lệch so với MoMo (do IPN rớt/lỗi)
      // và đã tự sửa lại trong Redis → refresh ngay danh sách đơn hàng để bảng/khung
      // chi tiết hiển thị đúng trạng thái mới, không phải đợi tới lượt poll kế tiếp.
      if (data._reconciled) fetchOrders({ force: true })
    } catch (err) {
      updateQueryWindow(id, { loading: false, error: err.message || 'Lỗi không xác định' })
    }
  }, [fetchOrders, updateQueryWindow])

  // Mở Chi tiết cho 1 đơn khi bấm vào dòng/thẻ trong bảng: LUÔN mở 1 cửa sổ
  // MỚI (không tái sử dụng cửa sổ đã mở trước đó), nên bấm vào nhiều dòng khác
  // nhau sẽ cho ra nhiều cửa sổ Chi tiết cùng tồn tại song song, xếp lệch nhau.
  // Hiện ngay dữ liệu đang có trong cache (không phải chờ), đồng thời âm thầm
  // gọi /api/momo/query để đối chiếu với MoMo — nếu trạng thái đang lưu bị lệch
  // so với thực tế, backend tự sửa lại (Redis) và ta refresh danh sách ngay để
  // khung Chi tiết hiện đúng trạng thái mới nhất.
  const openDetail = useCallback(async orderId => {
    const id = `dw-${++detailWinSeq.current}`
    setDetailWindows(ws => [...ws, { id, orderId, checking: true }])
    try {
      const res  = await fetch('/api/momo/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json().catch(() => null)
      if (data?._reconciled) await fetchOrders({ force: true })
    } catch (err) {
      console.error('[AdminDashboard] openDetail query lỗi:', err)
    } finally {
      setDetailWindows(ws => ws.map(w => w.id === id ? { ...w, checking: false } : w))
    }
  }, [fetchOrders])

  const closeDetailWindow = useCallback(id => {
    setDetailWindows(ws => ws.filter(w => w.id !== id))
  }, [])

  // Mở cửa sổ tra cứu cho 1 đơn ĐÃ BIẾT orderId (từ bảng / OrderCard / Chi tiết) —
  // CHỈ 1 CỬA SỔ tại 1 thời điểm: nếu đang có cửa sổ mở sẵn thì tái sử dụng luôn
  // (ghi đè nội dung), không mở thêm cửa sổ mới chồng lên nhau.
  const openQueryForOrder = useCallback(orderId => {
    const id = `qw-${++queryWinSeq.current}`
    setQueryWindow({ id, orderId, loading: true, result: null, error: null })
    runQuery(id, orderId)
  }, [runQuery])

  // Mở cửa sổ tra cứu TRỐNG (từ menu "Tra cứu giao dịch") — cũng dùng lại đúng
  // 1 cửa sổ duy nhất; người dùng tự nhập orderId trong cửa sổ rồi bấm tra cứu.
  const openLookupWindow = useCallback(() => {
    const id = `qw-${++queryWinSeq.current}`
    setQueryWindow({ id, orderId: '', loading: false, result: null, error: null })
  }, [])

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
        o.message?.toLowerCase().includes(q) ||
        o.storeName?.toLowerCase().includes(q)
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

  // Step 5: table = scoped + status filter + colFilters + sort
  const filtered = useMemo(() => scoped
    .filter(o => filter === 'ALL' || o.status === filter)
    .filter(o => {
      if (colFilters.payType && (o.payType || '') !== colFilters.payType) return false
      if (colFilters.source && (o.source || '') !== colFilters.source) return false
      if (colFilters.store && (o.storeName || '') !== colFilters.store) return false
      if (colFilters.resultCode !== '') {
        if (colFilters.resultCode === 'ok'   && o.resultCode !== 0)  return false
        if (colFilters.resultCode === 'fail' && o.resultCode === 0)  return false
        if (colFilters.resultCode === 'pending' && o.resultCode !== undefined && o.resultCode !== null) return false
      }
      // Lọc theo GIỜ tạo đơn (0–23) — chỉ áp dụng khi người dùng chọn 1 giờ cụ thể.
      if (colFilters.hour !== '' && o.createdAt) {
        if (new Date(o.createdAt).getHours() !== Number(colFilters.hour)) return false
      }
      return true
    })
    .sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'createdAt' || sortKey === 'paidAt') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      } else if (sortKey === 'amount' || sortKey === 'resultCode' || sortKey === 'transId') {
        // BUG cũ: resultCode/transId là số nhưng bị rơi vào nhánh so sánh chuỗi
        // bên dưới (vd "1000" < "20" theo kiểu chuỗi dù 1000 > 20) → sắp xếp sai.
        // Nay ép về số để sort đúng thứ tự.
        av = av === undefined || av === null || av === '' ? -Infinity : parseInt(av)
        bv = bv === undefined || bv === null || bv === '' ? -Infinity : parseInt(bv)
      } else {
        av = (av??'').toString().toLowerCase(); bv = (bv??'').toString().toLowerCase()
      }
      if (av < bv) return sortDir==='asc' ? -1 : 1
      if (av > bv) return sortDir==='asc' ?  1 : -1
      return 0
    }), [scoped, filter, colFilters, sortKey, sortDir])

  // Derive unique values for col filter dropdowns (from ALL scoped, not filtered, so options don't collapse).
  // "hour" chỉ liệt kê những khung giờ THỰC SỰ có giao dịch trong khoảng ngày đang xem —
  // giờ nào không có đơn thì tự động không xuất hiện trong danh sách (không hiện lựa chọn rỗng),
  // và luôn được sắp xếp tăng dần theo giờ.
  const colFilterOptions = useMemo(() => ({
    payType: [...new Set(scoped.map(o => o.payType).filter(Boolean))].sort(),
    source:  [...new Set(scoped.map(o => o.source).filter(Boolean))].sort(),
    hour:    [...new Set(scoped.filter(o => o.createdAt).map(o => new Date(o.createdAt).getHours()))].sort((a,b) => a-b),
    // Danh sách cửa hàng thực sự xuất hiện trong khoảng đang xem — trang này
    // tạo giao dịch được cho nhiều shop, nên list này sẽ dài dần khi nhiều
    // route (POS-scan, shortcut...) được bổ sung lưu storeName vào DB.
    store:   [...new Set(scoped.map(o => o.storeName).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'vi')),
  }), [scoped])

  // Với mỗi cửa sổ Chi tiết đang mở, tìm dữ liệu đơn hàng mới nhất theo orderId
  // (tự cập nhật mỗi khi `displayed` đổi, không cần setDetail lại thủ công).
  const detailOrders = detailWindows.map(w => ({ win: w, order: displayed.find(o => o.orderId === w.orderId) }))

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

  // Thực thi xoá thật sự — chỉ được gọi SAU KHI mật khẩu đã xác thực đúng.
  const performDelete = useCallback(async (ids) => {
    try {
      await Promise.all(ids.map(id => fetch('/api/momo/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderId:id }) })))
      setDetailWindows(ws => ws.filter(w => !ids.includes(w.orderId)))
      setSelected(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n })
      await fetchOrders({ force: true })
    } catch (err) {
      console.error(err); alert('Lỗi khi xóa')
    }
  }, [fetchOrders])

  // doDelete giờ chỉ MỞ popup xác nhận mật khẩu (thay cho window.confirm cũ) —
  // việc xoá thật sự dời vào performDelete, chạy sau khi confirmDeleteWithPassword thành công.
  const doDelete = useCallback((ids) => {
    if (!ids.length) return
    setDeleteError(false)
    setDeletePassword('')
    setDeleteRequest({ ids })
  }, [])

  const confirmDeleteWithPassword = useCallback(async () => {
    if (!deleteRequest) return
    setDeleteChecking(true)
    setDeleteError(false)
    try {
      const res = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password: deletePassword }) })
      if (!res.ok) { setDeleteError(true); setDeleteChecking(false); return }
      const ids = deleteRequest.ids
      setDeleteRequest(null)
      setDeletePassword('')
      setDeleteChecking(false)
      await performDelete(ids)
    } catch {
      setDeleteError(true)
      setDeleteChecking(false)
    }
  }, [deleteRequest, deletePassword, performDelete])

  async function login() {
    setPwError(false)
    try {
      const res = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password }) })
      if (res.ok) { setAuthed(true); setPassword('') } else { setPwError(true); setPassword('') }
    } catch { setPwError(true) }
  }

  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const requestLogout = useCallback(() => setLogoutConfirm(true), [])
  const confirmLogout = useCallback(() => {
    setLogoutConfirm(false)
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

  // ─── MAIN DASHBOARD ─────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>ADMIN · {PAGE_TITLE}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/png" href="/Main.png" />
      </Head>
      <div className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f5edf2] font-[Inter,sans-serif] text-[#111827]">
        <Orbs />

        {/* Cửa sổ Chi tiết — mỗi lần bấm vào 1 giao dịch trong danh sách sẽ mở
            1 cửa sổ MỚI hoàn toàn (xem openDetail), nên ở đây render TOÀN BỘ
            các cửa sổ đang mở cùng lúc, mỗi cửa sổ độc lập với nhau. */}
        {detailOrders.map(({ win, order }) => order && (
          <DetailModal
            key={win.id}
            order={order}
            checking={win.checking}
            onClose={() => closeDetailWindow(win.id)}
            onDelete={id => doDelete([id])}
            onQuery={id => openQueryForOrder(id)}
            onConfirm={(id, amount) => { closeDetailWindow(win.id); openConfirmForOrder(id, amount) }}
          />
        ))}

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

        {/* Cửa sổ Tra cứu MoMo — chỉ 1 cửa sổ tại 1 thời điểm (mở lại sẽ tái sử
            dụng đúng cửa sổ này, dù mở từ bảng, từ Chi tiết, hay từ menu). */}
        {queryWindow && (
          <LookupWindow
            key={queryWindow.id}
            win={queryWindow}
            onQuery={orderId => runQuery(queryWindow.id, orderId)}
            onClose={closeQueryWindow}
          />
        )}

        {/* Delete Confirm Modal (xác nhận mật khẩu trước khi xoá) */}
        {deleteRequest && (
          <DeleteConfirmModal
            count={deleteRequest.ids.length}
            password={deletePassword} setPassword={setDeletePassword}
            checking={deleteChecking} error={deleteError}
            onConfirm={confirmDeleteWithPassword}
            onClose={() => { setDeleteRequest(null); setDeletePassword(''); setDeleteError(false) }}
          />
        )}

        {/* Xác nhận đăng xuất — dạng cửa sổ nổi, thay cho window.confirm() gốc */}
        {logoutConfirm && (
          <LogoutConfirmModal
            onConfirm={confirmLogout}
            onClose={() => setLogoutConfirm(false)}
          />
        )}

        {/* Dock hiển thị các cửa sổ đang thu nhỏ — hệ đa cửa sổ thật */}
        <FloatingWinDock />

        {/* Thanh cố định ở đáy màn hình — nút "Tra cứu giao dịch" luôn hiện sẵn,
            bấm vào bất kỳ lúc nào (không cần vào menu nào trước) để mở cửa sổ
            tra cứu MoMo. */}
        <LookupBar onOpen={openLookupWindow} />

        <div className="relative z-[1] flex min-h-screen w-full flex-col">
          <TopBar
            pendingCount={counts.PENDING}
            fetching={fetching}
            lastSync={lastSync}
            logout={requestLogout}
          />

          <main className="mx-auto w-full max-w-[1500px] flex-1 p-6 pb-20 max-md:p-3.5 max-md:pb-20">
            {activeSection === 'history' && (
              <HistorySection
                counts={counts} totalRevenue={totalRevenue}
                filter={filter} setFilter={setFilter}
                search={search} setSearch={setSearch}
                dateFrom={dateFrom} setDateFrom={setDateFrom}
                dateTo={dateTo} setDateTo={setDateTo}
                activePresetKey={activePresetKey} setActivePresetKey={setActivePresetKey}
                filtered={filtered}
                colFilters={colFilters} setColFilters={setColFilters} colFilterOptions={colFilterOptions}
                selected={selected} toggleOne={toggleOne} toggleAll={toggleAll}
                sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                setDetail={openDetail}
                openQueryForOrder={openQueryForOrder}
                openConfirmForOrder={openConfirmForOrder}
                doDelete={doDelete}
                reconcilingAll={reconcilingAll}
                pausePolling={pausePolling}
                pollPaused={pollPaused}
              />
            )}
            {activeSection === 'create' && <CreateSection />}
            {/* 'lookup' không còn là 1 trang riêng — bấm nút "Tra cứu giao dịch" ở
                thanh cố định dưới màn hình giờ mở 1 cửa sổ nổi mới (xem LookupBar +
                openLookupWindow + LookupWindow), nên activeSection vẫn giữ nguyên
                giá trị trước đó, không có gì render ở đây. */}
          </main>
        </div>
      </div>
    </>
  )
}