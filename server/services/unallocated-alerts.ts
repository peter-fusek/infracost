/**
 * Alerts when a high share of monthly spend can't be attributed to a project.
 * This is the signal that attribution weights are stale OR a platform is
 * producing costs without a matching service row.
 *
 * Threshold: >$100 absolute OR >15% of MTD total.
 * Dedup: 7 days per month (not per alert, since the amount grows over the month).
 */
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { alerts, costRecords, platforms } from '../db/schema'
import { getCurrentMonthRange } from '../collectors/base'
import { loadAllAttributionWeights } from '../utils/attribution'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

const ABSOLUTE_THRESHOLD = 100
const PCT_THRESHOLD = 0.15

export async function checkUnallocatedAlert(
  db: ReturnType<typeof import('../utils/db').useDB>,
  config?: Record<string, string>,
) {
  const { start, end } = getCurrentMonthRange()
  const weightsByPlatform = await loadAllAttributionWeights(db)

  // Sum MTD per platform for records with no serviceId (= unallocated)
  const unallocated = await db
    .select({
      platformId: costRecords.platformId,
      slug: platforms.slug,
      name: platforms.name,
      total: sql<string>`sum(${costRecords.amount})`,
    })
    .from(costRecords)
    .innerJoin(platforms, eq(platforms.id, costRecords.platformId))
    .where(and(
      isNull(costRecords.serviceId),
      gte(costRecords.periodStart, start),
      lte(costRecords.periodEnd, end),
      eq(costRecords.isActive, true),
      isNull(costRecords.deletedAt),
    ))
    .groupBy(costRecords.platformId, platforms.slug, platforms.name)

  // Subtract platforms that HAVE attribution weights (those rows get split in breakdown.get.ts)
  const trulyUnallocated = unallocated.filter((u) => {
    const weights = weightsByPlatform.get(u.platformId)
    return !weights || weights.size === 0
  })

  const unallocatedTotal = trulyUnallocated.reduce((s, u) => s + parseFloat(u.total || '0'), 0)

  const totalMtd = await db
    .select({ total: sql<string>`coalesce(sum(${costRecords.amount}), 0)` })
    .from(costRecords)
    .where(and(
      gte(costRecords.periodStart, start),
      lte(costRecords.periodEnd, end),
      eq(costRecords.isActive, true),
      isNull(costRecords.deletedAt),
    ))

  const totalMtdNum = parseFloat(totalMtd[0]?.total ?? '0')
  const pct = totalMtdNum > 0 ? unallocatedTotal / totalMtdNum : 0

  if (unallocatedTotal < ABSOLUTE_THRESHOLD && pct < PCT_THRESHOLD) {
    return { fired: false, unallocated: unallocatedTotal, pct: Math.round(pct * 100), platforms: [] as string[] }
  }

  const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
  const alertType = `unallocated_cost_high_${monthKey}`

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(
      eq(alerts.alertType, alertType),
      gte(alerts.createdAt, sevenDaysAgo),
      eq(alerts.isActive, true),
    ))
    .limit(1)

  if (existing.length > 0) {
    return { fired: false, deduped: true, unallocated: unallocatedTotal, pct: Math.round(pct * 100) }
  }

  const platformList = trulyUnallocated.map(u => u.slug).sort()
  const message = `Unallocated costs this month: $${unallocatedTotal.toFixed(2)} (${Math.round(pct * 100)}% of $${totalMtdNum.toFixed(2)} MTD). Platforms without attribution: ${platformList.join(', ')}.`

  await db.insert(alerts).values({
    severity: 'warning',
    alertType,
    message,
  })

  if (config) {
    try {
      await Promise.all([
        sendAlertEmail(message, 'warning', 'Unallocated costs high', config),
        sendWhatsApp(`🔶 InfraCost warning: ${message}`, config),
      ])
    }
    catch (err) {
      console.error('[unallocated-alerts] Notification failed:', err instanceof Error ? err.message : err)
    }
  }

  return { fired: true, unallocated: unallocatedTotal, pct: Math.round(pct * 100), platforms: platformList }
}
