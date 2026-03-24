import { sql, and, eq, gte } from 'drizzle-orm'
import { alerts } from '../db/schema'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

/**
 * Spending anomaly detector.
 * Compares current month EOM estimates against 3-month rolling averages per platform.
 * Alerts when spending exceeds the average by more than the threshold.
 */

const ANOMALY_THRESHOLD_PCT = 20 // alert if >20% above 3-month average

interface AnomalyResult {
  platform: string
  platformSlug: string
  currentEom: number
  avgMonthly: number
  pctAbove: number
}

type DB = ReturnType<typeof import('../utils/db').useDB>

export async function detectAnomalies(db: DB): Promise<AnomalyResult[]> {
  // Get per-platform: current month total + 3 prior months average
  const rows = await db.execute<{
    slug: string
    name: string
    current_month: string
    avg_prior_3: string
  }>(sql`
    with current_month as (
      select
        p.slug, p.name,
        coalesce(sum(cr.amount::numeric), 0) as total
      from platforms p
      left join cost_records cr on cr.platform_id = p.id
        and cr.is_active = true and cr.deleted_at is null
        and cr.period_start >= date_trunc('month', now())
      where p.is_active = true
      group by p.slug, p.name
    ),
    prior_months as (
      select
        p.slug,
        coalesce(avg(monthly.total), 0) as avg_total
      from platforms p
      left join lateral (
        select sum(cr.amount::numeric) as total
        from cost_records cr
        where cr.platform_id = p.id
          and cr.is_active = true and cr.deleted_at is null
          and cr.period_start >= date_trunc('month', now()) - interval '3 months'
          and cr.period_start < date_trunc('month', now())
        group by date_trunc('month', cr.period_start)
      ) monthly on true
      where p.is_active = true
      group by p.slug
    )
    select
      cm.slug, cm.name,
      cm.total as current_month,
      coalesce(pm.avg_total, 0) as avg_prior_3
    from current_month cm
    left join prior_months pm on pm.slug = cm.slug
    where cm.total > 0
  `)

  const anomalies: AnomalyResult[] = []

  // Estimate EOM from current MTD (extrapolate based on month progress)
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthProgress = Math.max(now.getDate() / daysInMonth, 0.1) // avoid division by tiny numbers early in month

  for (const row of rows.rows) {
    const currentMtd = parseFloat(row.current_month)
    const avgMonthly = parseFloat(row.avg_prior_3)

    // Skip if no historical data to compare against
    if (avgMonthly <= 0) continue

    // EOM estimate: extrapolate current MTD to full month
    const currentEom = currentMtd / monthProgress

    const pctAbove = Math.round(((currentEom - avgMonthly) / avgMonthly) * 100)

    if (pctAbove > ANOMALY_THRESHOLD_PCT) {
      anomalies.push({
        platform: row.name,
        platformSlug: row.slug,
        currentEom: Math.round(currentEom * 100) / 100,
        avgMonthly: Math.round(avgMonthly * 100) / 100,
        pctAbove,
      })
    }
  }

  return anomalies.sort((a, b) => b.pctAbove - a.pctAbove)
}

/**
 * Persist anomaly alerts. Deduplicates against recent alerts (24h).
 */
export async function persistAnomalyAlerts(db: DB, anomalies: AnomalyResult[], config: Record<string, string>): Promise<number> {
  if (anomalies.length === 0) return 0

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentAlerts = await db
    .select({ alertType: alerts.alertType })
    .from(alerts)
    .where(and(gte(alerts.createdAt, since), eq(alerts.isActive, true)))
  const recentTypes = new Set(recentAlerts.map(a => a.alertType))

  let created = 0

  for (const anomaly of anomalies) {
    const alertType = `anomaly_${anomaly.platformSlug}`
    if (recentTypes.has(alertType)) continue

    const severity = anomaly.pctAbove >= 50 ? 'warning' as const : 'info' as const
    const message = `Spending anomaly: ${anomaly.platform} EOM estimate $${anomaly.currentEom.toFixed(2)} is ${anomaly.pctAbove}% above 3-month avg ($${anomaly.avgMonthly.toFixed(2)})`

    await db.insert(alerts).values({ severity, alertType, message })
    created++

    // Notify on significant anomalies (>50% above average)
    if (anomaly.pctAbove >= 50 && config.resendApiKey) {
      try {
        await sendAlertEmail(message, severity, `Anomaly: ${anomaly.platform} spending spike`, config)
        await sendWhatsApp(message, config)
      }
      catch {
        console.error(`[anomaly-detector] Notification failed for ${anomaly.platformSlug}`)
      }
    }
  }

  if (created > 0) {
    console.log(`[anomaly-detector] Created ${created} anomaly alert(s)`)
  }

  return created
}
