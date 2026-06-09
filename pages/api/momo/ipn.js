import { verifyIpnSignature } from '../../../lib/momo'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body
  console.log('[MoMo IPN] Received:', JSON.stringify(body))

  // 1. Xác thực chữ ký
  const isValid = verifyIpnSignature(body)
  if (!isValid) {
    console.error('[MoMo IPN] Invalid signature!')
    return res.status(400).json({ message: 'Invalid signature' })
  }

  const { orderId, transId, resultCode, amount, payType, orderInfo } = body
  const isPaid = parseInt(resultCode) === 0

  // FIX BUG 1: Không ghi đè nếu đã có record PAID từ trước
  const existing = await redis.hget('momo:orders', orderId)
  if (existing) {
    const prev = typeof existing === 'string' ? JSON.parse(existing) : existing
    if (prev.status === 'PAID') {
      console.log(`[MoMo IPN] Order ${orderId} already PAID — skipping overwrite`)
      return res.status(204).end()
    }
  }

  const now = new Date().toISOString()

  // FIX BUG 2 + 3: paidAt chỉ set khi PAID, amount luôn là number
  const record = {
    orderId,
    transId:    transId   || '',
    amount:     parseInt(amount) || 0,   // FIX BUG 3: parseInt
    payType:    payType   || '',
    orderInfo:  orderInfo || '',
    resultCode: parseInt(resultCode),
    paidAt:     isPaid ? now : null,     // FIX BUG 2: null nếu thất bại
    status:     isPaid ? 'PAID' : 'FAILED',
    source:     'ipn',
    createdAt:  now,
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })

  console.log(`[MoMo IPN] Order ${orderId} → ${isPaid ? '✅ PAID' : '❌ FAILED'} (transId: ${transId})`)

  return res.status(204).end()
}
