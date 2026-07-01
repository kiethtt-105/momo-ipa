// pages/api/momo/qr-extract.js
//
// Mục đích: MoMo chưa cấp quyền field `qrCodeUrl` cho tài khoản production,
// nên ta không tự vẽ được QR chuẩn từ chuỗi VietQR. Thay vào đó, route này
// mở `payUrl` (trang thanh toán MoMo) bằng headless browser (Puppeteer),
// TỰ ĐỘNG DÒ tìm element chứa mã QR trên trang (không hardcode toạ độ —
// vì DOM giống nhau dù server render ở viewport nào), rồi chỉ chụp riêng
// vùng ảnh đó, trả về PNG. Frontend chỉ cần <img src="/api/momo/qr-extract?payUrl=...">
// là có đúng ảnh QR, không cần nhúng cả trang.
//
// Cài đặt cần thiết (chạy trong project):
//   npm install puppeteer-core @sparticuz/chromium
//
// @sparticuz/chromium là bản Chromium tối ưu cho môi trường serverless
// (Vercel/AWS Lambda), nhẹ hơn nhiều so với puppeteer full.

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const config = {
  api: {
    // Puppeteer cold-start có thể mất vài giây, tăng timeout mặc định
    externalResolver: true,
  },
  maxDuration: 60, // CHỈ có tác dụng trên Vercel Pro trở lên — Hobby cứng 10s
}

// Cache browser instance giữa các lần gọi trong cùng 1 lambda container
// (tránh khởi động lại Chromium mỗi request — tiết kiệm đáng kể thời gian)
let browserPromise = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 430, height: 932 }, // viewport điện thoại làm chuẩn
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  }
  return browserPromise
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const payUrl = (req.query.payUrl || '').toString().trim()
  if (!payUrl || !payUrl.startsWith('https://payment.momo.vn')) {
    return res.status(400).json({ error: 'payUrl không hợp lệ' })
  }

  let page
  try {
    const browser = await getBrowser()
    page = await browser.newPage()

    await page.goto(payUrl, { waitUntil: 'networkidle2', timeout: 15000 })

    // MoMo vẽ QR bằng JS (qrcode.min2.js) SAU khi trang load — đợi thêm cho
    // tới khi element trong #form-qr-code thực sự có kích thước > 0 mới chụp,
    // tránh chụp trúng lúc canvas còn trống.
    try {
      await page.waitForFunction(() => {
        const container = document.querySelector('#form-qr-code, #qr-web-ui')
        if (!container) return false
        const el = container.querySelector('img, canvas')
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 50 && r.height > 50
      }, { timeout: 8000 })
    } catch {
      // Không thấy render kịp trong 8s — vẫn thử chụp bằng logic fallback bên dưới
    }

    const debug = req.query.debug === '1'

    // ─── Tìm đúng CARD QR (banner + mã QR + text hướng dẫn) ───
    // #form-qr-code là CẢ payment form (bao gồm cả "Thông tin đơn hàng" phía
    // trên) — quá to, không phải cái card hồng cần lấy. Card hồng là 1 <div>
    // con nằm sâu bên trong, không có id/class cố định để trỏ thẳng tới.
    // Chiến thuật: tìm đúng ảnh/canvas QR trước (đáng tin cậy — luôn vuông),
    // rồi đi ngược lên từng cấp cha tới khi gặp phần tử có nền MÀU THẬT
    // (khác trắng/trong suốt) — đó chính là ranh giới card hồng trong ảnh
    // MoMo, không cần biết trước tên class.
    const elementHandle = await page.evaluateHandle(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 80 || r.height < 80) return false
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      const hasRealBackground = (el) => {
        const bg = window.getComputedStyle(el).backgroundColor
        // Loại: transparent, rgba(0,0,0,0) và trắng thuần rgb(255,255,255)
        if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return false
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (m && m[1] === '255' && m[2] === '255' && m[3] === '255') return false
        return true
      }

      // Bước 1: tìm đúng ảnh/canvas QR (vuông, đủ lớn, đang hiển thị)
      const candidates = [...document.querySelectorAll('img, canvas')]
      let qrEl = null
      let bestScore = 0
      for (const el of candidates) {
        if (!isVisible(el)) continue
        const rect = el.getBoundingClientRect()
        const ratio = rect.width / rect.height
        if (ratio < 0.85 || ratio > 1.15) continue // QR luôn vuông
        const score = rect.width * rect.height
        if (score > bestScore) {
          bestScore = score
          qrEl = el
        }
      }
      if (!qrEl) return document.querySelector('#form-qr-code') || document.querySelector('#qr-web-ui')

      // Bước 2: đi ngược lên tối đa 6 cấp cha, tìm phần tử đầu tiên có nền
      // màu thật + kích thước hợp lý (200-700px cao) — đó là card hồng.
      let node = qrEl.parentElement
      let depth = 0
      while (node && depth < 6) {
        const r = node.getBoundingClientRect()
        if (hasRealBackground(node) && r.height >= 200 && r.height <= 700 && r.width >= 200) {
          return node
        }
        node = node.parentElement
        depth++
      }

      // Không tìm thấy card có nền màu -> trả về chính ảnh QR (an toàn hơn
      // là trả cả #form-qr-code quá to)
      return qrEl
    })

    if (debug) {
      const fullBuffer = await page.screenshot({ type: 'png', fullPage: true })
      await page.close()
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(fullBuffer)
    }

    const element = elementHandle.asElement()
    if (!element) {
      await page.close()
      return res.status(404).json({ error: 'Không tìm thấy vùng mã QR trên trang thanh toán' })
    }

    const buffer = await element.screenshot({ type: 'png' })
    await page.close()

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(buffer)
  } catch (err) {
    console.error('[qr-extract] error:', err)
    if (page) { try { await page.close() } catch {} }
    return res.status(500).json({ error: 'Không lấy được mã QR, thử lại sau' })
  }
}