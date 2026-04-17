import { computeDepletionStatuses } from '../utils/depletion-calc'
import { EUR_USD_RATE, toEur } from '../utils/currency'

export default defineEventHandler(async () => {
  const db = useDB()
  const now = new Date()
  const statuses = await computeDepletionStatuses(db)

  const enriched = statuses.map(s => ({
    ...s,
    creditBalanceEur: toEur(s.creditBalance),
    dailyBurnRateEur: toEur(s.dailyBurnRate),
  }))

  const riskOrder = { depleted: 0, critical: 1, warning: 2, ok: 3 }
  enriched.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel])

  return {
    platforms: enriched,
    eurUsdRate: EUR_USD_RATE,
    checkedAt: now.toISOString(),
  }
})
