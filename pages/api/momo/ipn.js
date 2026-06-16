// pages/api/momo/ipn.js
import { verifyIpnSignature } from '../../../lib/momo'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body
  const isValid = verifyIpnSignature(body)
  if (!isValid) {
    console.error('[MoMo IPN] Invalid signature!')
    return res.status(400).json({ message: 'Invalid signature' })
  }

  const { orderId, transId, resultCode, amount, payType, orderInfo } = body
  const isPaid = parseInt(resultCode) === 0
  const now = new Date().toISOString()

  const existing = await redis.hget('momo:orders', orderId)
  if (existing) {
    const prev = typeof existing === 'string' ? JSON.parse(existing) : existing
    if (prev.status === 'PAID') {
      return res.status(204).end()
    }
  }

  const record = {
    orderId,
    transId:    transId || '',
    amount:     parseInt(amount || 0),
    payType:    payType || '',
    orderInfo:  orderInfo || '',
    resultCode: parseInt(resultCode),
    paidAt:     isPaid ? now : null,
    createdAt:  now,
    status:     isPaid ? 'PAID' : 'FAILED',
    source:     'ipn',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })
  console.log(`[IPN] ${orderId} → ${isPaid ? '✅ PAID' : '❌ FAILED'}`)

  
  return res.status(204).end()
}