// lib/requireAdmin.js
// Import và gọi ở ĐẦU mỗi API admin (orders.js, delete.js...) để chặn truy cập
// khi chưa đăng nhập — thay cho việc so sánh ?key=... với NEXT_PUBLIC_ADMIN_KEY.
//
// Cách dùng trong pages/api/momo/orders.js:
//
//   import { requireAdmin } from '../../../lib/requireAdmin'
//
//   export default function handler(req, res) {
//     if (!requireAdmin(req, res)) return // đã tự res.status(401)... bên trong
//     // ...logic cũ...
//   }

import { verifySession } from '../pages/api/admin/login'

export function requireAdmin(req, res) {
  if (!verifySession(req)) {
    res.status(401).json({ error: 'Chưa đăng nhập hoặc session hết hạn' })
    return false
  }
  return true
}
