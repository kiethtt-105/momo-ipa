// pages/api/momo/warm.js
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

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