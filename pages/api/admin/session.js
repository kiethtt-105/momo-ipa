// pages/api/admin/session.js

import { verifySession } from './login'

const COOKIE_NAME = 'momo_admin_session'

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ authed: verifySession(req) })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
