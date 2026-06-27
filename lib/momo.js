// lib/momo.js
import crypto from 'crypto'

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const ENDPOINT     = process.env.MOMO_ENDPOINT
const BASE_URL     = process.env.NEXT_PUBLIC_BASE_URL


function createSignature(rawString) {
  return crypto.createHmac('sha256', SECRET_KEY).update(rawString).digest('hex')
}

// Fallback mặc định lấy từ env nếu route gọi không truyền storeId/storeName/partnerName
const DEFAULT_STORE_ID     = process.env.MOMO_STORE_ID || ''
const DEFAULT_STORE_NAME   = process.env.MOMO_STORE_NAME || ''
const DEFAULT_PARTNER_NAME = process.env.MOMO_PARTNER_NAME || ''

/**
 * Tạo payment request gửi lên MoMo
 * @param {object} params
 * @param {string} params.orderId   - Mã đơn hàng (unique)
 * @param {number} params.amount    - Số tiền (VND, 1000–50000000)
 * @param {string} params.orderInfo - Mô tả đơn hàng
 * @param {string} [params.extraData] - Base64 JSON tuỳ chọn
 * @param {string} [params.storeId]     - Mã cửa hàng (optional, metadata, không nằm trong signature)
 * @param {string} [params.storeName]   - Tên cửa hàng (optional, metadata, không nằm trong signature)
 * @param {string} [params.partnerName] - Tên hiển thị ở ô "Nhà cung cấp" trên trang thanh toán MoMo (không nằm trong signature)
 */
export async function createMoMoPayment({
  orderId,
  amount,
  orderInfo,
  extraData = '',
  storeId = DEFAULT_STORE_ID,
  storeName = DEFAULT_STORE_NAME,
  partnerName = DEFAULT_PARTNER_NAME,
}) {
  const requestId   = `${orderId}_${Date.now()}`
  const redirectUrl = `${BASE_URL}/result`
  const ipnUrl      = `${BASE_URL}/api/momo/ipn`

  // storeId/storeName KHÔNG nằm trong chuỗi ký signature theo spec MoMo
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
    //accessKey:   ACCESS_KEY,
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

  // Chỉ thêm vào body khi có giá trị, tránh gửi field rỗng lên MoMo
  if (storeName) body.storeName = storeName
  if (partnerName) body.partnerName = partnerName  // ← Quyết định ô "Nhà cung cấp" hiển thị trên trang thanh toán

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

// Kiểm tra chữ ký IPN (Instant Payment Notification) từ MoMo
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

// Hỏi lại MoMo server-to-server xem đơn này thực sự đã thanh toán chưa.
// Dùng trong save.js để KHÔNG cần tin dữ liệu (resultCode...) do trình duyệt
// gửi lên — vì client có thể tự gọi /api/momo/save với resultCode giả.
// Endpoint "Query Transaction Status" của MoMo: cùng domain với ENDPOINT
// (tạo đơn), chỉ khác path cuối là /query thay vì /create.
//
// requestId ở đây là id MỚI riêng cho lần query này (theo đúng spec MoMo),
// KHÔNG phải requestId lúc tạo đơn — không cần lưu lại requestId gốc.

// Tham khảo: https://developers.momo.vn/#/docs/en/aiov2/?id=query-transaction-status
const QUERY_ENDPOINT = process.env.MOMO_QUERY_ENDPOINT || ENDPOINT.replace(/\/create$/, '/query')

export async function queryMoMoTransaction({ orderId }) {
  const requestId = `${orderId}_query_${Date.now()}`

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `orderId=${orderId}`,
    `partnerCode=${PARTNER_CODE}`,
    `requestId=${requestId}`,
  ].join('&')

  const signature = createSignature(rawSignature)

  const body = {
    partnerCode: PARTNER_CODE,
    requestId,
    orderId,
    lang: 'vi',
    signature,
  }

  const res = await fetch(QUERY_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`MoMo query API error: ${res.status}`)
  }

  return res.json() // { resultCode, message, transId, amount, orderId, orderInfo, ... }
}