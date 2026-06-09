import { verifyIpnSignature } from '../../../lib/momo'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body
  console.log('[MoMo IPN] Received:', JSON.stringify(body))

  if (!verifyIpnSignature(body)) {
    console.error('[MoMo IPN] Invalid signature!')
    return res.status(400).json({ message: 'Invalid signature' })
  }

  const { orderId, transId, resultCode, amount, payType, orderInfo } = body

  const record = {
    orderId,
    transId,
    resultCode,
    amount,
    payType,
    orderInfo,
    paidAt: new Date().toISOString(),
    status: resultCode === 0 ? 'PAID' : 'FAILED',
  }

  // Lưu từng order theo key, thêm vào list index
  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })

  console.log(`[MoMo IPN] Order ${orderId} → ${record.status}`)
  return res.status(204).end()
}
