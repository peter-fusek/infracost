import { sql } from 'drizzle-orm'
import { toEur } from '../utils/currency'
import { computeExpiryStatuses } from '../utils/free-tier-expiry'

/**
 * Weekly summary endpoint — returns a structured cost report.
 * Designed for email consumption or dashboard widgets.
 */
export default defineEventHandler(async () => {
  const db = useDB()

  // 1. MTD costs per platform
  const mtdRows = await db.execute<{
    slug: string
    name: string
    mtd: string
    record_count: number
  }>(sql`
    select p.slug, p.name,
      coalesce(sum(cr.amount::numeric), 0) as mtd,
      count(cr.id)::int as record_count
    from platforms p
    left join cost_records cr on cr.platform_id = p.id
      and cr.is_active = true and cr.deleted_at is null
      and cr.period_start >= date_trunc('month', now())
    where p.is_active = true
    group by p.slug, p.name
    order by mtd desc
  `)

  // 2. Last month total for MoM comparison
  const lastMonthRow = await db.execute<{ total: string }>(sql`
    select coalesce(sum(cr.amount::numeric), 0) as total
    from cost_records cr
    where cr.is_active = true and cr.deleted_at is null
      and cr.period_start >= date_trunc('month', now()) - interval '1 month'
      and cr.period_start < date_trunc('month', now())
  `)

  // 3. Active alerts count by severity
  const alertCounts = await db.execute<{ severity: string; cnt: number }>(sql`
    select severity, count(*)::int as cnt
    from alerts
    where is_active = true and status = 'pending'
      and created_at >= date_trunc('month', now())
    group by severity
  `)

  // 4. Budget status
  const budgetRow = await db.execute<{ monthly_limit: string }>(sql`
    select monthly_limit from budgets where is_active = true and deleted_at is null limit 1
  `)

  // 5. Free tier expiry urgent items
  const expiryStatuses = computeExpiryStatuses()
  const urgentExpiry = expiryStatuses.filter(e => e.risk !== 'ok')

  // Compute totals
  const totalMtd = mtdRows.rows.reduce((sum, r) => sum + parseFloat(r.mtd), 0)
  const lastMonthTotal = parseFloat(lastMonthRow.rows[0]?.total || '0')
  const budgetLimit = parseFloat(budgetRow.rows[0]?.monthly_limit || '0')

  // EOM projection
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthProgress = Math.max(now.getDate() / daysInMonth, 0.1)
  const eomEstimate = Math.round((totalMtd / monthProgress) * 100) / 100

  const momChange = lastMonthTotal > 0
    ? Math.round(((eomEstimate - lastMonthTotal) / lastMonthTotal) * 100)
    : null

  const alertSummary: Record<string, number> = {}
  for (const row of alertCounts.rows) {
    alertSummary[row.severity] = row.cnt
  }

  return {
    period: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    generatedAt: now.toISOString(),
    dayOfMonth: now.getDate(),
    daysInMonth,
    monthProgressPct: Math.round(monthProgress * 100),

    costs: {
      mtdUsd: Math.round(totalMtd * 100) / 100,
      mtdEur: toEur(totalMtd),
      eomEstimateUsd: eomEstimate,
      eomEstimateEur: toEur(eomEstimate),
      lastMonthUsd: Math.round(lastMonthTotal * 100) / 100,
      momChangePct: momChange,
    },

    budget: {
      limitUsd: budgetLimit,
      usedPct: budgetLimit > 0 ? Math.round((eomEstimate / budgetLimit) * 100) : 0,
      status: budgetLimit <= 0 ? 'none' : eomEstimate >= budgetLimit ? 'exceeded' : eomEstimate >= budgetLimit * 0.9 ? 'warning' : 'ok',
    },

    platforms: mtdRows.rows
      .filter(r => parseFloat(r.mtd) > 0)
      .map(r => ({
        name: r.name,
        slug: r.slug,
        mtdUsd: Math.round(parseFloat(r.mtd) * 100) / 100,
        mtdEur: toEur(parseFloat(r.mtd)),
        records: r.record_count,
      })),

    alerts: alertSummary,
    totalAlerts: Object.values(alertSummary).reduce((a, b) => a + b, 0),

    expiry: urgentExpiry.map(e => ({
      service: e.service,
      platform: e.platform,
      daysUntil: e.daysUntil,
      risk: e.risk,
    })),
  }
})
