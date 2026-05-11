import { orderStore } from './ipn'

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { orderId } = req.query
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  const order = orderStore.get(orderId)
  if (!order) {
    return res.status(200).json({ status: 'PENDING', orderId })
  }

  return res.status(200).json(order)
}
