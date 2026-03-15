import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm'
import { costRecords, platforms, services } from '../../db/schema'
import { getCurrentMonthRange, getMonthProgress } from '../../collectors/base'

const EUR_USD_RATE = 0.92
function toEur(usd: number) { return Math.round(usd * EUR_USD_RATE * 100) / 100 }

export default defineEventHandler(async () => {
  const db = useDB()
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()

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

  // Build breakdown grouped by platform
  interface ServiceBreakdown {
    serviceId: number
    name: string
    project: string | null
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
    variance: number // eom vs estimate, negative = under budget
  }

  interface PlatformBreakdown {
    platformId: number
    slug: string
    name: string
    type: string
    totalEstimateUsd: number
    totalEstimateEur: number
    totalActualMtdUsd: number
    totalActualMtdEur: number
    totalEomUsd: number
    totalEomEur: number
    services: ServiceBreakdown[]
  }

  const platformGroups = new Map<number, PlatformBreakdown>()

  for (const svc of allServices) {
    if (!platformGroups.has(svc.platformId)) {
      platformGroups.set(svc.platformId, {
        platformId: svc.platformId,
        slug: svc.platformSlug,
        name: svc.platformName,
        type: svc.platformType,
        totalEstimateUsd: 0,
        totalEstimateEur: 0,
        totalActualMtdUsd: 0,
        totalActualMtdEur: 0,
        totalEomUsd: 0,
        totalEomEur: 0,
        services: [],
      })
    }

    const pg = platformGroups.get(svc.platformId)!
    const estimate = parseFloat(svc.monthlyCostEstimate || '0')
    const actual = actualMap.get(`${svc.platformId}-${svc.id}`)
    const mtd = actual?.total ?? 0
    const isFixed = actual?.costType === 'subscription' || actual?.costType === 'one_time'
      || svc.serviceType === 'subscription'
    // Fixed costs: EOM = MTD (full month amount). Usage: project from progress.
    const eom = mtd > 0
      ? (isFixed ? mtd : (progress > 0 ? mtd / progress : mtd))
      : estimate

    const svcBreakdown: ServiceBreakdown = {
      serviceId: svc.id,
      name: svc.name,
      project: svc.project,
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
    }

    pg.services.push(svcBreakdown)
    pg.totalEstimateUsd += estimate
    pg.totalActualMtdUsd += mtd
    pg.totalEomUsd += eom
  }

  // Also pick up platform-level costs without service assignment
  for (const a of actuals) {
    if (a.serviceId === null) {
      const pg = platformGroups.get(a.platformId)
      if (pg) {
        const total = parseFloat(a.total || '0')
        pg.totalActualMtdUsd += total
        pg.totalEomUsd += progress > 0 ? total / progress : total
      }
    }
  }

  // Finalize EUR totals
  const result: PlatformBreakdown[] = []
  for (const pg of platformGroups.values()) {
    pg.totalEstimateEur = toEur(pg.totalEstimateUsd)
    pg.totalActualMtdEur = toEur(pg.totalActualMtdUsd)
    pg.totalEomEur = toEur(pg.totalEomUsd)
    pg.totalActualMtdUsd = Math.round(pg.totalActualMtdUsd * 100) / 100
    pg.totalEomUsd = Math.round(pg.totalEomUsd * 100) / 100
    pg.services.sort((a, b) => b.estimateUsd - a.estimateUsd)
    result.push(pg)
  }

  result.sort((a, b) => b.totalEstimateUsd - a.totalEstimateUsd)

  const grandTotalEstimate = result.reduce((s, p) => s + p.totalEstimateUsd, 0)
  const grandTotalMtd = result.reduce((s, p) => s + p.totalActualMtdUsd, 0)
  const grandTotalEom = result.reduce((s, p) => s + p.totalEomUsd, 0)

  return {
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
    platforms: result,
  }
})
