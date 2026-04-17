/**
 * Shared depletion risk calculation.
 * Consumed by both /api/depletion (GET) and services/depletion-alerts.ts.
 */
import { and, eq, gte, lte, sql, isNull } from 'drizzle-orm'
import { costRecords, platforms } from '../db/schema'
import { getCurrentMonthRange, getMonthProgress } from '../collectors/base'
import { getBalances } from '../api/depletion.post'

export interface DepletionStatus {
  slug: string
  name: string
  creditBalance: number
  dailyBurnRate: number
  daysRemaining: number | null
  depletionDate: string | null
  mtd: number
  eomEstimate: number
  riskLevel: 'ok' | 'warning' | 'critical' | 'depleted'
}

export async function computeDepletionStatuses(
  db: ReturnType<typeof import('./db').useDB>,
): Promise<DepletionStatus[]> {
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()
  const now = new Date()
  const currentDay = now.getDate()

  const rows = await db
    .select({
      platformSlug: platforms.slug,
      platformName: platforms.name,
      total: sql<string>`sum(${costRecords.amount})`,
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

  const balances = await getBalances()
  const results: DepletionStatus[] = []

  for (const [slug, prepaid] of Object.entries(balances)) {
    const row = rows.find(r => r.platformSlug === slug)
    const mtd = row ? parseFloat(row.total || '0') : 0
    const dailyBurn = currentDay > 0 ? mtd / currentDay : 0
    const eom = progress > 0 ? mtd / progress : 0

    const balanceDate = new Date(prepaid.updatedAt)
    const daysSinceUpdate = Math.max(0, Math.floor((now.getTime() - balanceDate.getTime()) / 86400000))
    const estimatedCurrentBalance = Math.max(0, prepaid.balance - (dailyBurn * daysSinceUpdate))

    const daysRemaining = dailyBurn > 0 ? Math.floor(estimatedCurrentBalance / dailyBurn) : null
    const depletionDate = daysRemaining !== null
      ? new Date(now.getTime() + daysRemaining * 86400000).toISOString().split('T')[0] ?? null
      : null

    let riskLevel: DepletionStatus['riskLevel'] = 'ok'
    if (estimatedCurrentBalance <= 0) riskLevel = 'depleted'
    else if (daysRemaining !== null && daysRemaining <= 7) riskLevel = 'critical'
    else if (daysRemaining !== null && daysRemaining <= 14) riskLevel = 'warning'

    results.push({
      slug,
      name: row?.platformName || slug,
      creditBalance: Math.round(estimatedCurrentBalance * 100) / 100,
      dailyBurnRate: Math.round(dailyBurn * 100) / 100,
      daysRemaining,
      depletionDate,
      mtd: Math.round(mtd * 100) / 100,
      eomEstimate: Math.round(eom * 100) / 100,
      riskLevel,
    })
  }

  return results
}
