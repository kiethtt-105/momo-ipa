// /pages/api/momo/scan.js
// POST-only handler: nhận mã thanh toán từ create-transaction inline scan
// GET handler + redirect đã bỏ — không còn dùng /admin/scan nữa

import crypto from 'crypto'
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const PUBLIC_KEY   = process.env.MOMO_POS_PUBLIC_KEY || ''
const POS_ENDPOINT = 'https://payment.momo.vn/v2/gateway/api/pos'

const STORE_ID   = process.env.MOMO_STORE_ID || ''
const STORE_NAME = process.env.MOMO_STORE_NAME || ''

function sign(raw) {
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

function encryptPaymentCode(code) {
  if (!PUBLIC_KEY) throw new Error('MOMO_POS_PUBLIC_KEY chưa được thiết lập trong .env')

  let normalized = PUBLIC_KEY.replace(/\\n/g, '\n').trim()

  if (!normalized.includes('-----BEGIN')) {
    normalized = `-----BEGIN PUBLIC KEY-----\n${normalized}\n-----END PUBLIC KEY-----`
  }

  return crypto.publicEncrypt(
    { key: normalized, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(code)
  ).toString('base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }
  return handlePosCharge(req, res)
}

async function handlePosCharge(req, res) {
  // Trước đây check session bằng cách tự fetch(`${BASE_URL}/api/admin/session`)
  // — tốn 1 round-trip HTTP không cần thiết, và BASE_URL hardcode theo
  // NODE_ENV nên hỏng trên Vercel Preview deployment (không phải production,
  // không phải localhost). Gọi thẳng requireAdmin như các route khác.
  if (!requireAdmin(req, res)) return

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[scan][POST] Thiếu env: MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY')
    return res.status(500).json({ error: 'Server thiếu cấu hình MoMo (kiểm tra biến môi trường)' })
  }

  let { orderId: rawOrderId, amount, orderInfo: rawOrderInfo, paymentCode: rawPaymentCode } = req.body

  if (!rawOrderId || !amount || !rawPaymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: orderId, amount, paymentCode' })
  }

  let orderId = String(rawOrderId).trim()
  if (!orderId.startsWith('iPOS') && !orderId.startsWith('POS')) {
    orderId = `iPOS${orderId}`
  }

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    orderInfo = orderId
  }

  const paymentCode = String(rawPaymentCode).trim()
  if (!/^(MM|mm)?\d{18}$/.test(paymentCode)) {
    return res.status(400).json({ error: 'Mã thanh toán không hợp lệ (18 chữ số, có thể có MM/mm)' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 10_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 10.000.000 ₫)' })
  }

  let encryptedCode
  try {
    encryptedCode = encryptPaymentCode(paymentCode)
  } catch (err) {
    console.error('[scan][POST] RSA Encrypt Error:', err.message)
    return res.status(500).json({ error: 'Lỗi mã hóa mã thanh toán' })
  }

  const requestId = `${PARTNER_CODE}_${Date.now()}`
  const extraData = ''

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${amt}`,
    `extraData=${extraData}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${PARTNER_CODE}`,
    `paymentCode=${encryptedCode}`,
    `requestId=${requestId}`,
  ].join('&')

  const body = {
    partnerCode: PARTNER_CODE,
    partnerName: process.env.MOMO_PARTNER_NAME || '',
    requestId,
    amount: amt,
    orderId,
    orderInfo,
    paymentCode: encryptedCode,
    extraData,
    autoCapture: true,
    lang: 'vi',
    signature: sign(rawSignature),
  }

  if (STORE_ID)   body.storeId   = STORE_ID
  if (STORE_NAME) body.storeName = STORE_NAME

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
        paymentOption: '',
        source: 'pos',
      }),
    })

    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const rawText = await momoRes.text()
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo,
          status: 'FAILED', createdAt: now, paidAt: null,
          transId: '', payType: 'pos', paymentOption: '',
          resultCode: -1, message: 'MoMo trả về dữ liệu không hợp lệ',
          source: 'pos',
        }),
      })
      return res.status(500).json({ error: 'MoMo trả về dữ liệu không hợp lệ' })
    }

    const updated = {
      orderId,
      amount: amt,
      orderInfo,
      status: data.resultCode === 0 ? 'PAID' : 'FAILED',
      createdAt: now,
      paidAt: data.resultCode === 0 ? new Date().toISOString() : null,
      transId: data.transId?.toString() || '',
      payType: data.payType || 'pos',
      paymentOption: data.paymentOption || '',
      resultCode: data.resultCode,
      message: data.message || 'Không có thông báo',
      responseTime: data.responseTime,
      source: 'pos',
    }

    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    console.log(
      `[scan][POST] MoMo response: ${orderId}`,
      `resultCode: ${data.resultCode}`,
      `message: ${data.message}`
    )

    return res.status(200).json(data)

  } catch (err) {
    console.error('[scan][POST] Server Error:', err)
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
    try {
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo,
          status: 'FAILED', createdAt: now, paidAt: null,
          transId: '', payType: 'pos', paymentOption: '',
          resultCode: -1,
          message: isTimeout ? 'Timeout khi gọi MoMo (15s)' : (err.message || 'Lỗi server'),
          source: 'pos',
        }),
      })
    } catch (redisErr) {
      console.error('[scan][POST] Redis update FAILED error:', redisErr)
    }
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? 'Timeout khi gọi MoMo, vui lòng thử lại'
        : 'Lỗi server khi xử lý thanh toán',
    })
  }
}