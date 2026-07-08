// /pages/api/momo/pos-charge.js
//
// Dùng cho luồng thanh toán trên iPhone Shortcut:
//   1. Chọn cửa hàng (chọn ngay trên Shortcut, gửi lên bằng storeId)
//   2. Nhập số tiền
//   3. Nội dung thanh toán — để trống/không đổi thì tự dùng mặc định
//      "Thanh Toán {orderId} - {tên cửa hàng}"
//   4. Quét mã thanh toán (paymentCode 18 số)
//   5. Xác nhận giao dịch — gọi route này, MoMo trả kết quả ngay (đồng bộ)
//
// Hỗ trợ CẢ GET lẫn POST — Shortcut dựng "Get Contents of URL" bằng GET
// (query string) dễ và nhanh hơn nhiều so với dựng JSON body cho POST,
// nên route này chấp nhận query cho GET, JSON body cho POST, cùng logic xử
// lý phía sau như nhau. Giống hệt cơ chế GET của create-p2p.js.
//
// Xác thực: CHỈ isValidShortcutKey(req) (header x-api-key hoặc query
// ?key=, dùng chung biến env SHORTCUT_API_KEY với create-p2p.js) — không
// còn fallback requireAdmin. Route này chỉ dành cho Shortcut của chủ cửa
// hàng (người giữ key), không phải cho trang admin nên bỏ luôn nhánh check
// session admin — vừa đơn giản hoá vừa tránh trường hợp Shortcuts (không
// gửi cookie session) bị rơi vào nhánh requireAdmin và phải chờ tới khi
// hết hạn function.

import crypto from 'crypto'
import { Redis } from '@upstash/redis'
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

const SHORTCUT_API_KEY = process.env.SHORTCUT_API_KEY || ''

// Giống hệt hàm trong create-p2p.js — cho phép Shortcut gọi bằng key cố
// định (header x-api-key hoặc query ?key=) thay vì session admin.
function isValidShortcutKey(req) {
  if (!SHORTCUT_API_KEY) return false
  const headerKey = (req.headers['x-api-key'] || '').toString()
  const queryKey = (req.query.key || '').toString()
  return headerKey === SHORTCUT_API_KEY || queryKey === SHORTCUT_API_KEY
}

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
  console.log('[pos-charge] ==> Nhận request, method:', req.method, '| query:', JSON.stringify(req.query))
  // Chấp nhận cả GET (Shortcut dùng query string, đơn giản nhất) lẫn POST
  // (JSON body, dùng khi gọi từ trang admin hoặc script khác).
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed — chỉ hỗ trợ GET hoặc POST' })
  }
  return handlePosCharge(req, res)
}

async function handlePosCharge(req, res) {
  console.log('[pos-charge] Bước 1: bắt đầu xử lý')

  // Chỉ chấp nhận key đúng — không còn fallback session admin. Sai/thiếu
  // key thì từ chối ngay, không có nhánh nào phải chờ/verify gì thêm.
  const shortcutOk = isValidShortcutKey(req)
  console.log('[pos-charge] Bước 2: check key ->', shortcutOk)
  if (!shortcutOk) {
    console.log('[pos-charge] Bước 2b: SAI/THIẾU KEY -> dừng ở đây, trả 401')
    return res.status(401).json({ error: 'Sai hoặc thiếu key' })
  }

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[pos-charge] Bước 3: THIẾU ENV MOMO_PARTNER_CODE/MOMO_ACCESS_KEY/MOMO_SECRET_KEY -> dừng ở đây')
    return res.status(500).json({ error: 'Server thiếu cấu hình MoMo (kiểm tra biến môi trường)' })
  }
  console.log('[pos-charge] Bước 3: env MoMo OK')

  // GET → lấy từ query string. POST → lấy từ JSON body. Cùng field name
  // để Shortcut chỉ cần đổi phương thức mà không phải đổi tên tham số.
  const params = req.method === 'GET' ? req.query : (req.body || {})
  console.log('[pos-charge] Bước 4: params nhận được =', JSON.stringify(params))
  let { orderId: rawOrderId, amount, orderInfo: rawOrderInfo, paymentCode: rawPaymentCode } = params

  if (!amount || !rawPaymentCode) {
    console.log('[pos-charge] Bước 4b: THIẾU amount hoặc paymentCode -> dừng ở đây')
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: amount, paymentCode' })
  }
  console.log('[pos-charge] Bước 4b: amount & paymentCode OK')

  // orderId không bắt buộc — nếu Shortcut không truyền, tự sinh giống hệt
  // create-p2p.js. Sanitize để loại ký tự lạ nếu Shortcut lỡ dán nhầm gì
  // đó vào (space, emoji...) — đúng cơ chế đã có trong create-p2p.js.
  const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '')
  let orderId
  if (rawOrderId) {
    const clean = sanitize(String(rawOrderId).trim())
    orderId = (clean.startsWith('iPOS') || clean.startsWith('POS')) ? clean : `iPOS${clean}`
  } else {
    orderId = `iPOS${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  }
  console.log('[pos-charge] Bước 5: orderId =', orderId)

  const paymentCode = String(rawPaymentCode).trim()
  if (!/^(MM|mm)?\d{18}$/.test(paymentCode)) {
    console.log('[pos-charge] Bước 6: paymentCode KHÔNG HỢP LỆ -> dừng ở đây. Nhận:', paymentCode)
    return res.status(400).json({ error: 'Mã thanh toán không hợp lệ (18 chữ số, có thể có MM/mm)' })
  }
  console.log('[pos-charge] Bước 6: paymentCode hợp lệ')

  const amt = parseInt(amount)
  if (isNaN(amt) || amt < 1000 || amt > 10_000_000) {
    console.log('[pos-charge] Bước 7: amount KHÔNG HỢP LỆ -> dừng ở đây. Nhận:', amount)
    return res.status(400).json({ error: 'Số tiền không hợp lệ (1.000 – 10.000.000 ₫)' })
  }
  console.log('[pos-charge] Bước 7: amount hợp lệ =', amt)

  // Cửa hàng: chọn ngay trên Shortcut (rawStoreId), nếu không truyền thì
  // dùng cửa hàng mặc định (giống hệt create-p2p.js / scan.js). Lấy thêm
  // partnerName từ store — dùng cho body gửi MoMo thay vì chỉ đọc thẳng
  // process.env.MOMO_PARTNER_NAME như bản cũ (mỗi cửa hàng có thể có
  // partnerName riêng, giống create-p2p.js).
  const rawStoreId = (params.storeId || '').toString().trim()
  const store = resolveStore(rawStoreId)
  const { id: storeId, name: storeName, partnerName: storePartnerName } = store
  console.log('[pos-charge] Bước 8: store resolved =', JSON.stringify(store))

  // Nội dung thanh toán: nếu Shortcut để trống/không đổi (rỗng hoặc null)
  // → tự dùng mặc định "Thanh Toán {orderId} - {tên cửa hàng}" để admin
  // nhìn danh sách giao dịch biết ngay đơn này thu ở cửa hàng nào mà
  // không cần bấm vào xem chi tiết. Nếu không xác định được cửa hàng thì
  // rơi về "Thanh Toán {orderId}" như cũ.
  let orderInfo = String(rawOrderInfo || '').trim()
  if (!orderInfo || orderInfo.toLowerCase() === 'null') {
    orderInfo = storeName ? `Thanh Toán ${orderId} - ${storeName}` : `Thanh Toán ${orderId}`
  }
  console.log('[pos-charge] Bước 8b: orderInfo =', orderInfo)

  let encryptedCode
  try {
    encryptedCode = encryptPaymentCode(paymentCode)
    console.log('[pos-charge] Bước 9: RSA encrypt OK, độ dài =', encryptedCode.length)
  } catch (err) {
    console.error('[pos-charge] Bước 9: RSA ENCRYPT LỖI -> dừng ở đây:', err.message)
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
    partnerName: storePartnerName || process.env.MOMO_PARTNER_NAME || '',
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

  if (storeId)   body.storeId   = storeId
  if (storeName) body.storeName = storeName

  const now = new Date().toISOString()

  try {
    console.log('[pos-charge] Bước 10: ghi Redis PENDING...')
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
        source: 'pos-shortcut', storeId, storeName, partnerName: storePartnerName,
        type: 'pos-charge',
        submittedCode: paymentCode,
      }),
    })
    console.log('[pos-charge] Bước 10: ghi Redis PENDING xong')

    await markOrderOpen(redis, orderId, Date.now())
    console.log('[pos-charge] Bước 11: markOrderOpen xong')

    console.log('[pos-charge] Bước 12: gọi MoMo...')
    const momoRes = await fetch(POS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    console.log('[pos-charge] Bước 12: MoMo trả HTTP status =', momoRes.status)

    const rawText = await momoRes.text()
    console.log('[pos-charge] Bước 13: đọc raw text xong, độ dài =', rawText.length)
    let data
    try {
      data = JSON.parse(rawText)
      console.log('[pos-charge] Bước 13: parse JSON OK, resultCode =', data.resultCode)
    } catch {
      console.error('[pos-charge] Bước 13: MoMo trả KHÔNG PHẢI JSON -> dừng ở đây:', rawText.slice(0, 500))
      await redis.hset('momo:orders', {
        [orderId]: JSON.stringify({
          orderId, amount: amt, orderInfo,
          status: 'FAILED', createdAt: now, paidAt: null,
          transId: '', payType: 'pos', paymentOption: '',
          resultCode: -1, message: '⚠ Lỗi hệ thống MoMo — MoMo trả về dữ liệu không hợp lệ (không phải JSON). Thử lại sau, nếu lặp lại nhiều lần thì liên hệ MoMo.',
          source: 'pos-shortcut', storeId, storeName, partnerName: storePartnerName,
          type: 'pos-charge', submittedCode: paymentCode,
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
      message: data.resultCode === 0 ? (data.message || 'Thanh toán thành công') : formatResultCodeMessage(data.resultCode, data.message),
      responseTime: data.responseTime,
      source: 'pos-shortcut', storeId, storeName, partnerName: storePartnerName,
      type: 'pos-charge', submittedCode: paymentCode,
    }

    await redis.hset('momo:orders', { [orderId]: JSON.stringify(updated) })
    await markOrderClosed(redis, orderId)

    console.log(
      `[pos-charge] Bước 14: HOÀN TẤT, trả response về Shortcut. orderId=${orderId}`,
      `resultCode=${data.resultCode}`,
      `message=${data.message}`
    )

    // Trả nguyên `data` (resultCode/message gốc từ MoMo) để Shortcut tự
    // đọc resultCode === 0 và hiện thông báo tương ứng — giữ hành vi cũ,
    // không đổi format response để không phải sửa lại Shortcut đang dùng.
    return res.status(200).json(data)

  } catch (err) {
    console.error('[pos-charge] LỖI Ở NHÁNH TRY/CATCH CHÍNH -> dừng ở đây:', err)
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
          source: 'pos-shortcut', storeId, storeName, partnerName: storePartnerName,
          type: 'pos-charge', submittedCode: paymentCode,
        }),
      })
      await markOrderClosed(redis, orderId)
    } catch (redisErr) {
      console.error('[pos-charge] Redis update FAILED error:', redisErr)
    }
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? 'Timeout khi gọi MoMo, vui lòng thử lại'
        : 'Lỗi server khi xử lý thanh toán',
    })
  }
}