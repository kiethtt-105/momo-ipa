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

    // ─── Tìm element chứa cả CARD QR (banner + mã QR + text hướng dẫn) ───
    // Chụp nguyên container #form-qr-code — đây là khối card hồng đầy đủ
    // (không phải chỉ riêng ảnh QR trần) theo đúng yêu cầu hiển thị.
    // Ưu tiên 1: #form-qr-code / #qr-web-ui — xác nhận qua DevTools thật.
    // Ưu tiên 2 (fallback): nếu MoMo đổi cấu trúc, dò tìm riêng ảnh/canvas QR
    // (vuông, đủ lớn) rồi chụp phần tử đó thay vì cả card.
    const elementHandle = await page.evaluateHandle(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 80 || r.height < 80) return false
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      // Ưu tiên 1: cả card container thật của MoMo
      const container = document.querySelector('#form-qr-code') || document.querySelector('#qr-web-ui')
      if (container && isVisible(container)) return container

      // Ưu tiên 2: fallback dò riêng ảnh/canvas QR (vuông) nếu không thấy card
      const candidates = [...document.querySelectorAll('img, canvas')]
      let best = null
      let bestScore = 0
      for (const el of candidates) {
        if (!isVisible(el)) continue
        const rect = el.getBoundingClientRect()
        const ratio = rect.width / rect.height
        if (ratio < 0.85 || ratio > 1.15) continue // QR luôn vuông
        const score = rect.width * rect.height
        if (score > bestScore) {
          bestScore = score
          best = el
        }
      }
      return best
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