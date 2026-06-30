// pages/api/momo/save.js
import { queryMoMoTransaction } from '../../../lib/momo'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId } = req.body
  if (!orderId) return res.status(400).json({ error: 'Thiếu orderId' })

  let existing = await redis.hget('momo:orders', orderId)
  if (existing) {
    existing = typeof existing === 'string' ? JSON.parse(existing) : existing
    if (existing.status === 'PAID') {
      return res.status(200).json({ ok: true, source: 'already_paid' })
    }
  }

  let momoResult
  try {
    momoResult = await queryMoMoTransaction({ orderId })
  } catch (err) {
    console.error('[Save API] Lỗi khi query MoMo:', err)
    return res.status(502).json({ error: 'Không xác minh được với MoMo, thử lại sau' })
  }

  const {
    resultCode, transId, amount, payType, message,
    requestId, responseTime, orderType, extraData,
  } = momoResult

  const isPaid = parseInt(resultCode) === 0
  const now = new Date().toISOString()

  const record = {
    orderId,
    transId:      transId      || existing?.transId      || '',
    amount:       parseInt(amount || existing?.amount    || 0),
    payType:      payType      || existing?.payType      || '',
    orderInfo:    existing?.orderInfo    || '',
    resultCode:   parseInt(resultCode ?? 0),
    message:      message      || existing?.message      || '',
    responseTime: responseTime || existing?.responseTime || null,
    orderType:    orderType    || existing?.orderType    || '',
    extraData:    extraData    || existing?.extraData    || '',
    requestId:    requestId    || existing?.requestId    || '',
    paidAt:       isPaid ? now : (existing?.paidAt || null),
    createdAt:    existing?.createdAt || now,
    status:       isPaid ? 'PAID' : 'FAILED',
    source:       'redirect-verified',
    payUrl:       existing?.payUrl       || '',
    deeplink:     existing?.deeplink     || '',
    qrCodeUrl:    existing?.qrCodeUrl    || '',
    qrCodeImage:  existing?.qrCodeImage  || '',
  }

  await redis.hset('momo:orders', { [orderId]: JSON.stringify(record) })
  console.log(`[Save API] Order ${orderId} → ${isPaid ? 'PAID' : 'FAILED'} (verified via MoMo query) | ${message || ''}`)

  return res.status(200).json({ ok: true })
}