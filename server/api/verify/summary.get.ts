import { and, eq, gte, isNull, lte, sql, desc } from 'drizzle-orm'
import { verifications, costRecords, platforms } from '../../db/schema'
import { getCurrentMonthRange } from '../../collectors/base'
import { VERIFICATION_CONFIGS, getVerificationConfig } from '../../utils/verification-config'
import { EUR_USD_RATE, toEur } from '../../utils/currency'

interface SummaryRow {
  platformId: number
  platformSlug: string
  platformName: string
  billingUrl: string | null
  displayFormat: string | null
  notes: string | null
  reportedMtdUsd: number
  reportedMtdEur: number
  lastVerifiedAt: string | null
  lastVerifiedUsd: number | null
  lastDelta: number | null
  lastDeltaPct: number | null
  lastMethod: string | null
  daysSinceVerified: number | null
  status: 'verified' | 'stale' | 'mismatch' | 'unverified'
}

const MISMATCH_PCT = 2
const MISMATCH_ABS = 1
const STALE_DAYS = 7

export default defineEventHandler(async () => {
  const db = useDB()
  const { start, end } = getCurrentMonthRange()

  const allPlatforms = await db
    .select({ id: platforms.id, slug: platforms.slug, name: platforms.name })
    .from(platforms)
    .where(eq(platforms.isActive, true))

  // MTD per platform for the current month
  const mtdRows = await db
    .select({
      platformId: costRecords.platformId,
      total: sql<string>`coalesce(sum(${costRecords.amount}), 0)`,
    })
    .from(costRecords)
    .where(and(
      gte(costRecords.periodStart, start),
      lte(costRecords.periodEnd, end),
      eq(costRecords.isActive, true),
      isNull(costRecords.deletedAt),
    ))
    .groupBy(costRecords.platformId)
  const mtdByPlatform = new Map(mtdRows.map(r => [r.platformId, parseFloat(r.total)]))

  // Latest verification per platform (any method) for the current month
  const latestVerifs = await db.execute<{
    platform_id: number
    verified_at: string
    verified_usd: string
    delta: string
    delta_pct: string | null
    method: string
  }>(sql`
    select distinct on (platform_id)
      platform_id, verified_at, verified_usd, delta, delta_pct, method
    from verifications
    where period_start >= ${start}
      and period_end <= ${end}
      and is_active = true
    order by platform_id, verified_at desc
  `)
  const verifByPlatform = new Map(latestVerifs.rows.map(r => [r.platform_id, r]))

  const now = Date.now()
  const results: SummaryRow[] = []

  for (const p of allPlatforms) {
    const reportedMtd = mtdByPlatform.get(p.id) ?? 0
    const v = verifByPlatform.get(p.id)
    const config = getVerificationConfig(p.slug)

    let status: SummaryRow['status'] = 'unverified'
    let daysSinceVerified: number | null = null

    if (v) {
      const verifiedAt = new Date(v.verified_at).getTime()
      daysSinceVerified = Math.floor((now - verifiedAt) / 86400000)
      const delta = parseFloat(v.delta)
      const deltaPct = v.delta_pct ? parseFloat(v.delta_pct) : null
      const isMismatch = Math.abs(delta) > MISMATCH_ABS && deltaPct !== null && Math.abs(deltaPct) > MISMATCH_PCT
      if (isMismatch) status = 'mismatch'
      else if (daysSinceVerified > STALE_DAYS) status = 'stale'
      else status = 'verified'
    }

    results.push({
      platformId: p.id,
      platformSlug: p.slug,
      platformName: p.name,
      billingUrl: config?.billingUrl ?? null,
      displayFormat: config?.displayFormat ?? null,
      notes: config?.notes ?? null,
      reportedMtdUsd: Math.round(reportedMtd * 100) / 100,
      reportedMtdEur: toEur(reportedMtd),
      lastVerifiedAt: v?.verified_at ?? null,
      lastVerifiedUsd: v ? parseFloat(v.verified_usd) : null,
      lastDelta: v ? parseFloat(v.delta) : null,
      lastDeltaPct: v?.delta_pct ? parseFloat(v.delta_pct) : null,
      lastMethod: v?.method ?? null,
      daysSinceVerified,
      status,
    })
  }

  // Sort by status urgency: mismatch > unverified > stale > verified
  const order = { mismatch: 0, unverified: 1, stale: 2, verified: 3 }
  results.sort((a, b) => order[a.status] - order[b.status])

  const grandReported = results.reduce((s, r) => s + r.reportedMtdUsd, 0)
  const grandVerified = results.reduce((s, r) => s + (r.lastVerifiedUsd ?? 0), 0)
  const grandDelta = grandVerified - grandReported

  return {
    platforms: results,
    configs: VERIFICATION_CONFIGS,
    grandReportedUsd: Math.round(grandReported * 100) / 100,
    grandVerifiedUsd: Math.round(grandVerified * 100) / 100,
    grandDelta: Math.round(grandDelta * 100) / 100,
    grandReportedEur: toEur(grandReported),
    grandVerifiedEur: toEur(grandVerified),
    grandDeltaEur: toEur(grandDelta),
    eurUsdRate: EUR_USD_RATE,
    mismatchCount: results.filter(r => r.status === 'mismatch').length,
    verifiedCount: results.filter(r => r.status === 'verified').length,
    unverifiedCount: results.filter(r => r.status === 'unverified').length,
    staleCount: results.filter(r => r.status === 'stale').length,
  }
})
