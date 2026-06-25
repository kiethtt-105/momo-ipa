import { createMoMoPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})


export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const params = req.method === 'GET' ? req.query : req.body

  const amt = parseInt(params.amount)
  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 50.000.000 ₫)' })
  }


  const rawOrderId = (params.orderId || '').toString().trim()
  const rawOrderInfo = (params.orderInfo || '').toString().trim()

  let orderId
  if (rawOrderId) {
    orderId = rawOrderId.startsWith('iPOS') ? rawOrderId : `iPOS${rawOrderId}`
  } else if (rawOrderInfo) {
    orderId = rawOrderInfo.startsWith('iPOS') ? rawOrderInfo : `iPOS${rawOrderInfo}`
  } else {
    orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  }

  const orderInfo = rawOrderInfo || `Thanh toan DH ${orderId}`
  const now = new Date().toISOString()

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId,
        amount: amt,
        orderInfo,
        status: 'PENDING',
        createdAt: now,
        paidAt: null,
        transId: '',
        payType: '',
        source: 'create-p2p',
      }),
    })

    const result = await createMoMoPayment({ orderId, amount: amt, orderInfo })

    if (result.resultCode !== 0) {
      return res.status(400).json({
        error: result.message || 'MoMo từ chối giao dịch',
        resultCode: result.resultCode,
      })
    }

    return res.status(200).json({
      payUrl: result.payUrl,
      deeplink: result.deeplink,
      qrCodeUrl: result.qrCodeUrl,
      orderId: result.orderId,
      requestId: result.requestId,
    })
  } catch (err) {
    console.error('[MoMo] create-p2p error:', err)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}
