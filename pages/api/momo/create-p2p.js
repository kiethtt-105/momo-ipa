import { createMoMoPayment } from '../../../lib/momo'
import { Redis } from '@upstash/redis'
import QRCode from 'qrcode'
import { requireAdmin } from '../../../lib/requireAdmin'
import { resolveStore } from '../../../lib/stores'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const SHORTCUT_API_KEY = process.env.SHORTCUT_API_KEY || ''

function isValidShortcutKey(req) {
  if (!SHORTCUT_API_KEY) return false
  const headerKey = req.headers['x-api-key']
  const queryKey = (req.query.key || '').toString()
  return headerKey === SHORTCUT_API_KEY || queryKey === SHORTCUT_API_KEY
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const shortcutOk = isValidShortcutKey(req)
  if (!shortcutOk) {
    if (!requireAdmin(req, res)) return
  }

  const params = req.method === 'GET' ? req.query : req.body

  const amt = parseInt(params.amount)
  if (isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 50.000.000 ₫)' })
  }

  const rawOrderId = (params.orderId || '').toString().trim()
  const rawOrderInfo = (params.orderInfo || '').toString().trim()

  const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '')

  let orderId
  if (rawOrderId) {
    const clean = sanitize(rawOrderId)
    orderId = clean.startsWith('iPOS') ? clean : `iPOS${clean}`
  } else {
    orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  }

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    orderInfo = `Thanh toan DH ${orderId}`
  }

  // ─── CHỌN CỬA HÀNG ───────────────────────────────────────────
  // - Nếu request truyền storeId (chọn thủ công trên trang tạo giao dịch)
  //   → dùng đúng cửa hàng đó.
  // - Nếu không truyền (ví dụ link nhanh/shortcut không kèm storeId)
  //   → tự động dùng cửa hàng được đánh dấu "default" trong MOMO_STORES.
  const rawStoreId = (params.storeId || '').toString().trim()
  const store = resolveStore(rawStoreId)

  const storeId = store.id
  const storeName = store.name
  const partnerName = store.partnerName

  const now = new Date().toISOString()

  try {
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo, status: 'PENDING',
        createdAt: now, paidAt: null, transId: '', payType: '',
        paymentOption: '', source: shortcutOk ? 'create-p2p-shortcut' : 'create-p2p',
        storeId, storeName, partnerName,
      }),
    })

    const result = await createMoMoPayment({
      orderId, amount: amt, orderInfo, storeId, storeName, partnerName,
    })

    if (result.resultCode !== 0) {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo, status: 'FAILED',
          createdAt: now, paidAt: null, transId: '', payType: '',
          paymentOption: '', source: shortcutOk ? 'create-p2p-shortcut' : 'create-p2p',
          storeId, storeName, partnerName, error: result.message || '',
        }),
      })
      return res.status(400).json({
        error: result.message || 'MoMo từ chối giao dịch',
        resultCode: result.resultCode,
      })
    }

    let qrCodeImage = ''
    const qrSource = result.qrCodeUrl || result.payUrl
    if (qrSource) {
      try {
        qrCodeImage = await QRCode.toDataURL(qrSource, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 400,
        })
      } catch (qrErr) {
        console.error('[create-p2p] QR Generate Error:', qrErr.message)
      }
    }

    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo, status: 'PENDING',
        createdAt: now, paidAt: null, transId: '', payType: '',
        paymentOption: '', source: shortcutOk ? 'create-p2p-shortcut' : 'create-p2p',
        storeId, storeName, partnerName,
        payUrl: result.payUrl || '',
        deeplink: result.deeplink || '',
        qrCodeUrl: result.qrCodeUrl || '',
        qrCodeImage,
        requestId: result.requestId || '',
      }),
    })

    return res.status(200).json({
      payUrl: result.payUrl,
      deeplink: result.deeplink,
      qrCodeUrl: result.qrCodeUrl,
      qrCodeImage,
      orderId: result.orderId,
      requestId: result.requestId,
      storeId,
      storeName,
    })
  } catch (err) {
    console.error('[MoMo] create-p2p error:', err)
    return res.status(500).json({ error: 'Lỗi server, thử lại sau' })
  }
}