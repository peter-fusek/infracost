import { computeExpiryStatuses } from '../utils/free-tier-expiry'

export default defineEventHandler(() => {
  const items = computeExpiryStatuses()
  const urgent = items.filter(i => i.risk !== 'ok')
  return { items, urgentCount: urgent.length }
})
