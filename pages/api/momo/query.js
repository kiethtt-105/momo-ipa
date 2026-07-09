// pages/api/momo/query.js
import crypto from 'crypto'
import { Redis } from '@upstash/redis'
import { verifySession, refreshSession } from '../admin/login'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const MOMO_ENDPOINT = process.env.MOMO_QUERY_ENDPOINT


const STILL_PROCESSING_CODES = [1000, 7000, 7002, 9000]


const EXPIRED_CODES = [1005]

// Suy ra trạng thái đúng từ resultCode của MoMo — PAID/EXPIRED/FAILED là 3 trạng thái
// khác nhau, không được gộp EXPIRED vào FAILED.
function resolveStatusFromResultCode(rc) {
  const code = parseInt(rc)
  if (code === 0) return 'PAID'
  if (EXPIRED_CODES.includes(code)) return 'EXPIRED'
  return 'FAILED'
}

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

// Rút gọn response cho phía KHÔNG phải admin (luồng /result public — người quét
// mã hoặc người trả tiền, không có session admin). Chỉ trả đúng những gì UI kết
// quả thanh toán cần để hiển thị — KHÔNG trả transId, requestId, signature-liên-quan,
// extraData, orderType, hay các field debug nội bộ (_reconciled/_previousStatus/...),
// vì đây là endpoint public (không có requireAdmin) nên response đi thẳng ra ngoài
// trình duyệt của bất kỳ ai gọi được orderId.
function buildPublicResponse(momoData, statusForResponse) {
  return {
    orderId:    momoData.orderId,
    status:     statusForResponse,
    resultCode: momoData.resultCode,
    message:    momoData.message || '',
    amount:     momoData.amount != null ? parseInt(momoData.amount) : null,
    payType:    momoData.payType || '',
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} không được hỗ trợ` })
  }

  // Endpoint public — KHÔNG dùng requireAdmin() vì hàm đó tự trả 401 và sẽ chặn
  // hẳn luồng Scan QR / P2P (nơi người gọi không có session admin). Thay vào đó
  // chỉ kiểm tra session để BIẾT có phải admin hay không (isAdmin = true/false),
  // rồi quyết định trả full data (admin) hay bản rút gọn (không admin) — request
  // vẫn luôn được xử lý, chỉ khác nhau ở LƯỢNG THÔNG TIN trả về.
  const isAdmin = verifySession(req)
  if (isAdmin) refreshSession(req, res) // rolling session, giống requireAdmin() — chỉ áp dụng khi thực sự là admin

  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[momo/query] Thiếu env: MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY')
    return res.status(500).json({ message: 'Server thiếu cấu hình MoMo (kiểm tra biến môi trường)' })
  }

  const orderId = (req.query && req.query.orderId ? String(req.query.orderId) : '').trim()
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
    console.log('[momo/query] Gọi MoMo:', MOMO_ENDPOINT, 'orderId=', orderId, 'requestId=', requestId, 'isAdmin=', isAdmin)
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

    const fullResponseData = {
      ...data,
      paymentOption: data.paymentOption ?? null,
    }

    // ===== Đối chiếu (reconcile) với dữ liệu đang lưu trong Redis =====
    // Trường hợp IPN bị rớt/lỗi → trạng thái local có thể sai (vd: vẫn PENDING rồi tự
    // chuyển EXPIRED theo thời gian, dù MoMo đã báo thành công). Khi có ai đó tra cứu
    // (admin bấm nút, hoặc luồng scan/P2P tự poll), ta lấy kết quả thật từ MoMo và so
    // sánh với bản ghi hiện tại; nếu lệch thì cập nhật lại — việc reconcile Redis này
    // chạy như nhau bất kể isAdmin, chỉ có RESPONSE trả ra ngoài là khác nhau.
    let correctStatus = null
    try {
      const rc = data.resultCode
      if (rc !== undefined && rc !== null && !STILL_PROCESSING_CODES.includes(parseInt(rc))) {
        correctStatus = resolveStatusFromResultCode(rc)
        const raw = await redis.hget('momo:orders', orderId)
        if (raw) {
          let existing = typeof raw === 'string' ? JSON.parse(raw) : raw
          const isPaid = correctStatus === 'PAID'

          // Không tự "hạ cấp" một đơn đã PAID trước đó dựa trên 1 lần tra cứu khác —
          // chỉ cập nhật khi trạng thái lưu trữ KHÔNG khớp với kết quả thật từ MoMo.
          if (existing.status !== correctStatus) {
            const now = new Date().toISOString()
            const reconciled = {
              ...existing,
              transId:       data.transId      || existing.transId      || '',
              amount:        parseInt(data.amount || existing.amount    || 0),
              payType:       data.payType       || existing.payType     || '',
              // Trước đây bỏ sót 3 field này dù MoMo vẫn trả về ở response
              // query — giữ lại đầy đủ để không mất thông tin khi reconcile.
              paymentOption: data.paymentOption ?? existing.paymentOption ?? null,
              orderType:     data.orderType     || existing.orderType    || '',
              extraData:     data.extraData     || existing.extraData    || '',
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
            fullResponseData._reconciled = true
            fullResponseData._previousStatus = existing.status
            fullResponseData._newStatus = correctStatus
          } else {
            correctStatus = existing.status
          }
        }
      }
    } catch (reconcileErr) {
      // Lỗi reconcile không được làm hỏng response tra cứu — chỉ log lại.
      console.error('[momo/query] Lỗi reconcile với Redis:', reconcileErr.message)
    }

    // correctStatus có thể vẫn null nếu MoMo còn đang xử lý (STILL_PROCESSING_CODES) —
    // trường hợp đó fallback 'PENDING' để bên public vẫn biết là "chưa xong".
    const statusForResponse = correctStatus || (
      STILL_PROCESSING_CODES.includes(parseInt(data.resultCode)) ? 'PENDING' : resolveStatusFromResultCode(data.resultCode)
    )

    const responseData = isAdmin
      ? fullResponseData
      : buildPublicResponse({ ...fullResponseData, orderId }, statusForResponse)

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