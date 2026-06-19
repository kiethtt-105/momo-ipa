import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { orderId, amount, orderInfo } = req.body

  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Thiếu orderId hoặc amount' })
  }

  const now = new Date().toISOString()

  try {
    // Chỉ lưu trạng thái PENDING vào hệ thống của bạn, hoàn toàn không gọi sang MoMo
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId,
        amount: parseInt(amount),
        orderInfo: orderInfo || orderId,
        status: 'PENDING',
        createdAt: now,
        paidAt: null,
        transId: '',
        payType: 'pos',
        source: 'pos',
      }),
    })

    return res.status(200).json({ success: true, message: 'Đã tạo log đơn hàng nháp' })
  } catch (err) {
    console.error('[SAVE-PENDING] Error:', err)
    return res.status(500).json({ error: 'Lỗi server khi lưu đơn hàng nháp' })
  }
}