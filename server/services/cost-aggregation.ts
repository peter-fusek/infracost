import { and, eq, gte, lte, sql, isNull } from 'drizzle-orm'
import { costRecords, platforms, services } from '../db/schema'
import { getMonthProgress, getCurrentMonthRange } from '../collectors/base'

export interface MTDSummary {
  totalMTD: number
  eomEstimate: number
  monthProgress: number
  daysInMonth: number
  currentDay: number
  byPlatform: PlatformCost[]
}

export interface PlatformCost {
  platformId: number
  platformSlug: string
  platformName: string
  mtd: number
  eomEstimate: number
  recordCount: number
}

/** Get month-to-date spend with EOM projection */
export async function getMTDSummary(db: ReturnType<typeof import('../utils/db').useDB>): Promise<MTDSummary> {
  const { start, end } = getCurrentMonthRange()
  const progress = getMonthProgress()
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  // Get MTD totals grouped by platform
  const results = await db
    .select({
      platformId: costRecords.platformId,
      platformSlug: platforms.slug,
      platformName: platforms.name,
      total: sql<string>`sum(${costRecords.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(costRecords)
    .innerJoin(platforms, eq(costRecords.platformId, platforms.id))
    .where(
      and(
        gte(costRecords.periodStart, start),
        lte(costRecords.periodEnd, end),
        eq(costRecords.isActive, true),
        isNull(costRecords.deletedAt),
      ),
    )
    .groupBy(costRecords.platformId, platforms.slug, platforms.name)

  const byPlatform: PlatformCost[] = results.map(r => ({
    platformId: r.platformId,
    platformSlug: r.platformSlug,
    platformName: r.platformName,
    mtd: parseFloat(r.total || '0'),
    eomEstimate: progress > 0 ? parseFloat(r.total || '0') / progress : 0,
    recordCount: r.count,
  }))

  const totalMTD = byPlatform.reduce((sum, p) => sum + p.mtd, 0)

  return {
    totalMTD,
    eomEstimate: progress > 0 ? totalMTD / progress : 0,
    monthProgress: Math.round(progress * 100),
    daysInMonth,
    currentDay: now.getDate(),
    byPlatform,
  }
}

/** Get cost history for a date range, optionally filtered by platform */
export async function getCostHistory(
  db: ReturnType<typeof import('../utils/db').useDB>,
  startDate: Date,
  endDate: Date,
  platformSlug?: string,
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

  return db
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
}
