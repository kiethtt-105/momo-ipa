// requireAdmin.js

import { verifySession } from '../pages/api/admin/login'

export function requireAdmin(req, res) {
  if (!verifySession(req)) {
    res.status(401).json({ error: 'Chưa đăng nhập hoặc session hết hạn' })
    return false
  }
  return true
}
