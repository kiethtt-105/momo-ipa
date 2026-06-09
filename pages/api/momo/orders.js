// pages/api/momo/orders.js
// Trả toàn bộ danh sách giao dịch — chỉ dùng cho admin

const orderStore = global.orderStore || (global.orderStore = new Map())

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Kiểm tra admin key để tránh ai cũng gọi được
  const { key } = req.query
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Chuyển Map → Array, sort mới nhất lên đầu
  const orders = Array.from(orderStore.values())
    .sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0))

  return res.status(200).json({ orders, total: orders.length })
}