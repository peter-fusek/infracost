import { sql } from 'drizzle-orm'
import { PLAN_LIMITS, formatUsage, formatLimit, extractUsage } from '../utils/plan-limits'
import type { PlanLimit } from '../utils/plan-limits'

interface LimitMetric {
  metric: string
  label: string
  used: number | null
  usedFormatted: string
  limit: number
  limitFormatted: string
  pct: number | null
  riskLevel: 'ok' | 'warning' | 'critical' | 'exceeded' | 'unknown'
}

interface PlatformLimits {
  slug: string
  name: string
  metrics: LimitMetric[]
  worstRisk: 'ok' | 'warning' | 'critical' | 'exceeded' | 'unknown'
}

function riskFromPct(pct: number | null): LimitMetric['riskLevel'] {
  if (pct === null) return 'unknown'
  if (pct >= 100) return 'exceeded'
  if (pct >= 90) return 'critical'
  if (pct >= 75) return 'warning'
  return 'ok'
}

const RISK_ORDER = { exceeded: 0, critical: 1, warning: 2, ok: 3, unknown: 4 }

export default defineEventHandler(async () => {
  const db = useDB()

  // Get latest cost record per platform (DISTINCT ON platform_id, ordered by record_date desc)
  const latestRecords = await db.execute<{
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
  `)

  // For Railway, we need to sum all project costs (multiple records per platform)
  const railwayTotal = await db.execute<{ total: string }>(sql`
    select coalesce(sum(cr.amount::numeric), 0) as total
    from cost_records cr
    join platforms p on p.id = cr.platform_id
    where p.slug = 'railway'
      and cr.is_active = true and cr.deleted_at is null
      and cr.collection_method = 'api'
      and cr.period_start >= date_trunc('month', now())
  `)

  const results: PlatformLimits[] = []

  for (const row of latestRecords.rows) {
    const limits = PLAN_LIMITS[row.slug]
    if (!limits) continue // no limits defined for this platform

    const rawData = row.raw_data || {}
    const usage = extractUsage(row.slug, rawData)

    // Special case: Railway credit usage comes from cost sum, not rawData
    if (row.slug === 'railway') {
      const total = parseFloat(railwayTotal.rows[0]?.total || '0')
      usage.monthly_credit_usd = total
    }

    const metrics: LimitMetric[] = []

    for (const [metricKey, limitDef] of Object.entries(limits)) {
      const used = usage[metricKey] ?? null
      const pct = used !== null ? Math.round((used / limitDef.limit) * 100) : null

      metrics.push({
        metric: metricKey,
        label: limitDef.label,
        used,
        usedFormatted: used !== null ? formatUsage(used, limitDef.unit) : 'N/A',
        limit: limitDef.limit,
        limitFormatted: formatLimit(limitDef),
        pct,
        riskLevel: riskFromPct(pct),
      })
    }

    const worstRisk = metrics.reduce<LimitMetric['riskLevel']>((worst, m) => {
      return RISK_ORDER[m.riskLevel] < RISK_ORDER[worst] ? m.riskLevel : worst
    }, 'unknown')

    results.push({ slug: row.slug, name: row.name, metrics, worstRisk })
  }

  // Sort by worst risk first
  results.sort((a, b) => RISK_ORDER[a.worstRisk] - RISK_ORDER[b.worstRisk])

  return {
    platforms: results,
    checkedAt: new Date().toISOString(),
  }
})
