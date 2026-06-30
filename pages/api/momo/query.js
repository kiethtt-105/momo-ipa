// pages/api/momo/query.js
import crypto from 'crypto'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const MOMO_ENDPOINT = process.env.MOMO_QUERY_ENDPOINT

// resultCode coi là "đang xử lý", chưa kết luận được — không vội cập nhật theo các mã này.
const STILL_PROCESSING_CODES = [1000, 7000, 7002]

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE
const ACCESS_KEY = process.env.MOMO_ACCESS_KEY
const SECRET_KEY = process.env.MOMO_SECRET_KEY

console.log('[momo/query] boot check ->', {
  hasPartnerCode: !!PARTNER_CODE,
  hasAccessKey: !!ACCESS_KEY,
  hasSecretKey: !!SECRET_KEY,
  endpoint: MOMO_ENDPOINT,
})


export const config = {
  maxDuration: 30,
}

function buildSignature({ accessKey, orderId, partnerCode, requestId }) {
  const raw = `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex')
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} không được hỗ trợ` })
  }

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[momo/query] Thiếu env: MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY')
    return res.status(500).json({ message: 'Server thiếu cấu hình MoMo (kiểm tra biến môi trường)' })
  }

  const orderId = (req.body && req.body.orderId ? String(req.body.orderId) : '').trim()
  if (!orderId) {
    return res.status(400).json({ message: 'orderId không hợp lệ' })
  }

  const requestId = Date.now().toString()
  const signature = buildSignature({
    accessKey: ACCESS_KEY,
    orderId,
    partnerCode: PARTNER_CODE,
    requestId,
  })

  const payload = {
    partnerCode: PARTNER_CODE,
    requestId,
    orderId,
    signature,
    lang: 'vi',
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 28_000)


  if (typeof MOMO_ENDPOINT !== 'string' || !MOMO_ENDPOINT.startsWith('http')) {
    clearTimeout(timer)
    console.error('[momo/query] MOMO_ENDPOINT không hợp lệ:', MOMO_ENDPOINT)
    return res.status(500).json({ message: 'Lỗi cấu hình: MOMO_ENDPOINT không hợp lệ' })
  }
  console.log('[momo/query] boot check ->', {
  hasPartnerCode: !!PARTNER_CODE,
  hasAccessKey: !!ACCESS_KEY,
  hasSecretKey: !!SECRET_KEY,
  queryEndpoint: MOMO_ENDPOINT,   
})

  try {
    console.log('[momo/query] Gọi MoMo:', MOMO_ENDPOINT, 'orderId=', orderId, 'requestId=', requestId)
    const momoRes = await fetch(MOMO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const text = await momoRes.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error('[momo/query] MoMo trả dữ liệu không phải JSON:', text.slice(0, 300))
      return res.status(502).json({ message: 'MoMo server trả về dữ liệu không hợp lệ' })
    }

    // paymentOption: tài khoản/thẻ đã dùng để thanh toán ("momo" hoặc "pay_later")
    // Trường này do MoMo trả về sẵn trong response của API query, đảm bảo luôn có mặt
    // (fallback null) để phía client không cần tự kiểm tra undefined.
    console.log('[momo/query] Kết quả MoMo:', {
      orderId,
      resultCode: data.resultCode,
      payType: data.payType,
      paymentOption: data.paymentOption,
    })

    const responseData = {
      ...data,
      paymentOption: data.paymentOption ?? null,
    }

    // ===== Đối chiếu (reconcile) với dữ liệu đang lưu trong Redis =====
    // Trường hợp IPN bị rớt/lỗi → trạng thái local có thể sai (vd: vẫn PENDING rồi tự
    // chuyển EXPIRED theo thời gian, dù MoMo đã báo thành công). Khi admin bấm "tra cứu",
    // ta lấy kết quả thật từ MoMo và so sánh với bản ghi hiện tại; nếu lệch thì cập nhật lại.
    try {
      const rc = data.resultCode
      if (rc !== undefined && rc !== null && !STILL_PROCESSING_CODES.includes(parseInt(rc))) {
        const raw = await redis.hget('momo:orders', orderId)
        if (raw) {
          let existing = typeof raw === 'string' ? JSON.parse(raw) : raw
          const isPaid = parseInt(rc) === 0
          const correctStatus = isPaid ? 'PAID' : 'FAILED'

          // Không tự "hạ cấp" một đơn đã PAID trước đó dựa trên 1 lần tra cứu khác —
          // chỉ cập nhật khi trạng thái lưu trữ KHÔNG khớp với kết quả thật từ MoMo.
          if (existing.status !== correctStatus) {
            const now = new Date().toISOString()
            const reconciled = {
              ...existing,
              transId:       data.transId      || existing.transId      || '',
              amount:        parseInt(data.amount || existing.amount    || 0),
              payType:       data.payType       || existing.payType     || '',
              resultCode:    parseInt(rc),
              message:       data.message       || existing.message     || '',
              responseTime:  data.responseTime  || existing.responseTime || null,
              requestId:     data.requestId     || existing.requestId    || '',
              paidAt:        isPaid ? (existing.paidAt || now) : (existing.paidAt || null),
              status:        correctStatus,
              source:        'manual-lookup-reconciled',
              lastCheckedAt: now,
            }
            await redis.hset('momo:orders', { [orderId]: JSON.stringify(reconciled) })
            console.log(`[momo/query] Reconciled ${orderId}: ${existing.status} -> ${correctStatus} (IPN bị rớt hoặc sai lệch)`)
            responseData._reconciled = true
            responseData._previousStatus = existing.status
            responseData._newStatus = correctStatus
          }
        }
      }
    } catch (reconcileErr) {
      // Lỗi reconcile không được làm hỏng response tra cứu — chỉ log lại.
      console.error('[momo/query] Lỗi reconcile với Redis:', reconcileErr.message)
    }

    return res.status(momoRes.ok ? 200 : momoRes.status).json(responseData)
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[momo/query] Timeout khi gọi MoMo (28s)')
      return res.status(504).json({ message: 'Hết thời gian chờ phản hồi từ MoMo (timeout)' })
    }
    console.error('[momo/query] Lỗi gọi MoMo:', err)
    return res.status(500).json({ message: err.message || 'Lỗi không xác định khi gọi MoMo' })
  } finally {
    clearTimeout(timer)
  }
}