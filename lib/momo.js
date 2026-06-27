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

  if (storeId)     body.storeId     = storeId
  if (storeName)   body.storeName   = storeName
  if (partnerName) body.partnerName = partnerName
  
  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    let errBody = null
    try { errBody = await res.json() } catch { /* MoMo không trả JSON */ }
    console.error('[MoMo][createMoMoPayment] HTTP error:', {
      status: res.status,
      orderId,
      body: errBody,
    })
    throw new Error(`MoMo API error: ${res.status}${errBody?.message ? ' - ' + errBody.message : ''}`)
  }

  return res.json()
}

// ─── ATM HOSTED (ONE-TIME) ──────────────────────────────────────────────────
// Luồng ATM "hosted": khách KHÔNG nhập số thẻ trên web của mình — chỉ cần 1
// API call duy nhất lên /create với requestType=payWithATM, nhận lại payUrl
// rồi redirect khách sang trang MoMo để họ tự nhập thẻ ở đó.
// Khác với non-hosted: không cần cardInfo, không cần mToken, không cần gọi
// /pay riêng — và quan trọng là KHÔNG yêu cầu MoMo cấp quyền đặc biệt.
// Chuỗi ký signature giống hệt captureWallet, chỉ khác requestType.
// Tham khảo: https://developers.momo.vn/v3/vi/docs/payment/api/atm/onetime
export async function createMoMoATMHostedPayment({
  orderId,
  amount,
  orderInfo,
  extraData = '',
  storeId = DEFAULT_STORE_ID,
  storeName = DEFAULT_STORE_NAME,
  partnerName = DEFAULT_PARTNER_NAME,
}) {
  const requestId   = `${orderId}_atm_${Date.now()}`
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
    `requestType=payWithATM`,
  ].join('&')

  const signature = createSignature(rawSignature)

  const body = {
    partnerCode: PARTNER_CODE,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType: 'payWithATM',
    signature,
    lang: 'vi',
  }

  if (storeId)     body.storeId     = storeId
  if (storeName)   body.storeName   = storeName
  if (partnerName) body.partnerName = partnerName

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    let errBody = null
    try { errBody = await res.json() } catch { /* MoMo không trả JSON */ }
    console.error('[MoMo][createMoMoATMHostedPayment] HTTP error:', {
      status: res.status,
      orderId,
      requestId,
      body: errBody,
    })
    throw new Error(`MoMo ATM hosted API error: ${res.status}${errBody?.message ? ' - ' + errBody.message : ''}${errBody?.resultCode !== undefined ? ' (resultCode ' + errBody.resultCode + ')' : ''}`)
  }

  return res.json() // { resultCode, message, payUrl, deeplink, ... }
}

// ─── ATM NON-HOSTED — BƯỚC 1: INITIATE TRANSACTION ─────────────────────────
// Khách nhập thẳng thông tin thẻ ATM trên TRANG CỦA MÌNH (không redirect qua
// trang MoMo) — nên trước khi gửi cardInfo, phải gọi bước này để lấy mToken.
// Vẫn dùng chung ENDPOINT /v2/gateway/api/create như captureWallet, chỉ khác
// requestType = "initiate". Lưu ý: chuỗi ký signature ở bước này CÓ thêm
// partnerClientId (khác với signature của captureWallet ở trên).
// Tham khảo: https://developers.momo.vn/v3/vi/docs/payment/api/payment-api/init
async function initiateMoMoATMTransaction({
  orderId,
  amount,
  orderInfo,
  partnerClientId = '',
  extraData = '',
  storeId = DEFAULT_STORE_ID,
  storeName = DEFAULT_STORE_NAME,
  partnerName = DEFAULT_PARTNER_NAME,
}) {
  const requestId   = `${orderId}_init_${Date.now()}`
  const redirectUrl = `${BASE_URL}/result`
  const ipnUrl      = `${BASE_URL}/api/momo/ipn`

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${ipnUrl}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerClientId=${partnerClientId}`,
    `partnerCode=${PARTNER_CODE}`,
    `redirectUrl=${redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=initiate`,
  ].join('&')

  const signature = createSignature(rawSignature)

  const body = {
    partnerCode: PARTNER_CODE,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    requestType: 'initiate',
    partnerClientId,
    extraData,
    lang: 'vi',
    signature,
  }

  if (storeId)     body.storeId     = storeId
  if (partnerName) body.partnerName = partnerName
  // storeName không có trong spec Initiate Transaction nên không gửi lên

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    let errBody = null
    try { errBody = await res.json() } catch { /* MoMo không trả JSON */ }
    // An toàn để log: bước Initiate KHÔNG gửi cardInfo, body request/response
    // ở đây không chứa thông tin thẻ.
    console.error('[MoMo][initiateMoMoATMTransaction] HTTP error:', {
      status: res.status,
      orderId,
      requestId,
      body: errBody,
    })
    throw new Error(`MoMo initiate API error: ${res.status}${errBody?.message ? ' - ' + errBody.message : ''}${errBody?.resultCode !== undefined ? ' (resultCode ' + errBody.resultCode + ')' : ''}`)
  }

  return res.json() // { resultCode, message, mToken, requestId, ... }
}

// ─── ATM NON-HOSTED — BƯỚC 2: PROCESS TRANSACTION ──────────────────────────
// Gửi thông tin thẻ (cardInfo) + mToken vừa lấy được ở bước Initiate.
// Endpoint KHÁC bước Initiate: /v2/gateway/api/pay (không phải /create).
// Theo spec, request này KHÔNG có field "signature" trong body — mToken,
// partnerCode, orderId, requestId được gửi qua HEADER và đóng vai trò xác
// thực thay cho signature.
// Tham khảo: https://developers.momo.vn/v3/vi/docs/payment/api/atm/non-hosted
const PAY_ENDPOINT = process.env.MOMO_PAY_ENDPOINT || ENDPOINT.replace(/\/create$/, '/pay')

async function processMoMoATMPayment({
  orderId,
  requestId,
  mToken,
  amount,
  cardInfo, // { cardNumber, cardFullName, cardIssueDate } — KHÔNG bao giờ log object này ra console/Redis
  generateCardToken = false,
  lang = 'vi',
}) {
  const body = {
    cardInfo,
    requestType: 'payWithATM',
    generateCardToken,
    amount,
    lang,
  }

  const res = await fetch(PAY_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      mToken,
      partnerCode: PARTNER_CODE,
      orderId,
      requestId,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errBody = null
    try { errBody = await res.json() } catch { /* MoMo không trả JSON */ }
    // CHỈ log response từ MoMo, KHÔNG log `body` request hay `cardInfo`
    console.error('[MoMo][processMoMoATMPayment] HTTP error:', {
      status: res.status,
      orderId,
      requestId,
      body: errBody,
    })
    throw new Error(`MoMo ATM pay API error: ${res.status}${errBody?.message ? ' - ' + errBody.message : ''}${errBody?.resultCode !== undefined ? ' (resultCode ' + errBody.resultCode + ')' : ''}`)
  }

  return res.json() // { resultCode, message, payUrl, transId, ... }
}

// ─── ATM NON-HOSTED — GỘP 2 BƯỚC ────────────────────────────────────────────
// Hàm public duy nhất mà route /api/momo/create-atm cần gọi: tự động
// Initiate lấy mToken rồi Process với cardInfo ngay sau đó. Nếu Initiate
// thất bại (resultCode !== 0) thì trả luôn kết quả đó, không gọi bước 2.
export async function createMoMoATMPayment({
  orderId,
  amount,
  orderInfo,
  cardInfo,
  partnerClientId = '',
  storeId = DEFAULT_STORE_ID,
  storeName = DEFAULT_STORE_NAME,
  partnerName = DEFAULT_PARTNER_NAME,
}) {
  const initResult = await initiateMoMoATMTransaction({
    orderId, amount, orderInfo, partnerClientId, storeId, storeName, partnerName,
  })

  if (initResult.resultCode !== 0 || !initResult.mToken) {
    return initResult // route đọc resultCode/message để trả lỗi phù hợp cho client
  }

  const requestId = `${orderId}_pay_${Date.now()}`
  return processMoMoATMPayment({
    orderId,
    requestId,
    mToken: initResult.mToken,
    amount,
    cardInfo,
    generateCardToken: !!partnerClientId,
    lang: 'vi',
  })
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
    let errBody = null
    try { errBody = await res.json() } catch { /* MoMo không trả JSON */ }
    console.error('[MoMo][queryMoMoTransaction] HTTP error:', {
      status: res.status,
      orderId,
      body: errBody,
    })
    throw new Error(`MoMo query API error: ${res.status}${errBody?.message ? ' - ' + errBody.message : ''}`)
  }

  return res.json() // { resultCode, message, transId, amount, orderId, orderInfo, ... }
}