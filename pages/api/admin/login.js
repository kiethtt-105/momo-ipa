// pages/api/admin/login.js
// Xác thực password ở SERVER — không dùng biến NEXT_PUBLIC_ vì biến đó
// sẽ bị Next.js nhúng thẳng vào bundle JS gửi cho client (ai cũng đọc được).
//
// Cần set trong file .env (KHÔNG có prefix NEXT_PUBLIC_):
//   ADMIN_PASSWORD=mot-password-manh
//   ADMIN_KEY=mot-key-bi-mat-dung-cho-cac-api-khac
//   COOKIE_SECRET=mot-chuoi-ngau-nhien-dai

import crypto from 'crypto'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const COOKIE_SECRET   = process.env.COOKIE_SECRET || 'change-me-please'
const COOKIE_NAME     = 'momo_admin_session'
const SESSION_TTL_MS  = 12 * 60 * 60 * 1000 // 12h

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
  // So sánh dạng timing-safe để tránh timing attack
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

  // So sánh timing-safe để tránh lộ thông tin qua thời gian phản hồi
  const a = Buffer.from(String(password || ''))
  const b = Buffer.from(String(ADMIN_PASSWORD))
  const same = a.length === b.length && crypto.timingSafeEqual(a, b)

  if (!same) {
    // Không trả message chi tiết, không trả status khác nhau cho "sai user/sai pass"
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
