// pages/api/admin/login.js

import crypto from 'crypto'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
// KHÔNG fallback về chuỗi cứng nữa — nếu thiếu env, ai đọc được source (hoặc
// đoán default phổ biến) đều tự ký được cookie session hợp lệ, bypass toàn
// bộ requireAdmin() mà không cần biết ADMIN_PASSWORD. Thà fail rõ ràng ngay
// lúc khởi động còn hơn chạy "êm" với 1 secret không an toàn.
const COOKIE_SECRET = process.env.COOKIE_SECRET
const COOKIE_NAME    = 'momo_admin_session'

// Session KHÔNG hết hạn theo thời gian nữa — chỉ mất hiệu lực khi:
//  1) User bấm logout (session.js DELETE xoá cookie)
//  2) Device (User-Agent) đổi so với lúc login
// Cookie vẫn cần Max-Age để browser giữ lại, dùng luôn mức trần mà
// Chrome/Safari cho phép (400 ngày) — quá số này browser tự cắt về mốc đó.
const COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60

// KHÔNG ràng buộc theo IP nữa — đổi wifi/4G/mạng sẽ không bị văng session.
// Chỉ ràng buộc theo thiết bị (hash của User-Agent). Ổn định hơn IP vì UA
// gần như không đổi trên cùng 1 trình duyệt/thiết bị.
const BIND_TO_DEVICE = true

if (!COOKIE_SECRET) {
  throw new Error('[admin/login] Thiếu biến môi trường COOKIE_SECRET — bắt buộc phải set trước khi chạy, không được dùng giá trị mặc định.')
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return xff.split(',')[0].trim()
  return req.socket?.remoteAddress || ''
}

function getDeviceHash(req) {
  const ua = req.headers['user-agent'] || ''
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16)
}

// Parse UA ra dạng người đọc được, ví dụ: "iPhone · Safari" hoặc
// "Windows · Chrome". Chỉ để hiển thị cho admin biết đang đăng nhập từ
// thiết bị nào — KHÔNG dùng để verify (verify dựa vào hash nguyên UA).
function getDeviceLabel(req) {
  const ua = req.headers['user-agent'] || ''

  let os = 'Unknown OS'
  if (/iPhone/i.test(ua)) os = 'iPhone'
  else if (/iPad/i.test(ua)) os = 'iPad'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'Unknown browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera'
  else if (/CriOS|Chrome/i.test(ua)) browser = 'Chrome'
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'Firefox'
  else if (/Safari/i.test(ua)) browser = 'Safari'

  return `${os} · ${browser}`
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

// Trả về payload nếu cookie hợp lệ, ngược lại trả về null.
// Dùng nội bộ cho cả verifySession() và refreshSession().
function getValidPayload(req) {
  const raw = req.cookies?.[COOKIE_NAME]
  if (!raw) return null

  const [data, sig] = raw.split('.')
  if (!data || !sig) return null

  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64url')
  if (sig.length !== expected.length) return null

  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!ok) return null

  let payload
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString())
  } catch {
    return null
  }

  // Không check payload.exp — session sống mãi tới khi logout.

  if (BIND_TO_DEVICE) {
    const currentDevice = getDeviceHash(req)
    if (!payload.device || payload.device !== currentDevice) return null
  }

  return payload
}

export function verifySession(req) {
  return getValidPayload(req) !== null
}

// Gọi sau khi verifySession() == true, trong các route cần giữ phiên "rolling":
// cấp lại cookie mới với Max-Age=400 ngày tính lại từ thời điểm hiện tại.
// Nhờ vậy chỉ cần admin còn thao tác (dù cách nhau bao lâu, miễn < 400 ngày/lần)
// thì session không bao giờ tự rụng — chỉ mất khi bấm logout.
export function refreshSession(req, res) {
  const payload = getValidPayload(req)
  if (!payload) return false

  const token = sign({
    device: payload.device,
    loginAt: payload.loginAt, // giữ nguyên mốc login gốc để biết đăng nhập từ khi nào
    lastSeenAt: Date.now(),   // chỉ để hiển thị/log, không dùng để tính hết hạn
  })

  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SEC}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  ])

  return true
}

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!ADMIN_PASSWORD) {
    console.error('[admin/login] Thiếu ADMIN_PASSWORD trong env')
    return res.status(500).json({ error: 'Server chưa được cấu hình' })
  }

  const { password } = req.body || {}

  const a = Buffer.from(String(password || ''))
  const b = Buffer.from(String(ADMIN_PASSWORD))
  const same = a.length === b.length && crypto.timingSafeEqual(a, b)

  if (!same) {
    return res.status(401).json({ error: 'Sai mật khẩu' })
  }

  const ip          = getClientIp(req)       // chỉ để log/hiển thị, KHÔNG dùng verify
  const device      = getDeviceHash(req)     // dùng để verify
  const deviceLabel = getDeviceLabel(req)    // chỉ để hiển thị

  const token = sign({
    device,
    loginAt: Date.now(), // chỉ để log/hiển thị, KHÔNG dùng để tính hết hạn
  })

  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SEC}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  ])

  return res.status(200).json({ ok: true, ip, device: deviceLabel })
}