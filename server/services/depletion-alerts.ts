/**
 * Fires alerts when a prepaid platform's credit balance reaches
 * critical (<=7 days) or depleted (<=$0). 7-day dedup per platform/riskLevel.
 */
import { and, eq, gte } from 'drizzle-orm'
import { alerts } from '../db/schema'
import { computeDepletionStatuses } from '../utils/depletion-calc'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

export async function checkDepletionAlerts(
  db: ReturnType<typeof import('../utils/db').useDB>,
  config?: Record<string, string>,
) {
  const newAlerts: Array<{ platform: string; riskLevel: string; message: string }> = []
  const statuses = await computeDepletionStatuses(db)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  for (const status of statuses) {
    if (status.riskLevel !== 'critical' && status.riskLevel !== 'depleted') continue

    const alertType = `depletion_${status.riskLevel}_${status.slug}`

    const existing = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(
        eq(alerts.alertType, alertType),
        gte(alerts.createdAt, sevenDaysAgo),
        eq(alerts.isActive, true),
      ))
      .limit(1)

    if (existing.length > 0) continue

    const severity = status.riskLevel === 'depleted' ? 'critical' : 'warning'
    const message = status.riskLevel === 'depleted'
      ? `${status.name} credits DEPLETED: estimated balance $${status.creditBalance.toFixed(2)}, MTD $${status.mtd.toFixed(2)}. Top up immediately.`
      : `${status.name} credits critically low: $${status.creditBalance.toFixed(2)} remaining, ~${status.daysRemaining ?? '?'} days left at $${status.dailyBurnRate.toFixed(2)}/day.`

    await db.insert(alerts).values({ severity, alertType, message })
    newAlerts.push({ platform: status.slug, riskLevel: status.riskLevel, message })

    if (config) {
      try {
        await Promise.all([
          sendAlertEmail(message, severity, `${status.name} balance ${status.riskLevel}`, config),
          sendWhatsApp(`🚨 InfraCost ${severity}: ${message}`, config),
        ])
      }
      catch (err) {
        console.error(`[depletion-alerts] Notification failed for ${status.slug}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  return newAlerts
}
