import { verifyIpnSignature } from '../../../lib/momo'

<<<<<<< HEAD
const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})
=======
// In production: lưu vào DB thật (PostgreSQL, MongoDB, ...)
// Demo: in-memory store (reset khi redeploy)
const orderStore = global.orderStore || (global.orderStore = new Map())
>>>>>>> parent of 13dce33 (.)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const body = req.body
  console.log('[MoMo IPN] Received:', JSON.stringify(body))

  // 1. Xác thực chữ ký
  const isValid = verifyIpnSignature(body)
  if (!isValid) {
    console.error('[MoMo IPN] Invalid signature!')
    return res.status(400).json({ message: 'Invalid signature' })
  }

  const { orderId, transId, resultCode, amount, payType, orderInfo } = body

  // 2. Lưu kết quả giao dịch
  orderStore.set(orderId, {
    orderId,
    transId,
    resultCode,
    amount,
    payType,
    orderInfo,
    paidAt:  new Date().toISOString(),
    status:  resultCode === 0 ? 'PAID' : 'FAILED',
  })

<<<<<<< HEAD
  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })
=======
  console.log(`[MoMo IPN] Order ${orderId} → ${resultCode === 0 ? '✅ PAID' : '❌ FAILED'} (transId: ${transId})`)
>>>>>>> parent of 13dce33 (.)

  // 3. MoMo yêu cầu trả 204 (hoặc 200) ngay
  return res.status(204).end()
<<<<<<< HEAD
}
=======
}

// Export để /api/momo/status dùng chung store
export { orderStore }
>>>>>>> parent of 13dce33 (.)
