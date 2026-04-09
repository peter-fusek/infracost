import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm'
import { costRecords, platforms, services, budgets, projects as projectsTable } from '../../db/schema'
import { getCurrentMonthRange, getMonthProgress } from '../../collectors/base'
import { EUR_USD_RATE, toEur } from '../../utils/currency'

interface ServiceBreakdown {
  serviceId: number
  name: string
  project: string | null
  platformName: string
  platformSlug: string
  platformType: string
  serviceType: string
  estimateUsd: number
  estimateEur: number
  actualMtdUsd: number
  actualMtdEur: number
  eomUsd: number
  eomEur: number
  costType: string
  collectionMethod: string
  recordCount: number
  variance: number
}

interface GroupBreakdown {
  key: string // platform slug or project name
  label: string
  type: string // platform type or 'project'
  totalEstimateUsd: number
  totalEstimateEur: number
  totalActualMtdUsd: number
  totalActualMtdEur: number
  totalEomUsd: number
  totalEomEur: number
  lastCollectedAt: string | null
  lastRunStatus: string | null
  budgetLimit: number | null
  services: ServiceBreakdown[]
}

export default defineEventHandler(async (event) => {
  const db = useDB()
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()
  const query = getQuery(event)
  const groupBy = (query.groupBy as string) || 'platform'

  // Get all services with their seed estimates
  const allServices = await db
    .select({
      id: services.id,
      platformId: services.platformId,
      platformSlug: platforms.slug,
      platformName: platforms.name,
      platformType: platforms.type,
      name: services.name,
      project: services.project,
      serviceType: services.serviceType,
      monthlyCostEstimate: services.monthlyCostEstimate,
    })
    .from(services)
    .innerJoin(platforms, eq(services.platformId, platforms.id))
    .where(and(eq(services.isActive, true), isNull(services.deletedAt)))
    .orderBy(platforms.name, services.name)

  // Get actual MTD costs grouped by service
  const actuals = await db
    .select({
      serviceId: costRecords.serviceId,
      platformId: costRecords.platformId,
      total: sql<string>`sum(${costRecords.amount})`,
      count: sql<number>`count(*)`,
      costType: costRecords.costType,
      collectionMethod: costRecords.collectionMethod,
    })
    .from(costRecords)
    .where(
      and(
        gte(costRecords.periodStart, start),
        lte(costRecords.periodEnd, end),
        eq(costRecords.isActive, true),
        isNull(costRecords.deletedAt),
      ),
    )
    .groupBy(costRecords.serviceId, costRecords.platformId, costRecords.costType, costRecords.collectionMethod)

  // Get latest collection run per platform using DISTINCT ON
  const latestRuns = await db.execute<{
    platform_id: number
    status: string
    completed_at: string | null
  }>(sql`
    select distinct on (platform_id)
      platform_id, status, completed_at
    from collection_runs
    order by platform_id, started_at desc
  `)
  const runMap = new Map(latestRuns.rows.map(r => [r.platform_id, r]))

  // Load project budgets for project-group view
  const projectBudgetMap = new Map<string, number>()
  if (groupBy === 'project') {
    const projectBudgets = await db
      .select({ slug: projectsTable.slug, monthlyLimit: budgets.monthlyLimit })
      .from(budgets)
      .innerJoin(projectsTable, eq(budgets.projectId, projectsTable.id))
      .where(and(eq(budgets.isActive, true), isNull(budgets.deletedAt)))
    for (const pb of projectBudgets) {
      if (pb.slug) projectBudgetMap.set(pb.slug, parseFloat(pb.monthlyLimit))
    }
  }

  // Build service-level actuals map
  const actualMap = new Map<string, { total: number; count: number; costType: string; method: string }>()
  for (const a of actuals) {
    const key = `${a.platformId}-${a.serviceId ?? 'platform'}`
    const existing = actualMap.get(key)
    const total = parseFloat(a.total || '0')
    if (existing) {
      existing.total += total
      existing.count += a.count
    } else {
      actualMap.set(key, { total, count: a.count, costType: a.costType, method: a.collectionMethod })
    }
  }

  // Build service breakdowns
  const allSvcBreakdowns: ServiceBreakdown[] = []

  for (const svc of allServices) {
    const estimate = parseFloat(svc.monthlyCostEstimate || '0')
    const actual = actualMap.get(`${svc.platformId}-${svc.id}`)
    const mtd = actual?.total ?? 0
    const isFixed = actual?.costType === 'subscription' || actual?.costType === 'one_time'
      || svc.serviceType === 'subscription'
    const eom = mtd > 0
      ? (isFixed ? mtd : (progress > 0 ? mtd / progress : mtd))
      : estimate

    allSvcBreakdowns.push({
      serviceId: svc.id,
      name: svc.name,
      project: svc.project,
      platformName: svc.platformName,
      platformSlug: svc.platformSlug,
      platformType: svc.platformType,
      serviceType: svc.serviceType,
      estimateUsd: estimate,
      estimateEur: toEur(estimate),
      actualMtdUsd: Math.round(mtd * 100) / 100,
      actualMtdEur: toEur(mtd),
      eomUsd: Math.round(eom * 100) / 100,
      eomEur: toEur(eom),
      costType: actual?.costType ?? 'usage',
      collectionMethod: actual?.method ?? 'manual',
      recordCount: actual?.count ?? 0,
      variance: estimate > 0 ? Math.round((eom - estimate) * 100) / 100 : 0,
    })
  }

  // Platform-level costs without service assignment — create synthetic "Unallocated" rows
  for (const a of actuals) {
    if (a.serviceId === null) {
      const total = parseFloat(a.total || '0')
      if (total <= 0) continue
      const platformInfo = allServices.find(s => s.platformId === a.platformId)
      if (!platformInfo) continue
      const isFixed = a.costType === 'subscription' || a.costType === 'one_time'
      const eom = isFixed ? total : (progress > 0 ? total / progress : total)
      allSvcBreakdowns.push({
        serviceId: -a.platformId, // negative ID for synthetic rows
        name: 'Unallocated',
        project: null,
        platformName: platformInfo.platformName,
        platformSlug: platformInfo.platformSlug,
        platformType: platformInfo.platformType,
        serviceType: a.costType || 'usage',
        estimateUsd: 0,
        estimateEur: 0,
        actualMtdUsd: Math.round(total * 100) / 100,
        actualMtdEur: toEur(total),
        eomUsd: Math.round(eom * 100) / 100,
        eomEur: toEur(eom),
        costType: a.costType ?? 'usage',
        collectionMethod: a.collectionMethod ?? 'manual',
        recordCount: a.count,
        variance: 0,
      })
    }
  }

  // Pre-build slug → platformId map for O(1) lookups
  const slugToPlatformId = new Map<string, number>()
  for (const svc of allServices) {
    if (!slugToPlatformId.has(svc.platformSlug)) {
      slugToPlatformId.set(svc.platformSlug, svc.platformId)
    }
  }

  // Group services by the chosen dimension
  const groups = new Map<string, GroupBreakdown>()

  for (const svc of allSvcBreakdowns) {
    let groupKey: string
    let label: string
    let type: string

    if (groupBy === 'project') {
      groupKey = svc.project || 'Unassigned'
      label = groupKey
      type = 'project'
    } else {
      groupKey = svc.platformSlug
      label = svc.platformName
      type = svc.platformType
    }

    if (!groups.has(groupKey)) {
      const run = groupBy === 'platform'
        ? runMap.get(slugToPlatformId.get(groupKey) ?? -1) as { completed_at: string | null; status: string } | undefined
        : undefined
      groups.set(groupKey, {
        key: groupKey,
        label,
        type,
        totalEstimateUsd: 0,
        totalEstimateEur: 0,
        totalActualMtdUsd: 0,
        totalActualMtdEur: 0,
        totalEomUsd: 0,
        totalEomEur: 0,
        lastCollectedAt: run?.completed_at ?? null,
        lastRunStatus: run?.status ?? null,
        budgetLimit: projectBudgetMap.get(groupKey) ?? null,
        services: [],
      })
    }

    const group = groups.get(groupKey)!
    group.services.push(svc)
    group.totalEstimateUsd += svc.estimateUsd
    group.totalActualMtdUsd += svc.actualMtdUsd
    group.totalEomUsd += svc.eomUsd
  }

  // Finalize EUR totals and sort
  const result: GroupBreakdown[] = []
  for (const group of groups.values()) {
    group.totalEstimateEur = toEur(group.totalEstimateUsd)
    group.totalActualMtdEur = toEur(group.totalActualMtdUsd)
    group.totalEomEur = toEur(group.totalEomUsd)
    group.totalActualMtdUsd = Math.round(group.totalActualMtdUsd * 100) / 100
    group.totalEomUsd = Math.round(group.totalEomUsd * 100) / 100
    group.services.sort((a, b) => b.estimateUsd - a.estimateUsd)
    result.push(group)
  }

  result.sort((a, b) => b.totalEstimateUsd - a.totalEstimateUsd)

  const grandTotalEstimate = result.reduce((s, p) => s + p.totalEstimateUsd, 0)
  const grandTotalMtd = result.reduce((s, p) => s + p.totalActualMtdUsd, 0)
  const grandTotalEom = result.reduce((s, p) => s + p.totalEomUsd, 0)

  // Collect distinct projects for the UI
  const projects = [...new Set(allSvcBreakdowns.map(s => s.project).filter(Boolean))] as string[]

  // Global last updated: most recent collection run completion
  const lastUpdated = result.reduce<string | null>((latest, g) => {
    if (!g.lastCollectedAt) return latest
    if (!latest) return g.lastCollectedAt
    return g.lastCollectedAt > latest ? g.lastCollectedAt : latest
  }, null)

  // Next update: daily cron at 06:00 UTC
  const now = new Date()
  const nextRun = new Date(now)
  nextRun.setUTCHours(6, 0, 0, 0)
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1)

  return {
    groupBy,
    monthProgress: Math.round(progress * 100),
    eurUsdRate: EUR_USD_RATE,
    grandTotal: {
      estimateUsd: Math.round(grandTotalEstimate * 100) / 100,
      estimateEur: toEur(grandTotalEstimate),
      mtdUsd: Math.round(grandTotalMtd * 100) / 100,
      mtdEur: toEur(grandTotalMtd),
      eomUsd: Math.round(grandTotalEom * 100) / 100,
      eomEur: toEur(grandTotalEom),
    },
    groups: result,
    projects,
    lastUpdatedAt: lastUpdated,
    nextUpdateAt: nextRun.toISOString(),
  }
})
