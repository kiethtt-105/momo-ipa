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

  const {
    orderId, transId, resultCode, amount, payType, orderInfo,
    // === CÁC FIELD MỚI TỪ IPN ===
    requestId, message, responseTime, orderType, extraData,
  } = body

  const isPaid = parseInt(resultCode) === 0
  const now = new Date().toISOString()

  // Lấy record cũ để giữ createdAt gốc (khi tạo đơn)
  const existing = await redis.hget('momo:orders', orderId)
  let prev = null
  if (existing) {
    prev = typeof existing === 'string' ? JSON.parse(existing) : existing
    // Nếu đã PAID rồi thì bỏ qua IPN duplicate
    if (prev.status === 'PAID') {
      return res.status(204).end()
    }
  }

  const record = {
    orderId,
    transId:      transId || '',
    amount:       parseInt(amount || 0),
    payType:      payType || '',
    orderInfo:    orderInfo || '',
    resultCode:   parseInt(resultCode),
    message:      message || '',           // ← MỚI: message lỗi/thành công từ MoMo
    responseTime: responseTime || null,    // ← MỚI: timestamp MoMo xử lý xong (ms)
    orderType:    orderType || '',         // ← MỚI: loại giao dịch (momo_wallet, etc.)
    extraData:    extraData || '',         // ← MỚI: data tùy chỉnh lúc tạo đơn (base64)
    requestId:    requestId || '',         // ← MỚI: request ID gốc
    paidAt:       isPaid ? now : null,
    createdAt:    prev?.createdAt || now,  // ← Giữ createdAt gốc từ lúc tạo đơn
    status:       isPaid ? 'PAID' : 'FAILED',
    source:       'ipn',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })
  console.log(`[IPN] ${orderId} → ${isPaid ? '✅ PAID' : '❌ FAILED'} | resultCode: ${resultCode} | ${message}`)

  return res.status(204).end()
}
