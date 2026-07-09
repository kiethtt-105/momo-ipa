// pages/api/admin/session.js

import { verifySession, refreshSession } from './login'

const COOKIE_NAME = 'momo_admin_session'

export default function handler(req, res) {
  if (req.method === 'GET') {
    const authed = verifySession(req)
    if (authed) refreshSession(req, res) // rolling: mở dashboard cũng tính là "còn hoạt động"
    return res.status(200).json({ authed })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}