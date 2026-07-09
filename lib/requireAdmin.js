// requireAdmin.js

import { verifySession, refreshSession } from '../pages/api/admin/login'

export function requireAdmin(req, res) {
  if (!verifySession(req)) {
    res.status(401).json({ error: 'Chưa đăng nhập hoặc session hết hạn' })
    return false
  }

  // Rolling session: mỗi lần admin gọi API (tức còn đang hoạt động), cấp lại
  // cookie mới với Max-Age=400 ngày tính lại từ bây giờ. Nhờ vậy chỉ cần
  // dùng đều (khoảng cách giữa 2 lần dùng < 400 ngày) thì session không bao
  // giờ tự hết hạn — chỉ mất khi bấm logout.
  refreshSession(req, res)

  return true
}