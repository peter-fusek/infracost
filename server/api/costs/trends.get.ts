import { sql } from 'drizzle-orm'
import { EUR_USD_RATE, toEur } from '../../utils/currency'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDB()

  // How many months back (default 6, max 12)
  const months = Math.min(Number(query.months) || 6, 12)

  // Single query: group by month + platform across the entire date range
  const rows = await db.execute<{
    month_key: string
    platform_slug: string
    platform_name: string
    total: string
    record_count: number
  }>(sql`
    select
      to_char(date_trunc('month', cr.period_start), 'YYYY-MM') as month_key,
      p.slug as platform_slug,
      p.name as platform_name,
      sum(cr.amount::numeric)::text as total,
      count(*)::int as record_count
    from cost_records cr
    join platforms p on p.id = cr.platform_id
    where cr.is_active = true
      and cr.deleted_at is null
      and cr.period_start >= date_trunc('month', now()) - ${months + ' months'}::interval
    group by month_key, p.slug, p.name
    order by month_key, total desc
  `)

  // Build month labels for the range
  const now = new Date()
  const monthMeta = new Map<string, { label: string; idx: number }>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    monthMeta.set(key, { label, idx: months - 1 - i })
  }

  // Group results by month
  const monthMap = new Map<string, {
    month: string
    label: string
    totalUsd: number
    totalEur: number
    byPlatform: Array<{ platformSlug: string; platformName: string; totalUsd: number; totalEur: number; recordCount: number }>
  }>()

  // Initialize all months (even empty ones)
  for (const [key, meta] of monthMeta) {
    monthMap.set(key, {
      month: key,
      label: meta.label,
      totalUsd: 0,
      totalEur: 0,
      byPlatform: [],
    })
  }

  // Fill in data from query results
  for (const row of rows.rows) {
    const month = monthMap.get(row.month_key)
    if (!month) continue // outside our range

    const totalUsd = Math.round(parseFloat(row.total || '0') * 100) / 100
    month.byPlatform.push({
      platformSlug: row.platform_slug,
      platformName: row.platform_name,
      totalUsd,
      totalEur: toEur(totalUsd),
      recordCount: row.record_count,
    })
    month.totalUsd += totalUsd
  }

  // Finalize: round totals, sort platforms, compute MoM changes
  const results = [...monthMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      ...m,
      totalUsd: Math.round(m.totalUsd * 100) / 100,
      totalEur: toEur(m.totalUsd),
      byPlatform: m.byPlatform.sort((a, b) => b.totalUsd - a.totalUsd),
    }))

  const withChanges = results.map((m, i) => ({
    ...m,
    momChange: i > 0 && results[i - 1]!.totalUsd > 0
      ? Math.round(((m.totalUsd - results[i - 1]!.totalUsd) / results[i - 1]!.totalUsd) * 100)
      : null,
  }))

  return {
    months: withChanges,
    eurUsdRate: EUR_USD_RATE,
  }
})
