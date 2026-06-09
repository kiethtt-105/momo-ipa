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

  // 2. Lưu vào Redis
  const record = {
    orderId,
    transId:    transId   || '',
    amount:     amount    || 0,
    payType:    payType   || '',
    orderInfo:  orderInfo || '',
    resultCode: parseInt(resultCode),
    paidAt:     new Date().toISOString(),
    status:     parseInt(resultCode) === 0 ? 'PAID' : 'FAILED',
    source:     'ipn',
    createdAt:  new Date().toISOString(),
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })

  console.log(`[MoMo IPN] Order ${orderId} → ${parseInt(resultCode) === 0 ? '✅ PAID' : '❌ FAILED'} (transId: ${transId})`)

  // 3. MoMo yêu cầu trả 204 ngay
  return res.status(204).end()
}
