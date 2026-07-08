// /pages/api/momo/scan.js
import crypto from 'crypto'
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'
import { resolveStore } from '../../../lib/stores'
import { markOrderOpen, markOrderClosed } from '../../../lib/openOrders'
import { formatResultCodeMessage } from '../../../lib/momoResultCodes'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const PUBLIC_KEY   = process.env.MOMO_POS_PUBLIC_KEY || ''
const POS_ENDPOINT = 'https://payment.momo.vn/v2/gateway/api/pos'

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
  
  if (!requireAdmin(req, res)) return

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[scan][POST] Thiếu env: MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY')
    return res.status(500).json({ error: 'Server thiếu cấu hình MoMo (kiểm tra biến môi trường)' })
  }

  let { orderId: rawOrderId, amount, orderInfo: rawOrderInfo, paymentCode: rawPaymentCode, storeId: rawStoreId } = req.body

  if (!rawOrderId || !amount || !rawPaymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: orderId, amount, paymentCode' })
  }

  let orderId = String(rawOrderId).trim()
  if (!orderId.startsWith('iPOS') && !orderId.startsWith('POS')) {
    orderId = `iPOS${orderId}`
  }

  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
   
    orderInfo = `Thanh Toán ${orderId}`
  }

  const paymentCode = String(rawPaymentCode).trim()
  if (!/^(MM|mm)?\d{18}$/.test(paymentCode)) {
    return res.status(400).json({ error: 'Mã thanh toán không hợp lệ (18 chữ số, có thể có MM/mm)' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 10_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 10.000.000 ₫)' })
  }


  const store = resolveStore((rawStoreId || '').toString().trim())

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

  if (store.id)   body.storeId   = store.id
  if (store.name) body.storeName = store.name

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
        source: 'pos', storeId: store.id, storeName: store.name,
        type: 'scan',

        submittedCode: paymentCode,
      }),
    })
    // Đánh dấu "đang mở" — cho phép các thiết bị khác thấy đơn này qua
    // /api/momo/list-open trong lúc chờ MoMo phản hồi (tối đa ~15s).
    await markOrderOpen(redis, orderId, Date.now())

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
          resultCode: -1, message: '⚠ Lỗi hệ thống MoMo — MoMo trả về dữ liệu không hợp lệ (không phải JSON). Thử lại sau, nếu lặp lại nhiều lần thì liên hệ MoMo.',
          source: 'pos', storeId: store.id, storeName: store.name,
          type: 'scan', submittedCode: paymentCode,
        }),
      })
      await markOrderClosed(redis, orderId)
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
      // Dịch resultCode qua bảng tra cứu đầy đủ + phân loại rõ lỗi do ai
      // (hệ thống MoMo / do cấu hình bên mình — admin cần kiểm tra ngay /
      // do khách hàng) thay vì chỉ lưu nguyên văn "message" MoMo trả về
      // (nhiều khi cộc lốc hoặc không đủ rõ để admin xử lý ngay).
      message: data.resultCode === 0 ? (data.message || 'Thanh toán thành công') : formatResultCodeMessage(data.resultCode, data.message),
      responseTime: data.responseTime,
      source: 'pos', storeId: store.id, storeName: store.name,
      type: 'scan', submittedCode: paymentCode,
    }

    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })
    await markOrderClosed(redis, orderId)

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
          message: isTimeout
            ? '⚠ Lỗi hệ thống MoMo — Timeout khi gọi MoMo (15s), không rõ giao dịch có được xử lý phía MoMo hay không. Kiểm tra lại bằng mã đơn hàng trước khi tạo lại.'
            : `⚠ Lỗi hệ thống (server) — ADMIN cần kiểm tra log server: ${err.message || 'Lỗi server'}`,
          source: 'pos', storeId: store.id, storeName: store.name,
          type: 'scan', submittedCode: paymentCode,
        }),
      })
      await markOrderClosed(redis, orderId)
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