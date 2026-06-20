import { createMoMoPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  const amt = parseInt(req.query.amount)

  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).send('Số tiền không hợp lệ (1.000 – 50.000.000 ₫)')
  }

  const orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  const orderInfo = `Thanh toán ${orderId}`
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
        source: 'redirect',
      }),
    })

    const result = await createMoMoPayment({ orderId, amount: amt, orderInfo })

    if (result.resultCode !== 0) {
      return res.status(400).send(`MoMo lỗi: ${result.message}`)
    }

    // Redirect thẳng lên MoMo
    return res.redirect(302, result.payUrl)
  } catch (err) {
    console.error('[MoMo] redirect error:', err)
    return res.status(500).send('Lỗi server, thử lại sau')
  }
}