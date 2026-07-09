// pages/api/momo/vietqr-pay.js
//
//   npm install jsqr pngjs
//
// Endpoint: GET /api/momo/vietqr-pay?orderId=xxx
//
// Luồng xử lý:
//   1. Gọi lại /api/momo/qr-extract?orderId=xxx (endpoint đã có, dùng
//      Puppeteer để lấy PNG QR từ trang thanh toán MoMo) -> nhận buffer PNG.
//      Không tự launch Puppeteer ở đây để tránh trùng lặp logic + tốn thêm
//      1 lần khởi động Chromium; tận dụng luôn cơ chế cache 60s đã có sẵn
//      trong qr-extract.js.
//   2. Decode PNG -> pixel data bằng pngjs, rồi đọc chuỗi EMV QR bằng jsqr.
//   3. Parse chuỗi EMV QR (chuẩn VietQR/NAPAS 247) ra: BIN ngân hàng, tên
//      ngân hàng, số tài khoản, số tiền, nội dung chuyển khoản.
//
// Response mẫu (200):
// {
//   "orderId": "iPOS1783593054263jyeb",
//   "bank": { "bin": "970436", "code": "VCB", "name": "Vietcombank" },
//   "accountNumber": "0123456789",
//   "amount": "1003",
//   "content": "iPOS1783593051382",
//   "raw": "000201010211...6304ABCD"
// }

import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { parseVietQR } from '../../../lib/momo/vietqr-parser'
import { lookupBank } from '../../../lib/momo/bank-bin'

export const config = {
  api: {
    externalResolver: true,
  },
  maxDuration: 60,
}

// Lấy PNG buffer của QR bằng cách gọi lại endpoint qr-extract đã có sẵn,
// thay vì tự mở Puppeteer lần nữa. req.headers.host luôn có sẵn trên
// Vercel/Node kể cả khi chạy sau proxy.
async function fetchQrPngBuffer(req, orderId, { debugParams } = {}) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
  const host = req.headers.host
  if (!host) {
    throw Object.assign(new Error('Không xác định được host để gọi qr-extract nội bộ'), { status: 500 })
  }

  const qs = new URLSearchParams({ orderId })
  if (debugParams?.nocache) qs.set('nocache', '1')

  const url = `${proto}://${host}/api/momo/qr-extract?${qs.toString()}`

  const r = await fetch(url)
  if (!r.ok) {
    let body = {}
    try {
      body = await r.json()
    } catch {
      // qr-extract lỗi có thể không trả JSON (hiếm), bỏ qua parse lỗi
    }
    throw Object.assign(new Error(body.error || 'Không lấy được ảnh QR từ qr-extract'), { status: r.status })
  }

  const arrayBuffer = await r.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Decode buffer PNG -> chuỗi raw đọc được trong QR (EMV string)
function decodeQrStringFromPng(buffer) {
  let png
  try {
    png = PNG.sync.read(buffer)
  } catch (err) {
    throw Object.assign(new Error('Ảnh QR trả về không phải PNG hợp lệ'), { status: 502, cause: err })
  }

  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, {
    inversionAttempts: 'attemptBoth',
  })

  if (!code || !code.data) {
    throw Object.assign(new Error('Không đọc được mã QR trong ảnh (jsQR không nhận diện được)'), { status: 502 })
  }

  return code.data
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const orderId = (req.query.orderId || '').toString().trim()
  if (!orderId) {
    return res.status(400).json({ error: 'Thiếu orderId' })
  }

  const nocache = req.query.nocache === '1'

  try {
    const pngBuffer = await fetchQrPngBuffer(req, orderId, { debugParams: { nocache } })
    const qrString = decodeQrStringFromPng(pngBuffer)
    const parsed = parseVietQR(qrString)
    const bank = lookupBank(parsed.bankBin)

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      orderId,
      bank,
      accountNumber: parsed.accountNumber,
      amount: parsed.amount,
      currency: parsed.currency === '704' ? 'VND' : parsed.currency,
      content: parsed.content,
      serviceCode: parsed.serviceCode, // QRIBFTTA (TK) | QRIBFTTC (thẻ)
      merchantName: parsed.merchantName,
      raw: parsed.raw,
    })
  } catch (err) {
    console.error('[vietqr-pay] error:', err)
    const status = err.status || 500
    return res.status(status).json({ error: err.message || 'Không lấy được thông tin thanh toán VietQR' })
  }
}