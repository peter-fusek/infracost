import { and, eq, gte, lte, sql, isNull } from 'drizzle-orm'
import { costRecords, platforms } from '../db/schema'
import { getCurrentMonthRange, getMonthProgress } from '../collectors/base'
import { EUR_USD_RATE, toEur } from '../utils/currency'

interface DepletionPlatform {
  slug: string
  name: string
  creditBalance: number
  creditBalanceEur: number
  dailyBurnRate: number
  dailyBurnRateEur: number
  daysRemaining: number | null
  depletionDate: string | null
  mtd: number
  eomEstimate: number
  riskLevel: 'ok' | 'warning' | 'critical' | 'depleted'
}

import { getBalances } from './depletion.post'

export default defineEventHandler(async () => {
  const db = useDB()
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()
  const now = new Date()
  const currentDay = now.getDate()

  // Get MTD usage per platform
  const rows = await db
    .select({
      platformSlug: platforms.slug,
      platformName: platforms.name,
      total: sql<string>`sum(${costRecords.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(costRecords)
    .innerJoin(platforms, eq(costRecords.platformId, platforms.id))
    .where(
      and(
        gte(costRecords.periodStart, start),
        lte(costRecords.periodEnd, end),
        eq(costRecords.isActive, true),
        isNull(costRecords.deletedAt),
      ),
    )
    .groupBy(platforms.slug, platforms.name)

  const results: DepletionPlatform[] = []

  const PREPAID_PLATFORMS = await getBalances()

  for (const [slug, prepaid] of Object.entries(PREPAID_PLATFORMS)) {
    const row = rows.find(r => r.platformSlug === slug)
    const mtd = row ? parseFloat(row.total || '0') : 0
    const dailyBurn = currentDay > 0 ? mtd / currentDay : 0
    const eom = progress > 0 ? mtd / progress : 0

    // Days since balance was recorded
    const balanceDate = new Date(prepaid.updatedAt)
    const daysSinceUpdate = Math.max(0, Math.floor((now.getTime() - balanceDate.getTime()) / 86400000))
    const estimatedCurrentBalance = Math.max(0, prepaid.balance - (dailyBurn * daysSinceUpdate))

    const daysRemaining = dailyBurn > 0 ? Math.floor(estimatedCurrentBalance / dailyBurn) : null
    const depletionDate = daysRemaining !== null
      ? new Date(now.getTime() + daysRemaining * 86400000).toISOString().split('T')[0]
      : null

    let riskLevel: DepletionPlatform['riskLevel'] = 'ok'
    if (estimatedCurrentBalance <= 0) riskLevel = 'depleted'
    else if (daysRemaining !== null && daysRemaining <= 7) riskLevel = 'critical'
    else if (daysRemaining !== null && daysRemaining <= 14) riskLevel = 'warning'

    results.push({
      slug,
      name: row?.platformName || slug,
      creditBalance: Math.round(estimatedCurrentBalance * 100) / 100,
      creditBalanceEur: toEur(estimatedCurrentBalance),
      dailyBurnRate: Math.round(dailyBurn * 100) / 100,
      dailyBurnRateEur: toEur(dailyBurn),
      daysRemaining,
      depletionDate,
      mtd: Math.round(mtd * 100) / 100,
      eomEstimate: Math.round(eom * 100) / 100,
      riskLevel,
    })
  }

  // Sort by risk (critical first)
  const riskOrder = { depleted: 0, critical: 1, warning: 2, ok: 3 }
  results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel])

  return {
    platforms: results,
    eurUsdRate: EUR_USD_RATE,
    checkedAt: now.toISOString(),
  }
})
