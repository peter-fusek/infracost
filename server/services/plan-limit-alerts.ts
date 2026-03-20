import { sql, and, eq, gte } from 'drizzle-orm'
import { alerts } from '../db/schema'
import { PLAN_LIMITS, formatUsage, formatLimit, extractUsage } from '../utils/plan-limits'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

const THRESHOLDS = [
  { pct: 100, severity: 'critical' as const, label: 'exceeded limit' },
  { pct: 90, severity: 'warning' as const, label: 'at 90%' },
  { pct: 75, severity: 'warning' as const, label: 'at 75%' },
]

export async function checkPlanLimitAlerts(db: ReturnType<typeof import('../utils/db').useDB>, config?: Record<string, string>) {
  const newAlerts: Array<{ severity: string; message: string; platform: string; metric: string }> = []

  // Run both queries in parallel — they are independent
  const [latestRecords, railwayTotal] = await Promise.all([
    db.execute<{
      platform_id: number
      slug: string
      name: string
      raw_data: Record<string, unknown> | null
      amount: string
    }>(sql`
      select distinct on (cr.platform_id)
        cr.platform_id, p.slug, p.name, cr.raw_data, cr.amount
      from cost_records cr
      join platforms p on p.id = cr.platform_id
      where cr.is_active = true and cr.deleted_at is null
        and cr.collection_method != 'manual'
      order by cr.platform_id, cr.record_date desc
    `),
    db.execute<{ total: string }>(sql`
      select coalesce(sum(cr.amount::numeric), 0) as total
      from cost_records cr
      join platforms p on p.id = cr.platform_id
      where p.slug = 'railway'
        and cr.is_active = true and cr.deleted_at is null
        and cr.collection_method = 'api'
        and cr.period_start >= date_trunc('month', now())
    `),
  ])

  // Batch-load recent limit alerts for dedup (single query instead of N+1)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentAlerts = await db
    .select({ alertType: alerts.alertType })
    .from(alerts)
    .where(and(gte(alerts.createdAt, since), eq(alerts.isActive, true)))
  const recentAlertTypes = new Set(recentAlerts.map(a => a.alertType))

  for (const row of latestRecords.rows) {
    const limits = PLAN_LIMITS[row.slug]
    if (!limits) continue

    const rawData = row.raw_data || {}
    const usage = extractUsage(row.slug, rawData)

    if (row.slug === 'railway') {
      usage.monthly_credit_usd = parseFloat(railwayTotal.rows[0]?.total || '0')
    }

    for (const [metricKey, limitDef] of Object.entries(limits)) {
      const used = usage[metricKey] ?? null
      if (used === null) continue

      const pct = Math.round((used / limitDef.limit) * 100)

      // Find highest breached threshold
      for (const threshold of THRESHOLDS) {
        if (pct < threshold.pct) continue

        const alertType = `limit_${threshold.pct}_${row.slug}_${metricKey}`

        // In-memory dedup check
        if (recentAlertTypes.has(alertType)) break

        const message = `Plan limit ${threshold.label}: ${row.name} — ${limitDef.label} at ${pct}% (${formatUsage(used, limitDef.unit)} / ${formatLimit(limitDef)})`
        await db.insert(alerts).values({
          severity: threshold.severity,
          alertType,
          message,
        })
        recentAlertTypes.add(alertType)
        newAlerts.push({ severity: threshold.severity, message, platform: row.slug, metric: metricKey })

        // Send notifications in parallel for warning/critical
        if (config && (threshold.severity === 'warning' || threshold.severity === 'critical')) {
          await Promise.all([
            sendAlertEmail(message, threshold.severity, 'Plan limit alert', config),
            sendWhatsApp(`🚨 InfraCost ${threshold.severity}: ${message}`, config),
          ])
        }

        break // only highest threshold
      }
    }
  }

  return newAlerts
}
