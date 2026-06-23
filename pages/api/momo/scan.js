// /pages/api/momo/scan.js
//
// Gộp 2 file cũ vào đây để cùng nằm 1 chỗ, đúng nhóm với create-p2p.js
// (cùng là endpoint xử lý 1 luồng thanh toán MoMo cụ thể):
//   - pages/api/momo/pos.js          → logic xử lý ở method POST (đổi paymentCode → trừ tiền)
//   - pages/api/admin/scan-quick.js  → logic xử lý ở method GET  (redirect link nhanh sang /admin/scan)
//
// Trước đây 2 file này tách rời và nằm ở 2 thư mục khác nhau (api/admin và api/momo)
// dù cùng phục vụ 1 luồng "Scan QR tại quầy" → gộp lại theo path/method cho gọn,
// đỡ phải nhớ 2 tên file khác nhau cho cùng 1 tính năng.
//
// GET  /api/momo/scan?amount=&orderInfo=        → redirect sang /admin/scan?amount=...&quick=true
// POST /api/momo/scan { orderId, amount, orderInfo, paymentCode } → gọi MoMo POS API, lưu Redis

import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY
const SECRET_KEY   = process.env.MOMO_SECRET_KEY
const PUBLIC_KEY   = process.env.MOMO_POS_PUBLIC_KEY || ''
const POS_ENDPOINT = 'https://payment.momo.vn/v2/gateway/api/pos'

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://kiehtt.vercel.app'
  : 'http://localhost:3000'

// Tạo signature
function sign(raw) {
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

// Encrypt paymentCode bằng Public Key của MoMo
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
  if (req.method === 'GET')  return handleQuickRedirect(req, res)
  if (req.method === 'POST') return handlePosCharge(req, res)
  return res.status(405).json({ error: 'Method Not Allowed' })
}

// ═══════════════════════════════════════════════════════════
// GET — Link nhanh (trước đây: /api/admin/scan-quick)
// Dùng cho iPhone Shortcuts hoặc bất kỳ chỗ nào cần 1 URL gọi
// trực tiếp để mở sẵn màn hình Scan với số tiền/nội dung định trước.
// ═══════════════════════════════════════════════════════════
async function handleQuickRedirect(req, res) {
  const { amount, orderInfo = 'Thanh toán tại quầy' } = req.query
  const amt = parseInt(amount)

  if (!amt || isNaN(amt) || amt < 1000 || amt > 50_000_000) {
    return res.status(400).send('Số tiền không hợp lệ (1.000 - 50.000.000 ₫)')
  }

  const cookie = req.headers.cookie || ''

  try {
    const sessionRes = await fetch(`${BASE_URL}/api/admin/session`, {
      headers: { cookie },
    })
    await sessionRes.json()
    // Dù login hay chưa, đều redirect về /admin/scan
    // (Nếu chưa login, trang scan sẽ hiện form login)
  } catch (error) {
    console.error('[scan][GET] Lỗi kiểm tra session:', error)
    // Vẫn redirect tiếp dù check session lỗi — /admin/scan sẽ tự xử lý lại auth
  }

  const scanUrl = `/admin/scan?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}&quick=true`
  return res.redirect(302, scanUrl)
}

// ═══════════════════════════════════════════════════════════
// POST — Xử lý thanh toán POS (trước đây: /api/momo/pos)
// ═══════════════════════════════════════════════════════════
async function handlePosCharge(req, res) {
  // ====================== AUTH CHECK ======================
  const cookie = req.headers.cookie || ''

  try {
    const sessionRes = await fetch(`${BASE_URL}/api/admin/session`, {
      headers: { cookie },
      credentials: 'include',
    })

    const sessionData = await sessionRes.json()

    if (!sessionRes.ok || !sessionData.authed) {
      return res.status(401).json({ error: 'Unauthorized - Vui lòng đăng nhập admin' })
    }
  } catch (err) {
    console.error('[scan][POST] Auth check error:', err)
    return res.status(401).json({ error: 'Lỗi kiểm tra phiên đăng nhập' })
  }

  // ====================== VALIDATION & PROCESSING ======================
  let { orderId: rawOrderId, amount, orderInfo: rawOrderInfo, paymentCode: rawPaymentCode } = req.body

  if (!rawOrderId || !amount || !rawPaymentCode) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: orderId, amount, paymentCode' })
  }

  // Chuẩn hóa orderId → chỉ thêm tiền tố iPOS khi orderId CHƯA có tiền tố nào.
  // QUAN TRỌNG: orderId từ scan.js đã có dạng "POS<timestamp>" — nếu cứ thêm
  // "iPOS" vào trước thì ra "iPOSPOS<timestamp>", khác hẳn id gốc đã lưu ở
  // save-pending.js/Redis và id hiển thị cho admin → lệch dữ liệu, MoMo nhận
  // 1 id, hệ thống lưu/hiển thị 1 id khác.
  let orderId = String(rawOrderId).trim()
  if (!orderId.startsWith('iPOS') && !orderId.startsWith('POS')) {
    orderId = `iPOS${orderId}`
  }

  // Xử lý orderInfo - dùng luôn orderId đầy đủ (iPOS...)
  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo) {
    orderInfo = orderId  // Hiển thị iPOS178... trên MoMo
  }

  const paymentCode = String(rawPaymentCode).trim()
  if (!/^(MM|mm)?\d{18}$/.test(paymentCode)) {
    return res.status(400).json({ error: 'Mã thanh toán không hợp lệ (18 chữ số, có thể có MM/mm)' })
  }

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 10_000_000) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 10.000.000 ₫)' })
  }

  // ====================== ENCRYPT & SIGN ======================
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
    orderId,
    requestId,
    amount: amt,
    orderInfo,
    paymentCode: encryptedCode,
    extraData,
    autoCapture: true,
    lang: 'vi',
    signature: sign(rawSignature),
  }

  const now = new Date().toISOString()

  try {
    // Lưu order pending
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
        source: 'pos',
      }),
    })

    // Gửi request tới MoMo
    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const rawText = await momoRes.text()
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      return res.status(500).json({ error: 'MoMo trả về dữ liệu không hợp lệ' })
    }

    // Cập nhật kết quả vào Redis
    const updated = {
      orderId,
      amount: amt,
      orderInfo,
      status: data.resultCode === 0 ? 'PAID' : 'FAILED',
      createdAt: now,
      paidAt: data.resultCode === 0 ? new Date().toISOString() : null,
      transId: data.transId?.toString() || '',
      payType: data.payType || 'pos',
      resultCode: data.resultCode,
      message: data.message || 'Không có thông báo',
      responseTime: data.responseTime,
      source: 'pos',
    }

    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })

    console.log(`[scan][POST] Success: ${orderId} - Result: ${data.resultCode}`)

    return res.status(200).json(data)

  } catch (err) {
    console.error('[scan][POST] Server Error:', err)
    return res.status(500).json({ error: 'Lỗi server khi xử lý thanh toán' })
  }
}