/**
 * Detects silently broken collectors.
 * A collector is "broken" if its last 3 completed runs all returned 0 records
 * with partial/failed status. 7-day dedup per platform.
 *
 * Motivating incident (2026-04-17): Anthropic collector returned 0 records for
 * ~2 weeks due to an API contract change. `partial` status + swallowed error
 * meant no one noticed until credits ran out.
 */
import { and, eq, gte, sql } from 'drizzle-orm'
import { alerts } from '../db/schema'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

interface BrokenRow {
  slug: string
  name: string
  bad_runs: number
  last_error: string | null
}

export async function checkCollectorRegressions(
  db: ReturnType<typeof import('../utils/db').useDB>,
  config?: Record<string, string>,
) {
  const newAlerts: Array<{ platform: string; message: string }> = []

  const result = await db.execute<BrokenRow>(sql`
    with recent as (
      select
        cr.platform_id,
        p.slug,
        p.name,
        cr.status,
        cr.records_collected,
        cr.error_message,
        row_number() over (partition by cr.platform_id order by cr.started_at desc) as rn
      from collection_runs cr
      join platforms p on p.id = cr.platform_id
      where cr.completed_at is not null
    )
    select
      slug,
      name,
      count(*)::int as bad_runs,
      max(error_message) filter (where rn = 1) as last_error
    from recent
    where rn <= 3
      and status in ('partial', 'failed')
      and records_collected = 0
    group by slug, name
    having count(*) >= 3
  `)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  for (const row of result.rows) {
    const alertType = `collector_broken_${row.slug}`

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

    const errorSnippet = row.last_error ? ` Last error: ${row.last_error.slice(0, 160)}` : ''
    const message = `Collector broken: ${row.name} returned 0 records for ${row.bad_runs} consecutive runs.${errorSnippet}`

    await db.insert(alerts).values({
      severity: 'critical',
      alertType,
      message,
    })
    newAlerts.push({ platform: row.slug, message })

    if (config) {
      try {
        await Promise.all([
          sendAlertEmail(message, 'critical', `${row.name} collector broken`, config),
          sendWhatsApp(`🚨 InfraCost critical: ${message}`, config),
        ])
      }
      catch (err) {
        console.error(`[collector-regression] Notification failed for ${row.slug}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  return newAlerts
}
