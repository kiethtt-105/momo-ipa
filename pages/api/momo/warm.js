// pages/api/momo/warm.js
//
// Mục đích: gọi định kỳ (vd. Vercel Cron mỗi 4-5 phút) để giữ container
// serverless "ấm" và Chromium đã khởi động sẵn — tránh cold-start (3-6s)
// mỗi khi có khách quét đơn hàng thật, vốn là phần lớn trong độ trễ 11s.
//
// LƯU Ý: chỉ có tác dụng trong khoảng thời gian container còn "ấm" (thường
// vài phút tới ~15 phút tùy platform). Nếu traffic thấp, vẫn có thể gặp
// cold-start ở lần đầu sau khi container bị thu hồi — đây là giới hạn tự
// nhiên của kiến trúc serverless, không có cách nào loại bỏ hoàn toàn nếu
// không chuyển sang server luôn chạy (long-running instance).

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

// Dùng chung biến global với qr-extract.js là lý tưởng, nhưng 2 file API
// route khác nhau trên Vercel/Next.js KHÔNG chia sẻ được browser instance
// qua process — mỗi route có container riêng. Vì vậy warm.js chỉ có tác
// dụng nếu Vercel định tuyến đúng request thật vào CÙNG container vừa
// warm (phụ thuộc hạ tầng, không đảm bảo 100%). Coi đây là biện pháp giảm
// xác suất cold-start, không phải giải pháp tuyệt đối.
let browserPromise = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage'],
      defaultViewport: { width: 430, height: 932 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  }
  return browserPromise
}

export default async function handler(req, res) {
  try {
    await getBrowser()
    return res.status(200).json({ ok: true, warmed: true })
  } catch (err) {
    console.error('[warm] error:', err)
    return res.status(500).json({ ok: false })
  }
}