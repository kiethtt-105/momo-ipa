import { createMoMoPayment } from '../../../lib/momo'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { orderId, amount, orderInfo } = req.body

  // --- Validate ---
  if (!orderId || !amount || !orderInfo) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: orderId, amount, orderInfo' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).json({ error: 'Số tiền phải từ 1.000 đến 50.000.000 VND' })
  }

  try {
    const result = await createMoMoPayment({ orderId, amount: amt, orderInfo })

    if (result.resultCode !== 0) {
      return res.status(400).json({
        error:      result.message || 'MoMo từ chối giao dịch',
        resultCode: result.resultCode,
      })
    }

    return res.status(200).json({
      payUrl:      result.payUrl,
      deeplink:    result.deeplink,
      qrCodeUrl:   result.qrCodeUrl,
      orderId:     result.orderId,
      requestId:   result.requestId,
    })
  } catch (err) {
    console.error('[MoMo] create error:', err)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}
