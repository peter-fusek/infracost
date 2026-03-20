import { and, eq, gte, lte, sql, isNull, desc } from 'drizzle-orm'
import { costRecords, platforms, services, budgets } from '../db/schema'
import { getMonthProgress, getCurrentMonthRange } from '../collectors/base'
import { EUR_USD_RATE, toEur } from '../utils/currency'

export interface ServiceCost {
  serviceId: number | null
  serviceName: string | null
  project: string | null
  serviceType: string | null
  amount: number
  amountEur: number
  costType: string
  collectionMethod: string
  recordCount: number
  notes: string | null
}

export interface PlatformCost {
  platformId: number
  platformSlug: string
  platformName: string
  platformType: string
  mtd: number
  mtdEur: number
  eomEstimate: number
  eomEstimateEur: number
  recordCount: number
  services: ServiceCost[]
}

export interface MTDSummary {
  totalMTD: number
  totalMTDEur: number
  eomEstimate: number
  eomEstimateEur: number
  budgetLimit: number
  budgetLimitEur: number
  budgetUsedPct: number
  monthProgress: number
  daysInMonth: number
  currentDay: number
  eurUsdRate: number
  byPlatform: PlatformCost[]
}

/** Get month-to-date spend with EOM projection, EUR values, and per-service detail */
export async function getMTDSummary(db: ReturnType<typeof import('../utils/db').useDB>): Promise<MTDSummary> {
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  // Get all cost records for current month with service detail
  const records = await db
    .select({
      platformId: costRecords.platformId,
      platformSlug: platforms.slug,
      platformName: platforms.name,
      platformType: platforms.type,
      serviceId: costRecords.serviceId,
      serviceName: services.name,
      serviceProject: services.project,
      serviceType: services.serviceType,
      amount: costRecords.amount,
      costType: costRecords.costType,
      collectionMethod: costRecords.collectionMethod,
      notes: costRecords.notes,
    })
    .from(costRecords)
    .innerJoin(platforms, eq(costRecords.platformId, platforms.id))
    .leftJoin(services, eq(costRecords.serviceId, services.id))
    .where(
      and(
        gte(costRecords.periodStart, start),
        lte(costRecords.periodEnd, end),
        eq(costRecords.isActive, true),
        isNull(costRecords.deletedAt),
      ),
    )

  // Fixed costs (subscription, one_time) don't get projected — they're the full month amount
  const isFixedCost = (costType: string) => costType === 'subscription' || costType === 'one_time'

  // Group by platform, then by service
  const platformMap = new Map<number, PlatformCost & { fixedMtd: number; usageMtd: number }>()
  const serviceMap = new Map<string, ServiceCost>() // key: platformId-serviceId

  for (const r of records) {
    const amt = parseFloat(r.amount || '0')
    const fixed = isFixedCost(r.costType)

    // Ensure platform entry
    if (!platformMap.has(r.platformId)) {
      platformMap.set(r.platformId, {
        platformId: r.platformId,
        platformSlug: r.platformSlug,
        platformName: r.platformName,
        platformType: r.platformType,
        mtd: 0,
        mtdEur: 0,
        eomEstimate: 0,
        eomEstimateEur: 0,
        recordCount: 0,
        services: [],
        fixedMtd: 0,
        usageMtd: 0,
      })
    }
    const platform = platformMap.get(r.platformId)!
    platform.mtd += amt
    platform.recordCount += 1
    if (fixed) platform.fixedMtd += amt
    else platform.usageMtd += amt

    // Aggregate by service within platform
    const svcKey = `${r.platformId}-${r.serviceId ?? 'none'}`
    if (!serviceMap.has(svcKey)) {
      serviceMap.set(svcKey, {
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        project: r.serviceProject ?? null,
        serviceType: r.serviceType ?? null,
        amount: 0,
        amountEur: 0,
        costType: r.costType,
        collectionMethod: r.collectionMethod,
        recordCount: 0,
        notes: r.notes,
      })
    }
    const svc = serviceMap.get(svcKey)!
    svc.amount += amt
    svc.recordCount += 1
  }

  // Attach services to platforms and compute EUR + EOM
  // EOM = fixed costs as-is + usage costs projected
  const byPlatform: PlatformCost[] = []
  for (const [platformId, platform] of platformMap) {
    platform.mtdEur = toEur(platform.mtd)
    const usageProjected = progress > 0 ? platform.usageMtd / progress : 0
    platform.eomEstimate = platform.fixedMtd + usageProjected
    platform.eomEstimateEur = toEur(platform.eomEstimate)

    // Collect services for this platform
    for (const [key, svc] of serviceMap) {
      if (key.startsWith(`${platformId}-`)) {
        svc.amountEur = toEur(svc.amount)
        platform.services.push(svc)
      }
    }
    // Sort services by amount descending
    platform.services.sort((a, b) => b.amount - a.amount)
    byPlatform.push(platform)
  }

  // Sort platforms by MTD descending
  byPlatform.sort((a, b) => b.mtd - a.mtd)

  const totalMTD = byPlatform.reduce((sum, p) => sum + p.mtd, 0)
  const totalFixed = byPlatform.reduce((sum, p) => sum + (p as any).fixedMtd, 0)
  const totalUsage = byPlatform.reduce((sum, p) => sum + (p as any).usageMtd, 0)
  const eomEstimate = totalFixed + (progress > 0 ? totalUsage / progress : 0)

  // Get budget limit
  const budgetRows = await db
    .select({ monthlyLimit: budgets.monthlyLimit })
    .from(budgets)
    .where(and(eq(budgets.isActive, true), isNull(budgets.platformId)))
    .limit(1)
  const budgetLimit = budgetRows.length > 0 ? parseFloat(budgetRows[0].monthlyLimit) : 500

  return {
    totalMTD: Math.round(totalMTD * 100) / 100,
    totalMTDEur: toEur(totalMTD),
    eomEstimate: Math.round(eomEstimate * 100) / 100,
    eomEstimateEur: toEur(eomEstimate),
    budgetLimit,
    budgetLimitEur: toEur(budgetLimit),
    budgetUsedPct: budgetLimit > 0 ? Math.round((eomEstimate / budgetLimit) * 100) : 0,
    monthProgress: Math.round(progress * 100),
    daysInMonth,
    currentDay: now.getDate(),
    eurUsdRate: EUR_USD_RATE,
    byPlatform,
  }
}

/** Get cost history for a date range, optionally filtered by platform */
export async function getCostHistory(
  db: ReturnType<typeof import('../utils/db').useDB>,
  startDate: Date,
  endDate: Date,
  platformSlug?: string,
  limit = 200,
  offset = 0,
) {
  const conditions = [
    gte(costRecords.periodStart, startDate),
    lte(costRecords.periodEnd, endDate),
    eq(costRecords.isActive, true),
    isNull(costRecords.deletedAt),
  ]

  if (platformSlug) {
    conditions.push(eq(platforms.slug, platformSlug))
  }

  const rows = await db
    .select({
      id: costRecords.id,
      platformSlug: platforms.slug,
      platformName: platforms.name,
      serviceName: services.name,
      recordDate: costRecords.recordDate,
      amount: costRecords.amount,
      currency: costRecords.currency,
      costType: costRecords.costType,
      collectionMethod: costRecords.collectionMethod,
      notes: costRecords.notes,
    })
    .from(costRecords)
    .innerJoin(platforms, eq(costRecords.platformId, platforms.id))
    .leftJoin(services, eq(costRecords.serviceId, services.id))
    .where(and(...conditions))
    .orderBy(costRecords.recordDate)
    .limit(limit)
    .offset(offset)

  return rows
}
