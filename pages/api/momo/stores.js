// /pages/api/momo/stores.js


import { requireAdmin } from '../../../lib/requireAdmin'
import { getStores } from '../../../lib/stores'

const SHORTCUT_API_KEY = process.env.SHORTCUT_API_KEY || ''

function isValidShortcutKey(req) {
  if (!SHORTCUT_API_KEY) return false
  const headerKey = req.headers['x-api-key']
  const queryKey = (req.query.key || '').toString()
  return headerKey === SHORTCUT_API_KEY || queryKey === SHORTCUT_API_KEY
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isValidShortcutKey(req)) {
    if (!requireAdmin(req, res)) return
  }

  const stores = getStores().map(({ id, name, default: isDefault }) => ({
    id,
    name,
    default: isDefault,
  }))

  return res.status(200).json({ stores })
}