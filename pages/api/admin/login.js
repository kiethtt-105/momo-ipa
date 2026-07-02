// pages/api/admin/login.js

import crypto from 'crypto'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
// KHÔNG fallback về chuỗi cứng nữa — nếu thiếu env, ai đọc được source (hoặc
// đoán default phổ biến) đều tự ký được cookie session hợp lệ, bypass toàn
// bộ requireAdmin() mà không cần biết ADMIN_PASSWORD. Thà fail rõ ràng ngay
// lúc khởi động còn hơn chạy "êm" với 1 secret không an toàn.
const COOKIE_SECRET   = process.env.COOKIE_SECRET
const COOKIE_NAME     = 'momo_admin_session'
const SESSION_TTL_MS  = 12 * 60 * 60 * 1000

if (!COOKIE_SECRET) {
  throw new Error('[admin/login] Thiếu biến môi trường COOKIE_SECRET — bắt buộc phải set trước khi chạy, không được dùng giá trị mặc định.')
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifySession(req) {
  const raw = req.cookies?.[COOKIE_NAME]
  if (!raw) return false
  const [data, sig] = raw.split('.')
  if (!data || !sig) return false
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64url')
  if (sig.length !== expected.length) return false
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!ok) return false
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    return payload.exp > Date.now()
  } catch {
    return false
  }
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

  const token = sign({ exp: Date.now() + SESSION_TTL_MS })

  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  ])

  return res.status(200).json({ ok: true })
}