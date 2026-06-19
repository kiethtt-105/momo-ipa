// /pages/api/admin/scan-quick.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { amount, orderInfo = 'Thanh toán tại quầy' } = req.query
  const amt = parseInt(amount)

  // Kiểm tra số tiền
  if (!amt || isNaN(amt) || amt < 1000 || amt > 50000000) {
    return res.status(400).send('Số tiền không hợp lệ (1.000 - 10.000.000 ₫)')
  }

  // Lấy cookie để kiểm tra session
  const cookie = req.headers.cookie || ''

  try {
    // Kiểm tra xem đã login admin chưa
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://kiehtt.vercel.app' 
      : 'http://localhost:3000'

    const sessionRes = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { cookie },
    })

    const sessionData = await sessionRes.json()

    if (!sessionData.authed) {
      // Chưa login → chuyển đến trang login, sau đó quay lại link quick
      const currentUrl = encodeURIComponent(
        `/api/admin/scan-quick?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}`
      )
      return res.redirect(302, `/admin/login?redirect=${currentUrl}`)
    }

    // Đã login thành công → redirect thẳng vào trang scan với dữ liệu đã điền sẵn
    const scanUrl = `/admin/scan?amount=${amt}&orderInfo=${encodeURIComponent(orderInfo)}&quick=true`
    
    return res.redirect(302, scanUrl)

  } catch (error) {
    console.error('[scan-quick] Error:', error)
    return res.redirect(302, '/admin/login')
  }
}