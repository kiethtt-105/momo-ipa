// /pages/api/admin/scan-quick.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { amount, orderInfo = 'Thanh toán tại quầy' } = req.query
  const amt = parseInt(amount)

  if (!amt || isNaN(amt) || amt < 1000 || amt > 50000000) {
    return res.status(400).send('Số tiền không hợp lệ (1.000 - 50.000.000 ₫)')
  }

  const cookie = req.headers.cookie || ''

  try {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://kiehtt.vercel.app' 
      : 'http://localhost:3000'

    const sessionRes = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { cookie },
    })

    const sessionData = await sessionRes.json()

    // Dù login hay chưa, đều redirect về /admin/scan
    // (Nếu chưa login, trang scan sẽ hiện form login)
    const scanUrl = `/admin/scan?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}&quick=true`

    return res.redirect(302, scanUrl)

  } catch (error) {
    console.error('[scan-quick] Error:', error)
    const fallbackUrl = `/admin/scan?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}&quick=true`
    return res.redirect(302, fallbackUrl)
  }
}