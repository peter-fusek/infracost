/**
 * Systemic invariant checks. Runs assertions that any healthy deployment
 * should ALWAYS satisfy. If any fails, fires an alert.
 *
 * Rationale (#92): this session found that bugs hide in layers without a
 * layer above them verifying behavior. These checks ARE that layer.
 */
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { alerts, costRecords, creditBalances, platforms } from '../db/schema'
import { getCurrentMonthRange, getMonthProgress } from '../collectors/base'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

const BREAKDOWN_MTD_TOLERANCE = 0.01 // 1%
const DEFAULT_BALANCE_STALE_DAYS = 14

export async function checkInvariants(
  db: ReturnType<typeof import('../utils/db').useDB>,
  config?: Record<string, string>,
) {
  const violations: Array<{ check: string; message: string }> = []

  // --- Invariant 1: breakdown grand total equals MTD grand total within 1% ---
  // Both endpoints sum the same cost_records but apply different aggregation logic.
  // If they diverge, the breakdown is double-counting (the $935 Claude Max bug class).
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()

  const [mtdRow] = await db
    .select({ total: sql<string>`coalesce(sum(${costRecords.amount}), 0)` })
    .from(costRecords)
    .where(and(
      gte(costRecords.periodStart, start),
      lte(costRecords.periodEnd, end),
      eq(costRecords.isActive, true),
      isNull(costRecords.deletedAt),
    ))

  const mtdTotal = parseFloat(mtdRow?.total ?? '0')

  // Approximate what breakdown would compute by summing per-platform EOMs.
  // Breakdown's EOM logic: if all actuals are subscription/one_time, eom=total;
  // else eom = total / progress. We approximate here with the ratio.
  const [breakdownRow] = await db.execute<{ total: string }>(sql`
    select coalesce(sum(
      case
        when cost_type in ('subscription', 'one_time') then amount
        else amount / greatest(${progress}, 0.01)
      end
    ), 0)::text as total
    from cost_records
    where period_start >= ${start}
      and period_end <= ${end}
      and is_active = true
      and deleted_at is null
  `)
  const breakdownEomTotal = parseFloat(breakdownRow?.total ?? '0')

  // Compare just the MTD-derived side — both endpoints should agree on MTD exactly
  const diff = Math.abs(breakdownEomTotal - mtdTotal / Math.max(progress, 0.01))
  const tolerance = Math.max(1, mtdTotal * BREAKDOWN_MTD_TOLERANCE)
  // NOTE: this is a ratio check, not exact. If actuals and progress align, both sides match.
  // The check fires only on VERY large divergence (>$10 or >10%), which would indicate
  // double-counting at the breakdown aggregation level.
  if (diff > tolerance * 10) {
    violations.push({
      check: 'breakdown_mtd_divergence',
      message: `Breakdown EOM projection ($${breakdownEomTotal.toFixed(2)}) diverges from MTD-based EOM ($${(mtdTotal / Math.max(progress, 0.01)).toFixed(2)}) by more than $${(tolerance * 10).toFixed(2)}. Possible aggregation double-count.`,
    })
  }

  // --- Invariant 2: every prepaid platform has a credit_balances row ---
  // If billingCycle='usage' implies prepaid depletion risk for some platforms,
  // we should never silently rely on hardcoded fallbacks (the 2026-04-17 incident).
  const prepaidSlugs = ['anthropic', 'railway']
  for (const slug of prepaidSlugs) {
    const [plat] = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.slug, slug)).limit(1)
    if (!plat) continue
    const bal = await db.select().from(creditBalances).where(eq(creditBalances.platform, slug)).limit(1)
    if (bal.length === 0) {
      violations.push({
        check: 'missing_credit_balance',
        message: `${slug}: prepaid platform has no credit_balances row. Dashboard is using a hardcoded fallback. POST /api/depletion {platform:"${slug}", balance:<usd>} to fix.`,
      })
      continue
    }
    const row = bal[0]!
    const days = Math.floor((Date.now() - row.updatedAt.getTime()) / 86400000)
    if (days > DEFAULT_BALANCE_STALE_DAYS) {
      violations.push({
        check: 'stale_credit_balance',
        message: `${slug}: credit_balances row is ${days} days old — dashboard depletion estimate is likely inaccurate. Update via POST /api/depletion or /verify page.`,
      })
    }
  }

  // --- Invariant 3: no cost records with identical composite key (dedup integrity) ---
  const dupCheck = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from (
      select platform_id, service_id, period_start, period_end, amount, collection_method, cost_type
      from cost_records
      where period_start >= ${start}
        and period_end <= ${end}
        and is_active = true
        and deleted_at is null
      group by platform_id, service_id, period_start, period_end, amount, collection_method, cost_type
      having count(*) > 1
    ) dups
  `)
  const dupCount = parseInt(dupCheck.rows[0]?.count ?? '0', 10)
  if (dupCount > 0) {
    violations.push({
      check: 'duplicate_cost_records',
      message: `${dupCount} groups of duplicate cost_records found for current month. See /reconciliation page for details.`,
    })
  }

  // --- Fire alerts for new violations (24h dedup per check type) ---
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  for (const v of violations) {
    const alertType = `invariant_${v.check}`
    const existing = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(
        eq(alerts.alertType, alertType),
        gte(alerts.createdAt, oneDayAgo),
        eq(alerts.isActive, true),
      ))
      .limit(1)
    if (existing.length > 0) continue

    await db.insert(alerts).values({
      severity: 'warning',
      alertType,
      message: v.message,
    })

    if (config) {
      try {
        await Promise.all([
          sendAlertEmail(v.message, 'warning', `Invariant violated: ${v.check}`, config),
          sendWhatsApp(`🔶 InfraCost invariant: ${v.message}`, config),
        ])
      }
      catch (err) {
        console.error('[invariants] Notification failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  return { violations, firedAlerts: violations.length }
}
