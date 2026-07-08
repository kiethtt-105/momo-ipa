// pages/api/momo/qr-decode.js


import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { Redis } from '@upstash/redis'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  api: { externalResolver: true },
  maxDuration: 60,
}

// Cache browser riêng cho route này (mỗi API route là 1 lambda riêng trên
// Vercel nên không share được instance với qr-extract.js, dù cùng logic).
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

// Cache kết quả giải mã theo payUrl (60s) — đỡ chạy lại Puppeteer nếu
// component gọi lại nhiều lần cho cùng 1 đơn.
const decodeCache = new Map()
const CACHE_TTL_MS = 60_000
function getCached(key) {
  const hit = decodeCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL_MS) { decodeCache.delete(key); return null }
  return hit.data
}
function setCached(key, data) {
  decodeCache.set(key, { data, ts: Date.now() })
  if (decodeCache.size > 50) decodeCache.delete(decodeCache.keys().next().value)
}

// Giống hệt hàm trong qr-extract.js — lấy chuỗi base64 QR thẳng từ DOM.
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
        } catch {}
      }
    }
    return null
  })
}

// ─── PARSE EMV TLV (chuẩn EMVCo QR / VietQR-NAPAS) ──────────────────
// Chuỗi EMV là chuỗi các block Tag(2 số)+Length(2 số)+Value lặp lại.
function parseTLV(str) {
  const out = {}
  let i = 0
  while (i + 4 <= str.length) {
    const tag = str.substr(i, 2)
    const len = parseInt(str.substr(i + 2, 2), 10)
    if (Number.isNaN(len)) break
    const value = str.substr(i + 4, len)
    out[tag] = value
    i += 4 + len
  }
  return out
}

function parseVietQR(raw) {
  const top = parseTLV(raw)

  let bin = null, accountNumber = null, guid = null, serviceCode = null
  if (top['38']) {
    const merchant = parseTLV(top['38'])
    guid = merchant['00'] || null
    if (merchant['01']) {
      const bankInfo = parseTLV(merchant['01'])
      bin = bankInfo['00'] || null
      accountNumber = bankInfo['01'] || null
    }
    serviceCode = merchant['02'] || null
  }

  let billNumber = null, purpose = null
  if (top['62']) {
    const addData = parseTLV(top['62'])
    billNumber = addData['01'] || null
    purpose = addData['08'] || null
  }

  const isVietQR = guid === 'A000000727'

  return {
    isVietQR,
    guid,
    bin,
    accountNumber,
    serviceCode, // "QRIBFTTA" (chuyển vào TK) hoặc "QRIBFTTC" (chuyển vào thẻ)
    amount: top['54'] || null,
    currency: top['53'] || null, // 704 = VND
    merchantName: top['59'] || null,
    merchantCity: top['60'] || null,
    countryCode: top['58'] || null,
    billNumber,
    purpose, // nội dung chuyển khoản
    raw,
  }
}

// Decode PNG buffer -> pixel data -> jsQR -> chuỗi thô
function decodeQrFromPngBuffer(buffer) {
  const png = PNG.sync.read(buffer)
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  return code ? code.data : null
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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

  const noCache = req.query.nocache === '1'
  if (!noCache) {
    const cached = getCached(payUrl)
    if (cached) {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Decode-Cache', 'HIT')
      return res.status(200).json(cached)
    }
  }

  let page
  try {
    const browser = await getBrowser()
    page = await browser.newPage()

    await page.setRequestInterception(true)
    const BLOCKED_TYPES = ['image', 'font', 'media', 'stylesheet']
    const BLOCKED_HOSTS = ['googletagmanager.com', 'google-analytics.com', 'facebook.net', 'connect.facebook.net', 'doubleclick.net']
    page.on('request', (r) => {
      const type = r.resourceType()
      const url = r.url()
      if (BLOCKED_TYPES.includes(type)) return r.abort()
      if (BLOCKED_HOSTS.some((h) => url.includes(h))) return r.abort()
      r.continue()
    })

    await page.goto(payUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })

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
    } catch {}

    const dataUri = await extractQrDataUri(page)
    await page.close()
    page = null

    if (!dataUri) {
      return res.status(404).json({ error: 'Không tìm thấy mã QR trên trang thanh toán' })
    }

    const match = dataUri.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
    if (!match) {
      return res.status(500).json({ error: 'Định dạng ảnh QR không hợp lệ' })
    }
    if (match[1] !== 'png') {
      return res.status(500).json({ error: `Chỉ hỗ trợ decode PNG, ảnh trả về là ${match[1]}` })
    }

    const buffer = Buffer.from(match[2], 'base64')
    const rawEmv = decodeQrFromPngBuffer(buffer)

    if (!rawEmv) {
      return res.status(422).json({ error: 'Đọc được ảnh QR nhưng jsQR không giải mã được nội dung' })
    }

    const parsed = parseVietQR(rawEmv)

    if (!parsed.isVietQR) {
      const result = {
        isVietQR: false,
        message: 'QR này không phải VietQR/NAPAS chuẩn (không có GUID A000000727) — nhiều khả năng là QR ví MoMo riêng, không chứa BIN/số TK ngân hàng.',
        raw: rawEmv,
      }
      setCached(payUrl, result)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(result)
    }

    setCached(payUrl, parsed)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(parsed)
  } catch (err) {
    console.error('[qr-decode] error:', err)
    if (page) { try { await page.close() } catch {} }
    if (req.query.debug === '1') {
      return res.status(500).json({ error: err.message, stack: err.stack })
    }
    return res.status(500).json({ error: 'Không giải mã được QR, thử lại sau' })
  }
}