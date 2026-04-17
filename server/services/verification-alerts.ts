/**
 * Fires alerts when platform visual-verification tells us infracost's numbers
 * disagree with the platform's own billing UI (mismatch), or when it's been
 * too long since we checked (stale).
 * 7-day dedup per platform per alertType.
 */
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { alerts, platforms, verifications } from '../db/schema'
import { getCurrentMonthRange } from '../collectors/base'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

const MISMATCH_PCT = 2
const MISMATCH_ABS = 1
const STALE_DAYS = 14

export async function checkVerificationAlerts(
  db: ReturnType<typeof import('../utils/db').useDB>,
  config?: Record<string, string>,
) {
  const newAlerts: Array<{ platform: string; kind: 'mismatch' | 'stale'; message: string }> = []
  const { start, end } = getCurrentMonthRange()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Latest verification per platform for current month
  const latest = await db.execute<{
    platform_id: number
    slug: string
    name: string
    verified_at: string
    verified_usd: string
    reported_usd: string
    delta: string
    delta_pct: string | null
    method: string
  }>(sql`
    select distinct on (v.platform_id)
      v.platform_id, p.slug, p.name, v.verified_at, v.verified_usd,
      v.reported_usd, v.delta, v.delta_pct, v.method
    from verifications v
    join platforms p on p.id = v.platform_id
    where v.period_start >= ${start}
      and v.period_end <= ${end}
      and v.is_active = true
    order by v.platform_id, v.verified_at desc
  `)

  // All active platforms — to find ones with NO verification at all for staleness
  const allPlatforms = await db
    .select({ id: platforms.id, slug: platforms.slug, name: platforms.name })
    .from(platforms)
    .where(eq(platforms.isActive, true))

  const now = Date.now()

  // Mismatch checks
  for (const row of latest.rows) {
    const delta = parseFloat(row.delta)
    const deltaPct = row.delta_pct ? parseFloat(row.delta_pct) : null
    const isMismatch =
      Math.abs(delta) > MISMATCH_ABS &&
      deltaPct !== null &&
      Math.abs(deltaPct) > MISMATCH_PCT
    if (!isMismatch) continue

    const alertType = `verification_mismatch_${row.slug}`
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

    const verified = parseFloat(row.verified_usd)
    const reported = parseFloat(row.reported_usd)
    const direction = delta > 0 ? 'higher' : 'lower'
    const message = `Verification mismatch on ${row.name}: platform shows $${verified.toFixed(2)}, infracost reports $${reported.toFixed(2)} (${direction} by $${Math.abs(delta).toFixed(2)}, ${Math.abs(deltaPct!).toFixed(1)}%). Method: ${row.method}.`

    await db.insert(alerts).values({
      severity: 'warning',
      alertType,
      message,
    })
    newAlerts.push({ platform: row.slug, kind: 'mismatch', message })

    if (config) {
      try {
        await Promise.all([
          sendAlertEmail(message, 'warning', `${row.name} verification mismatch`, config),
          sendWhatsApp(`🔶 InfraCost warning: ${message}`, config),
        ])
      }
      catch (err) {
        console.error('[verification-alerts] Notification failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  // Stale checks — platform has no verification for current month OR last check > 14 days ago
  const verifiedPlatformIds = new Set(latest.rows.map(r => r.platform_id))
  for (const p of allPlatforms) {
    const latestRow = latest.rows.find(r => r.platform_id === p.id)
    const daysSince = latestRow
      ? Math.floor((now - new Date(latestRow.verified_at).getTime()) / 86400000)
      : Infinity

    if (daysSince <= STALE_DAYS) continue

    const alertType = `verification_stale_${p.slug}`
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

    const message = verifiedPlatformIds.has(p.id)
      ? `${p.name} not verified in ${daysSince} days — run a visual check on the platform dashboard.`
      : `${p.name} has never been verified against its platform UI this month. Run /verify.`

    await db.insert(alerts).values({
      severity: 'info',
      alertType,
      message,
    })
    newAlerts.push({ platform: p.slug, kind: 'stale', message })
  }

  return newAlerts
}
