import { and, eq, gte, lt, desc } from 'drizzle-orm'
import { verifications, platforms } from '../../db/schema'
import { parseId, parsePagination } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const q = getQuery(event)
  const platformId = q.platformId ? parseId(q.platformId as string) : undefined
  const { limit } = parsePagination(q as Record<string, unknown>, 200)

  const conditions = [eq(verifications.isActive, true)]
  if (platformId) conditions.push(eq(verifications.platformId, platformId))
  if (q.year && q.month) {
    const yr = Number(q.year), mo = Number(q.month)
    if (Number.isFinite(yr) && Number.isFinite(mo)) {
      const start = new Date(yr, mo - 1, 1)
      const end = new Date(yr, mo, 1)
      conditions.push(gte(verifications.periodStart, start), lt(verifications.periodStart, end))
    }
  }

  const rows = await db
    .select({
      id: verifications.id,
      platformId: verifications.platformId,
      platformSlug: platforms.slug,
      platformName: platforms.name,
      periodStart: verifications.periodStart,
      periodEnd: verifications.periodEnd,
      reportedUsd: verifications.reportedUsd,
      verifiedUsd: verifications.verifiedUsd,
      delta: verifications.delta,
      deltaPct: verifications.deltaPct,
      method: verifications.method,
      notes: verifications.notes,
      verifiedAt: verifications.verifiedAt,
      verifiedBy: verifications.verifiedBy,
    })
    .from(verifications)
    .innerJoin(platforms, eq(verifications.platformId, platforms.id))
    .where(and(...conditions))
    .orderBy(desc(verifications.verifiedAt))
    .limit(limit)

  return rows
})
