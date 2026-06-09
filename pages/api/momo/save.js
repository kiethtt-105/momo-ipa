import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// Map resultCode MoMo → status
function getStatus(resultCode) {
  const code = parseInt(resultCode)
  if (code === 0)    return 'PAID'
  if (code === 1006) return 'CANCELLED' // User huỷ
  if (code === 1005) return 'EXPIRED'   // Hết hạn
  return 'FAILED'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId, transId, amount, payType, orderInfo, resultCode, message } = req.body
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  const status = getStatus(resultCode)

  // Lấy record cũ (nếu có) để giữ lại createdAt
  const existing = await redis.hget('momo:orders', orderId)
  const old = existing ? (typeof existing === 'string' ? JSON.parse(existing) : existing) : {}

  const record = {
    orderId,
    amount:     amount    || old.amount    || 0,
    orderInfo:  orderInfo || old.orderInfo || '',
    transId:    transId   || null,
    payType:    payType   || null,
    resultCode: parseInt(resultCode ?? -1),
    message:    message   || '',
    status,
    createdAt:  old.createdAt || new Date().toISOString(),
    paidAt:     status === 'PAID' ? new Date().toISOString() : (old.paidAt || null),
    updatedAt:  new Date().toISOString(),
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })

  return res.status(200).json({ ok: true, status })
}