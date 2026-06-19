import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
// POS endpoint: https://payment.momo.vn/v2/gateway/api/pos
const POS_ENDPOINT = process.env.MOMO_POS_ENDPOINT ||
  (process.env.MOMO_ENDPOINT || '').replace(/\/create$/, '/pos')

// Public Key do MoMo cấp, lấy từ M4B Portal > "3. Tích hợp POS" > ô "Public Key".
// Đặt trong .env dạng MOMO_POS_PUBLIC_KEY (base64, không có header/footer PEM),
// hoặc dạng PEM đầy đủ (-----BEGIN PUBLIC KEY-----...) — cả hai đều được xử lý dưới đây.
const RAW_PUBLIC_KEY = process.env.MOMO_POS_PUBLIC_KEY || ''

function toPem(rawKey) {
  if (!rawKey) return ''
  if (rawKey.includes('BEGIN PUBLIC KEY')) return rawKey // đã là PEM đầy đủ
  const b64 = rawKey.replace(/\s+/g, '')
  const lines = b64.match(/.{1,64}/g)?.join('\n') || b64
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`
}

const PUBLIC_KEY_PEM = toPem(RAW_PUBLIC_KEY)

/**
 * Mã hóa RSA (PKCS1v15) cho field "hash" của API /pos.
 * Theo code Golang chính thức của MoMo (PosHash struct):
 *   { PartnerCode, PartnerRefID, Amount, PaymentCode } -> JSON -> RSA encrypt -> base64
 */
function encryptPosHash({ partnerCode, partnerRefId, amount, paymentCode }) {
  if (!PUBLIC_KEY_PEM) {
    throw new Error('MOMO_POS_PUBLIC_KEY chưa được cấu hình trong biến môi trường')
  }
  const payload = JSON.stringify({
    partnerCode,
    partnerRefId,
    amount: String(amount),
    paymentCode,
  })
  const encrypted = crypto.publicEncrypt(
    {
      key: PUBLIC_KEY_PEM,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(payload, 'utf8')
  )
  return encrypted.toString('base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Session guard — reuse same cookie auth as orders endpoint
  const cookie = req.headers.cookie || ''
  const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/session`, {
    headers: { cookie },
  })
  if (!sessionRes.ok || !(await sessionRes.json()).authed) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { orderId, amount, orderInfo, paymentCode } = req.body

  if (!orderId || !amount || !paymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 5_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1,000–5,000,000 ₫)' })
  }

  // partnerRefId đóng vai trò tương đương requestId/orderId trong API /create,
  // nhưng đây là field MoMo định nghĩa riêng cho /pos.
  const partnerRefId = `${orderId}_${Date.now()}`

  let hash
  try {
    hash = encryptPosHash({
      partnerCode: PARTNER_CODE,
      partnerRefId,
      amount: amt,
      paymentCode,
    })
  } catch (err) {
    console.error('[POS] RSA encrypt error:', err)
    return res.status(500).json({ error: 'Lỗi mã hóa RSA: ' + err.message })
  }

  // Payload chuẩn API /pos — CHỈ 4 field, theo PosPayload struct (Golang) của MoMo:
  // { PartnerCode, PartnerRefID, Hash, Version }
  const body = {
    partnerCode: PARTNER_CODE,
    partnerRefId,
    hash,
    version: 2.0,
  }

  try {
    // Save pending record
    const now = new Date().toISOString()
    await redis.hset('momo:orders', {
      [orderId]: JSON.stringify({
        orderId, amount: amt, orderInfo: orderInfo || '',
        status: 'PENDING', createdAt: now,
        paidAt: null, transId: '', payType: '',
        source: 'pos', partnerRefId,
      }),
    })
    console.log('[POS] endpoint:', POS_ENDPOINT)
    console.log('[POS] body:', JSON.stringify(body))
    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })
    const rawText = await momoRes.text()
    console.log('[POS] status:', momoRes.status)
    console.log('[POS] raw response:', rawText)
    const data = JSON.parse(rawText)

    // Update record with result
    const updated = {
      orderId, amount: amt, orderInfo: orderInfo || '',
      status: data.resultCode === 0 ? 'PAID' : 'FAILED',
      createdAt: now,
      paidAt: data.resultCode === 0 ? new Date().toISOString() : null,
      transId: data.transId?.toString() || '',
      payType: data.payType || 'pos',
      resultCode: data.resultCode,
      message: data.message,
      responseTime: data.responseTime,
      source: 'pos',
      partnerRefId,
    }
    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    return res.status(200).json(data)
  } catch (err) {
    console.error('[POS] error:', err)
    return res.status(500).json({ error: 'Lỗi server' })
  }
}