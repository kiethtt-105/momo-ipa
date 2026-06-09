import { orderStore } from './ipn'

<<<<<<< HEAD
const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
=======
export default function handler(req, res) {
>>>>>>> parent of 13dce33 (.)
  if (req.method !== 'GET') return res.status(405).end()

  const { orderId } = req.query
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  const order = orderStore.get(orderId)
  if (!order) {
    return res.status(200).json({ status: 'PENDING', orderId })
  }

  return res.status(200).json(order)
}