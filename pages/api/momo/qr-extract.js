// pages/api/momo/qr-extract.js
//
// Mục đích: MoMo chưa cấp quyền field `qrCodeUrl` cho tài khoản production,
// nên ta không tự vẽ được QR chuẩn từ chuỗi VietQR. Thay vào đó, route này
// mở `payUrl` (trang thanh toán MoMo) bằng headless browser (Puppeteer)
// và LẤY THẲNG chuỗi base64 mà chính MoMo đã vẽ sẵn, thay vì chụp ảnh
// (screenshot) cả vùng card như trước.
//
// ĐỔI CHIẾN LƯỢC (quan trọng):
// Trước đây route này screenshot nguyên khối "card" (banner hồng + logo +
// khung viền quanh QR...) rồi mới crop — vừa chậm (phải đợi mọi ảnh trong
// card tải xong, đợi layout ổn định, rồi mới composite ảnh) vừa dư thừa
// (frontend chỉ cần đúng mã QR, không cần banner/logo). Qua DevTools xác
// nhận: MoMo tự vẽ QR bằng canvas rồi export ra
//   <img class="image-qr-code" src="data:image/png;base64,...">
// tức là mã QR đã nằm sẵn dưới dạng base64 ngay trong DOM — không cần
// chụp ảnh gì cả, chỉ cần đọc thuộc tính `src` này ra là có đúng, đủ
// pixel gốc (350x350 theo thực tế đo được), không viền, không nền dư.
// => Nhanh hơn nhiều vì:
//   1) Không cần đợi banner/logo/nền card tải (giờ chặn luôn toàn bộ
//      ảnh + CSS, vì ta không render trực quan gì cả, chỉ cần DOM+JS).
//   2) Không cần page.screenshot()/element.screenshot() (bước tốn thời
//      gian nhất trong Puppeteer).
//   3) Ảnh trả về đúng là mã QR MoMo xuất ra, không qua nén lại của
//      screenshot → sắc nét hơn, ít lỗi khi máy quét đọc.
//
// Cài đặt cần thiết (chạy trong project):
//   npm install puppeteer-core @sparticuz/chromium

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { Redis } from '@upstash/redis'
import { requireAdmin } from '../../../lib/requireAdmin'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  api: {
    externalResolver: true,
  },
  maxDuration: 60, // CHỈ có tác dụng trên Vercel Pro trở lên — Hobby cứng 10s
}

// Cache browser instance giữa các lần gọi trong cùng 1 lambda container
let browserPromise = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--disable-background-networking',
      ],
      defaultViewport: { width: 430, height: 932 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  }
  return browserPromise
}

// Cache PNG buffer tạm theo payUrl (60s) — tránh chạy lại Puppeteer nếu
// component re-render hoặc user F5 lại trang cho cùng 1 đơn hàng.
const qrCache = new Map()
const CACHE_TTL_MS = 60_000

function getCached(key) {
  const hit = qrCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    qrCache.delete(key)
    return null
  }
  return hit.buffer
}

function setCached(key, buffer) {
  qrCache.set(key, { buffer, ts: Date.now() })
  if (qrCache.size > 50) {
    const oldestKey = qrCache.keys().next().value
    qrCache.delete(oldestKey)
  }
}

// Đọc chuỗi base64 QR thẳng từ DOM — KHÔNG chụp ảnh.
// Thứ tự ưu tiên:
//   1) img.image-qr-code (đúng class MoMo dùng thực tế, xác nhận qua DevTools)
//   2) .qrcode_image img (wrapper cha, phòng khi MoMo đổi class con)
//   3) img[src^="data:image"] trong #form-qr-code / #qr-web-ui (bản cũ/khác)
//   4) canvas trong các container trên (phòng khi MoMo vẽ bằng canvas,
//      chưa kịp export ra <img>) → tự export bằng canvas.toDataURL()
async function extractQrDataUri(page) {
  return page.evaluate(() => {
    const isDataImg = (el) => !!el && typeof el.src === 'string' && el.src.startsWith('data:image')

    const direct = document.querySelector('img.image-qr-code, .qrcode_image img')
    if (isDataImg(direct)) return direct.src

    const containers = [
      document.querySelector('#form-qr-code'),
      document.querySelector('#qr-web-ui'),
    ].filter(Boolean)

    for (const c of containers) {
      const img = c.querySelector('img[src^="data:image"]')
      if (isDataImg(img)) return img.src
    }

    for (const c of containers) {
      const canvas = c.querySelector('canvas')
      if (canvas) {
        try {
          const uri = canvas.toDataURL('image/png')
          if (uri && uri.startsWith('data:image') && uri.length > 100) return uri
        } catch {
          // canvas có thể bị "tainted" nếu vẽ ảnh cross-origin — bỏ qua, thử fallback khác
        }
      }
    }

    return null
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ─── WARM PING ──────────────────────────────────────────────
  if (req.query.warm === '1') {
    try {
      await getBrowser()
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ ok: true, warmed: true })
    } catch (err) {
      console.error('[qr-extract][warm] error:', err)
      return res.status(500).json({ ok: false })
    }
  }

  // Trước đây route này nhận thẳng `payUrl` từ query string — chỉ giới hạn
  // theo domain (payment.momo.vn) nên vẫn PUBLIC hoàn toàn: ai cũng gọi
  // được, mỗi lần tốn 1 lần khởi động Puppeteer/Chromium (bước tốn compute
  // nhất hệ thống) → dễ bị lợi dụng để dội chi phí/DoS serverless.
  // Giờ đổi sang nhận `orderId`, bắt buộc admin đã đăng nhập, rồi tự tra
  // payUrl từ Redis (đơn phải có thật, do chính create-p2p.js tạo ra) thay
  // vì tin payUrl do client tự truyền lên.
  if (!requireAdmin(req, res)) return

  const orderId = (req.query.orderId || '').toString().trim()
  if (!orderId) {
    return res.status(400).json({ error: 'Thiếu orderId' })
  }

  const raw = await redis.hget('momo:orders', orderId)
  if (!raw) {
    return res.status(404).json({ error: 'Không tìm thấy đơn hàng' })
  }
  const order = typeof raw === 'string' ? JSON.parse(raw) : raw
  const payUrl = (order.payUrl || '').toString().trim()
  if (!payUrl || !payUrl.startsWith('https://payment.momo.vn')) {
    return res.status(404).json({ error: 'Đơn hàng chưa có payUrl hợp lệ' })
  }

  const debug = req.query.debug === '1'
  const noCache = req.query.nocache === '1'

  if (!debug && !noCache) {
    const cached = getCached(payUrl)
    if (cached) {
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-QR-Cache', 'HIT')
      return res.status(200).send(cached)
    }
  }

  let page
  try {
    const browser = await getBrowser()
    page = await browser.newPage()

    // Giờ CHỈ cần DOM + JS chạy để MoMo tự vẽ QR ra base64 — không render
    // trực quan gì cả, nên chặn HẾT ảnh/font/media/css/tracking để trang
    // load nhanh nhất có thể. Vẫn phải cho qua document/script/xhr/fetch
    // vì logic vẽ QR (qrcode.min2.js…) nằm trong đó.
    await page.setRequestInterception(true)
    const BLOCKED_TYPES = ['image', 'font', 'media', 'stylesheet']
    const BLOCKED_HOSTS = ['googletagmanager.com', 'google-analytics.com', 'facebook.net', 'connect.facebook.net', 'doubleclick.net']
    page.on('request', (req) => {
      const type = req.resourceType()
      const url = req.url()
      if (BLOCKED_TYPES.includes(type)) return req.abort()
      if (BLOCKED_HOSTS.some((h) => url.includes(h))) return req.abort()
      req.continue()
    })

    await page.goto(payUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })

    // Đợi tới khi MoMo vẽ xong QR và gán base64 vào DOM (hoặc canvas sẵn
    // sàng để export) — thường rất nhanh vì không phụ thuộc network ảnh
    // nữa, chỉ chờ JS nội bộ trang chạy xong.
    let dataUri = null
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('img.image-qr-code, .qrcode_image img')
          if (el && el.src && el.src.startsWith('data:image')) return true
          const c1 = document.querySelector('#form-qr-code canvas, #qr-web-ui canvas')
          return !!c1
        },
        { timeout: 6000 }
      )
    } catch {
      // Không thấy tín hiệu rõ ràng trong 6s — vẫn thử đọc DOM bên dưới,
      // biết đâu vừa kịp render ngay lúc timeout.
    }

    dataUri = await extractQrDataUri(page)

    if (debug) {
      // Bật lại ảnh/css tạm thời để xem toàn trang khi cần soi lỗi
      const fullBuffer = await page.screenshot({ type: 'png', fullPage: true }).catch(() => null)
      await page.close()
      if (fullBuffer) {
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-QR-DataUri-Found', dataUri ? '1' : '0')
        return res.status(200).send(fullBuffer)
      }
      return res.status(200).json({ dataUriFound: !!dataUri, dataUriPrefix: dataUri ? dataUri.slice(0, 60) : null })
    }

    await page.close()

    if (!dataUri) {
      return res.status(404).json({ error: 'Không tìm thấy mã QR trên trang thanh toán' })
    }

    const match = dataUri.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
    if (!match) {
      return res.status(500).json({ error: 'Định dạng mã QR không hợp lệ' })
    }

    const buffer = Buffer.from(match[2], 'base64')
    setCached(payUrl, buffer)

    res.setHeader('Content-Type', `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-QR-Cache', 'MISS')
    res.setHeader('X-QR-Source', 'dom-datauri')
    return res.status(200).send(buffer)
  } catch (err) {
    console.error('[qr-extract] error:', err)
    if (page) { try { await page.close() } catch {} }
    return res.status(500).json({ error: 'Không lấy được mã QR, thử lại sau' })
  }
}