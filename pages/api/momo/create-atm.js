import { createMoMoATMHostedPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const STORE_ID = process.env.MOMO_STORE_ID || ''
const STORE_NAME = process.env.MOMO_STORE_NAME || ''
const PARTNER_NAME = process.env.MOMO_PARTNER_NAME || ''

// ATM Hosted: khách KHÔNG nhập thẻ trên web của mình, MoMo redirect họ sang
// trang riêng để nhập thẻ — nên route này KHÔNG cần nhận/validate cardInfo,
// và cũng không cần lo về việc lộ số thẻ qua log/Redis.

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Route này tạo giao dịch THẬT bằng credential merchant — không auth thì
  // ai cũng spam tạo đơn được (tốn quota MoMo, có thể bị flag tài khoản).
  // Chỉ admin đã đăng nhập mới được gọi.
  if (!requireAdmin(req, res)) return

  const params = req.method === 'GET' ? req.query : (req.body || {})

  console.log('[MoMo][create-atm] incoming request:', {
    amount: params.amount,
    orderId: params.orderId,
    orderInfo: params.orderInfo,
    storeId: params.storeId,
    storeName: params.storeName,
    partnerName: params.partnerName,
  })

  // ATM hosted: số tiền tối thiểu 10.000đ theo spec MoMo (khác mức 1.000đ
  // áp dụng cho ví thường ở create-p2p.js)
  const amt = parseInt(params.amount)
  if (isNaN(amt) || amt < 10_000 || amt > 50_000_000) {
    console.warn('[MoMo][create-atm] invalid amount:', params.amount)
    return res.status(400).json({ error: 'Số tiền không hợp lệ (10.000 – 50.000.000 ₫)' })
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

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    orderInfo = `Thanh toan ATM DH ${orderId}`
  }

  // Cho phép override storeId/storeName/partnerName theo request, fallback về env
  const storeId = (params.storeId || STORE_ID || '').toString().trim()
  const storeName = (params.storeName || STORE_NAME || '').toString().trim()
  const partnerName = (params.partnerName || PARTNER_NAME || '').toString().trim()

  const now = new Date().toISOString()

  console.log('[MoMo][create-atm] processed order:', {
    orderId,
    orderInfo,
    amount: amt,
    storeId,
    storeName,
    partnerName,
  })

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
        paymentOption: 'ATM',
        source: 'create-atm',
        storeId,
        storeName,
        partnerName,
      }),
    })

    console.log('[MoMo][create-atm] saved order to redis:', orderId)

    const result = await createMoMoATMHostedPayment({
      orderId,
      amount: amt,
      orderInfo,
      storeId,
      storeName,
      partnerName,
    })

    if (result.resultCode !== 0) {
      console.warn('[MoMo][create-atm] MoMo rejected transaction:', {
        orderId,
        resultCode: result.resultCode,
        message: result.message,
      })
      return res.status(400).json({
        error: result.message || 'MoMo từ chối giao dịch',
        resultCode: result.resultCode,
      })
    }

    console.log('[MoMo][create-atm] MoMo accepted transaction:', {
      orderId: result.orderId || orderId,
      requestId: result.requestId,
      resultCode: result.resultCode,
    })

    return res.status(200).json({
      payUrl: result.payUrl,
      deeplink: result.deeplink,
      orderId: result.orderId || orderId,
      requestId: result.requestId,
    })
  } catch (err) {
    console.error('[MoMo][create-atm] error:', {
      orderId,
      message: err?.message,
      stack: err?.stack,
    })
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}