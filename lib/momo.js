import crypto from 'crypto'

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const ENDPOINT     = process.env.MOMO_ENDPOINT
const BASE_URL     = process.env.NEXT_PUBLIC_BASE_URL

/**
 * Tạo chữ ký HMAC-SHA256 theo chuẩn MoMo
 */
function createSignature(rawString) {
  return crypto.createHmac('sha256', SECRET_KEY).update(rawString).digest('hex')
}

/**
 * Tạo payment request gửi lên MoMo
 * @param {object} params
 * @param {string} params.orderId   - Mã đơn hàng (unique)
 * @param {number} params.amount    - Số tiền (VND, 1000–50000000)
 * @param {string} params.orderInfo - Mô tả đơn hàng
 * @param {string} [params.extraData] - Base64 JSON tuỳ chọn
 */
export async function createMoMoPayment({ orderId, amount, orderInfo, extraData = '' }) {
  const requestId   = `${orderId}_${Date.now()}`
  const redirectUrl = `${BASE_URL}/result`
  const ipnUrl      = `${BASE_URL}/api/momo/ipn`

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${ipnUrl}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${PARTNER_CODE}`,
    `redirectUrl=${redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=captureWallet`,
  ].join('&')

  const signature = createSignature(rawSignature)

  const body = {
    partnerCode: PARTNER_CODE,
    accessKey:   ACCESS_KEY,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType: 'captureWallet',
    signature,
    lang: 'vi',
  }

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`MoMo API error: ${res.status}`)
  }

  return res.json()
}

/**
 * Xác thực chữ ký IPN callback từ MoMo
 */
export function verifyIpnSignature(body) {
  const {
    accessKey, amount, extraData, message, orderId,
    orderInfo, orderType, partnerCode, payType,
    requestId, responseTime, resultCode, transId, signature,
  } = body

  const rawString = [
    `accessKey=${accessKey}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `message=${message}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `orderType=${orderType}`,
    `partnerCode=${partnerCode}`,
    `payType=${payType}`,
    `requestId=${requestId}`,
    `responseTime=${responseTime}`,
    `resultCode=${resultCode}`,
    `transId=${transId}`,
  ].join('&')

  const expected = createSignature(rawString)
  return expected === signature
}
