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
      args: [
        ...chromium.args,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--disable-background-networking',
      ],
      defaultViewport: { width: 430, height: 932 }, // viewport điện thoại làm chuẩn
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  }
  return browserPromise
}

// Cache PNG tạm theo payUrl (60s) — tránh chạy lại Puppeteer nếu component
// re-render hoặc user F5 lại trang cho cùng 1 đơn hàng trong thời gian ngắn.
// Chỉ có tác dụng trong cùng 1 lambda container còn "ấm" (warm), không phải
// cache toàn cục giữa mọi request.
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
  // Dọn cache quá 50 entries để không phình bộ nhớ container
  if (qrCache.size > 50) {
    const oldestKey = qrCache.keys().next().value
    qrCache.delete(oldestKey)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ─── WARM PING ──────────────────────────────────────────────
  // GitHub Actions (hoặc bất kỳ cron ngoài nào) gọi
  // /api/momo/qr-extract?warm=1 định kỳ để giữ ĐÚNG function này ấm.
  // Trước đây warm.js là 1 route riêng — trên Vercel mỗi file trong
  // pages/api là 1 Serverless Function ĐỘC LẬP, ping route khác không hề
  // làm nóng route này, nên cold-start vẫn xảy ra mỗi lần khách quét thật.
  // Nhánh này chỉ launch/tái sử dụng Chromium rồi trả về ngay — không mở
  // trang MoMo, không cần payUrl, tốn ít tài nguyên nhất có thể.
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

  const payUrl = (req.query.payUrl || '').toString().trim()
  if (!payUrl || !payUrl.startsWith('https://payment.momo.vn')) {
    return res.status(400).json({ error: 'payUrl không hợp lệ' })
  }

  const debug = req.query.debug === '1'
  const noCache = req.query.nocache === '1'

  // Check cache trước — nếu vừa chụp đơn này trong 60s gần đây, trả luôn
  // (bỏ qua khi debug=1 hoặc nocache=1, dùng lúc test để chắc chắn đang xem
  // kết quả MỚI NHẤT chứ không phải ảnh cache từ lần chụp trước đó).
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

    // Chặn domain tracking/analytics — không ảnh hưởng tới việc render QR
    // nhưng tốn thời gian tải, làm chậm đáng kể nếu không chặn.
    // LƯU Ý: giờ ta cần chụp CẢ khung ngoài (banner, logo Vi Trả Sau/VietQR,
    // nền hoa văn của card hồng) nên KHÔNG được chặn hết 'image' như trước
    // nữa — chặn hết sẽ làm logo/nền card bị trống khi chụp. Thay vào đó
    // chỉ chặn ảnh KHÔNG thuộc domain asset của MoMo (banner quảng cáo bên
    // ngoài card, pixel tracking...), còn ảnh/logo thuộc chính card vẫn
    // được tải. font/media vẫn chặn vì QR + card không cần tới.
    await page.setRequestInterception(true)
    const BLOCKED_HOSTS = ['googletagmanager.com', 'google-analytics.com', 'facebook.net', 'connect.facebook.net', 'doubleclick.net']
    const MOMO_ASSET_HOSTS = /momocdn\.net|static\.mservice\.io|momo\.vn/
    const BLOCKED_TYPES = ['font', 'media']
    page.on('request', (req) => {
      const url = req.url()
      const type = req.resourceType()
      if (BLOCKED_HOSTS.some((h) => url.includes(h))) {
        return req.abort()
      }
      if (BLOCKED_TYPES.includes(type)) {
        return req.abort()
      }
      if (type === 'image' && !MOMO_ASSET_HOSTS.test(url)) {
        // Ảnh lạ (banner quảng cáo bên thứ 3, pixel tracking...) — không
        // thuộc card nên chặn để đỡ tốn thời gian tải.
        return req.abort()
      }
      req.continue()
    })

    // domcontentloaded thay vì networkidle2 — không cần đợi mạng "rảnh" hoàn
    // toàn (GTM/tracking script chạy ngầm liên tục khiến networkidle2 luôn
    // sát ngưỡng timeout). waitForFunction bên dưới đã tự đợi đúng lúc QR
    // render xong rồi nên không cần đợi network idle nữa.
    await page.goto(payUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })

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
      }, { timeout: 4000 })
    } catch {
      // Không thấy render kịp trong 8s — vẫn thử chụp bằng logic fallback bên dưới
    }

    // Giờ cần chụp cả khung ngoài (banner/logo) nên đợi thêm các <img> bên
    // trong card đã tải xong (complete + naturalWidth>0), timeout ngắn vì
    // hầu hết đã tải song song trong lúc waitForFunction ở trên đang chờ QR.
    try {
      await page.waitForFunction(() => {
        const card = document.querySelector('#body-payment-content') || document.querySelector('#form-qr-code, #qr-web-ui')
        if (!card) return true
        const imgs = [...card.querySelectorAll('img')]
        return imgs.every((img) => img.complete)
      }, { timeout: 1500 })
    } catch {
      // Không sao, vẫn chụp — thà thiếu 1 logo còn hơn timeout lâu
    }

    // ─── Tìm đúng CARD (banner + mã QR + text hướng dẫn) ───
    // #form-qr-code là CẢ payment form (bao gồm cả "Thông tin đơn hàng" phía
    // trên) — quá to. #body-payment-content là id ổn định bọc đúng card cần
    // lấy (đã kiểm chứng qua DevTools), thử lấy thẳng theo id này trước.
    // Nếu vì lý do gì đó id này không có/không đủ lớn, rơi về heuristic: leo
    // từ ảnh/canvas QR lên tối đa 8 cấp cha, chọn phần tử LỚN NHẤT (không
    // phải phần tử ĐẦU TIÊN) có "nền thật" — quan trọng: card ngoài của MoMo
    // tô nền bằng CSS gradient (background-image), không phải background-color
    // đơn thuần, nên phải kiểm tra cả backgroundImage; nếu chỉ check
    // backgroundColor như code cũ, vòng lặp sẽ dừng nhầm ở cái khung viền nhỏ
    // quanh QR (có background-color trắng/off-white riêng) trước khi leo tới
    // được card thật.
    const elementHandle = await page.evaluateHandle(() => {
      const byId = document.querySelector('#body-payment-content')
      if (byId) {
        const r = byId.getBoundingClientRect()
        if (r.width > 150 && r.height > 200) {
          window.__qrSource = 'byId'
          return byId
        }
      }
      window.__qrSource = 'heuristic'

      const isVisible = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 80 || r.height < 80) return false
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      const hasRealBackground = (el) => {
        const cs = window.getComputedStyle(el)
        const bg = cs.backgroundColor
        const hasColor = !!bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && !/^rgba?\(255,\s*255,\s*255/.test(bg)
        const hasImage = !!cs.backgroundImage && cs.backgroundImage !== 'none'
        return hasColor || hasImage
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

      // Bước 2: đi ngược lên tối đa 8 cấp cha, thu thập MỌI phần tử có nền
      // thật + kích thước hợp lý, rồi chọn cái LỚN NHẤT (gần chắc chắn là
      // card ngoài cùng, vì các khung/viewfinder nhỏ quanh QR luôn nhỏ hơn).
      let node = qrEl.parentElement
      let depth = 0
      let best = null
      let bestArea = 0
      while (node && depth < 8) {
        const r = node.getBoundingClientRect()
        if (hasRealBackground(node) && r.height >= 200 && r.height <= 900 && r.width >= 200) {
          const area = r.width * r.height
          if (area > bestArea) {
            bestArea = area
            best = node
          }
        }
        node = node.parentElement
        depth++
      }
      if (best) return best

      // Không tìm thấy card có nền -> trả về chính ảnh QR (an toàn hơn
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

    // Debug nhanh: xem strategy nào được dùng (byId/heuristic) + kích thước
    // vùng thực sự chụp, qua header — không cần bật ?debug=1 (chụp full page,
    // nặng hơn). Dùng thêm ?nocache=1 khi test để chắc chắn không dính cache cũ.
    const qrSource = await page.evaluate(() => window.__qrSource || 'unknown')
    res.setHeader('X-QR-Source', qrSource)
    const box = await element.boundingBox()
    if (box) {
      res.setHeader('X-QR-Region', `${Math.round(box.width)}x${Math.round(box.height)}`)
    }

    const buffer = await element.screenshot({ type: 'png' })
    await page.close()

    setCached(payUrl, buffer)

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-QR-Cache', 'MISS')
    return res.status(200).send(buffer)
  } catch (err) {
    console.error('[qr-extract] error:', err)
    if (page) { try { await page.close() } catch {} }
    return res.status(500).json({ error: 'Không lấy được mã QR, thử lại sau' })
  }
}