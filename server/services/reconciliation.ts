/**
 * Cost reconciliation — the authoritative trust layer.
 *
 * For each (platform, month), compares:
 *   A) sum of cost_records.amount  (what infracost says we spent)
 *   B) sum of invoices.totalAmount (what we actually got billed)
 *
 * Tolerance: ±$1 OR ±2%, whichever is LARGER (a $500/mo platform can drift
 * up to $10 before we complain; a $5/mo platform can drift up to $1).
 *
 * Status:
 *   match       — within tolerance
 *   over        — cost_records > invoices (over-reporting, possible dup)
 *   under       — cost_records < invoices (missing records, possible missout)
 *   no_invoice  — records exist but no invoice entered yet (not a failure)
 *   no_records  — invoice exists but no cost_records (collector silent)
 *
 * Integrity checks run alongside:
 *   - Duplicate cost_records (same platform+service+period+amount+method)
 *   - Missing periods (invoice without records OR records without invoice)
 *   - Cross-platform self-double-count (SUM records - SUM invoices > threshold)
 */
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { costRecords, invoices, platforms, reconciliationRuns } from '../db/schema'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'
import { alerts } from '../db/schema'

const TOLERANCE_PCT = 0.02
const TOLERANCE_ABS = 1.00

type ReconStatus = 'match' | 'over' | 'under' | 'no_invoice' | 'no_records'

export interface ReconciliationResult {
  platformId: number
  platformSlug: string
  platformName: string
  year: number
  month: number
  costRecordsSum: number
  invoicesSum: number
  delta: number
  deltaPct: number | null
  status: ReconStatus
  runAt: Date
}

export interface DuplicateRow {
  platformId: number
  platformSlug: string
  serviceId: number | null
  periodStart: Date
  periodEnd: Date
  amount: string
  collectionMethod: string
  count: number
}

export interface MissingPeriodRow {
  platformId: number
  platformSlug: string
  platformName: string
  hasInvoice: boolean
  hasRecords: boolean
  costRecordsSum: number
  invoicesSum: number
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59))
  return { start, end }
}

function classifyStatus(costSum: number, invSum: number): ReconStatus {
  if (invSum === 0 && costSum === 0) return 'match'
  if (invSum === 0) return 'no_invoice'
  if (costSum === 0) return 'no_records'
  const delta = costSum - invSum
  const tolerance = Math.max(TOLERANCE_ABS, invSum * TOLERANCE_PCT)
  if (Math.abs(delta) <= tolerance) return 'match'
  return delta > 0 ? 'over' : 'under'
}

export async function reconcileMonth(
  db: ReturnType<typeof import('../utils/db').useDB>,
  platformId: number,
  year: number,
  month: number,
): Promise<ReconciliationResult> {
  const { start, end } = monthRange(year, month)

  const plat = await db.select({ slug: platforms.slug, name: platforms.name })
    .from(platforms).where(eq(platforms.id, platformId)).limit(1)

  const [costRow] = await db
    .select({ total: sql<string>`coalesce(sum(${costRecords.amount}), 0)` })
    .from(costRecords)
    .where(and(
      eq(costRecords.platformId, platformId),
      gte(costRecords.periodStart, start),
      lte(costRecords.periodEnd, end),
      eq(costRecords.isActive, true),
      isNull(costRecords.deletedAt),
    ))

  const [invRow] = await db
    .select({ total: sql<string>`coalesce(sum(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(and(
      eq(invoices.platformId, platformId),
      gte(invoices.periodStart, start),
      lte(invoices.periodEnd, end),
      eq(invoices.isActive, true),
      isNull(invoices.deletedAt),
    ))

  const costRecordsSum = parseFloat(costRow?.total ?? '0')
  const invoicesSum = parseFloat(invRow?.total ?? '0')
  const delta = costRecordsSum - invoicesSum
  const deltaPct = invoicesSum > 0 ? (delta / invoicesSum) * 100 : null
  const status = classifyStatus(costRecordsSum, invoicesSum)

  return {
    platformId,
    platformSlug: plat[0]?.slug ?? `platform-${platformId}`,
    platformName: plat[0]?.name ?? `Platform ${platformId}`,
    year,
    month,
    costRecordsSum: Math.round(costRecordsSum * 10000) / 10000,
    invoicesSum: Math.round(invoicesSum * 10000) / 10000,
    delta: Math.round(delta * 10000) / 10000,
    deltaPct: deltaPct !== null ? Math.round(deltaPct * 10000) / 10000 : null,
    status,
    runAt: new Date(),
  }
}

export async function reconcileAll(
  db: ReturnType<typeof import('../utils/db').useDB>,
  year: number,
  month: number,
): Promise<ReconciliationResult[]> {
  const activePlatforms = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.isActive, true))

  const results: ReconciliationResult[] = []
  for (const p of activePlatforms) {
    results.push(await reconcileMonth(db, p.id, year, month))
  }
  return results
}

export async function persistReconciliationRun(
  db: ReturnType<typeof import('../utils/db').useDB>,
  results: ReconciliationResult[],
  config?: Record<string, string>,
): Promise<{ saved: number; mismatches: number }> {
  if (results.length === 0) return { saved: 0, mismatches: 0 }

  await db.insert(reconciliationRuns).values(
    results.map(r => ({
      year: r.year,
      month: r.month,
      platformId: r.platformId,
      costRecordsSum: r.costRecordsSum.toFixed(4),
      invoicesSum: r.invoicesSum.toFixed(4),
      delta: r.delta.toFixed(4),
      deltaPct: r.deltaPct !== null ? r.deltaPct.toFixed(4) : null,
      status: r.status,
      runAt: r.runAt,
    })),
  )

  const mismatches = results.filter(r => r.status === 'over' || r.status === 'under')
  if (mismatches.length === 0) return { saved: results.length, mismatches: 0 }

  // Dedup alerts: one per platform+year+month
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  let fired = 0
  for (const m of mismatches) {
    const alertType = `reconciliation_${m.status}_${m.platformSlug}_${m.year}_${m.month}`
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

    const message = m.status === 'over'
      ? `Reconciliation OVER for ${m.platformName} ${m.year}-${String(m.month).padStart(2, '0')}: infracost $${m.costRecordsSum.toFixed(2)} > invoices $${m.invoicesSum.toFixed(2)} (delta +$${m.delta.toFixed(2)}). Possible duplicate records.`
      : `Reconciliation UNDER for ${m.platformName} ${m.year}-${String(m.month).padStart(2, '0')}: infracost $${m.costRecordsSum.toFixed(2)} < invoices $${m.invoicesSum.toFixed(2)} (delta $${m.delta.toFixed(2)}). Possible missing collection or unbilled usage.`

    await db.insert(alerts).values({
      severity: 'warning',
      alertType,
      message,
    })
    fired++

    if (config) {
      try {
        await Promise.all([
          sendAlertEmail(message, 'warning', `Reconciliation mismatch: ${m.platformName}`, config),
          sendWhatsApp(`🔶 InfraCost reconciliation: ${message}`, config),
        ])
      }
      catch (err) {
        console.error('[reconciliation] Notification failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  return { saved: results.length, mismatches: fired }
}

export async function findDuplicateCostRecords(
  db: ReturnType<typeof import('../utils/db').useDB>,
  year: number,
  month: number,
): Promise<DuplicateRow[]> {
  const { start, end } = monthRange(year, month)
  const result = await db.execute<DuplicateRow>(sql`
    select
      cr.platform_id as "platformId",
      p.slug as "platformSlug",
      cr.service_id as "serviceId",
      cr.period_start as "periodStart",
      cr.period_end as "periodEnd",
      cr.amount::text as amount,
      cr.collection_method as "collectionMethod",
      count(*)::int as count
    from cost_records cr
    join platforms p on p.id = cr.platform_id
    where cr.period_start >= ${start}
      and cr.period_end <= ${end}
      and cr.is_active = true
      and cr.deleted_at is null
    group by cr.platform_id, p.slug, cr.service_id, cr.period_start,
             cr.period_end, cr.amount, cr.collection_method
    having count(*) > 1
    order by count(*) desc
    limit 100
  `)
  return result.rows
}

export async function findMissingPeriods(
  db: ReturnType<typeof import('../utils/db').useDB>,
  year: number,
  month: number,
): Promise<MissingPeriodRow[]> {
  const { start, end } = monthRange(year, month)
  const result = await db.execute<MissingPeriodRow>(sql`
    with cost_sums as (
      select platform_id, coalesce(sum(amount), 0) as total
      from cost_records
      where period_start >= ${start} and period_end <= ${end}
        and is_active = true and deleted_at is null
      group by platform_id
    ),
    inv_sums as (
      select platform_id, coalesce(sum(total_amount), 0) as total
      from invoices
      where period_start >= ${start} and period_end <= ${end}
        and is_active = true and deleted_at is null
      group by platform_id
    )
    select
      p.id as "platformId",
      p.slug as "platformSlug",
      p.name as "platformName",
      (inv_sums.total is not null) as "hasInvoice",
      (cost_sums.total is not null) as "hasRecords",
      coalesce(cost_sums.total, 0)::float8 as "costRecordsSum",
      coalesce(inv_sums.total, 0)::float8 as "invoicesSum"
    from platforms p
    left join cost_sums on cost_sums.platform_id = p.id
    left join inv_sums on inv_sums.platform_id = p.id
    where p.is_active = true
      and (
        (cost_sums.total is null and inv_sums.total is not null)
        or (cost_sums.total is not null and inv_sums.total is null)
      )
  `)
  return result.rows
}
