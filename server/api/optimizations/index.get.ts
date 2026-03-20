import { and, eq, isNull, desc } from 'drizzle-orm'
import { optimizations, platforms, services } from '../../db/schema'
import { EUR_USD_RATE, toEur } from '../../utils/currency'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDB()
  const { limit, offset } = parsePagination(query as Record<string, unknown>)

  const rows = await db
    .select({
      id: optimizations.id,
      title: optimizations.title,
      description: optimizations.description,
      platformName: platforms.name,
      platformSlug: platforms.slug,
      serviceName: services.name,
      estimatedSavings: optimizations.estimatedSavings,
      effort: optimizations.effort,
      status: optimizations.status,
      suggestedBy: optimizations.suggestedBy,
      createdAt: optimizations.createdAt,
      implementedAt: optimizations.implementedAt,
    })
    .from(optimizations)
    .leftJoin(platforms, eq(optimizations.platformId, platforms.id))
    .leftJoin(services, eq(optimizations.serviceId, services.id))
    .where(and(eq(optimizations.isActive, true), isNull(optimizations.deletedAt)))
    .orderBy(desc(optimizations.estimatedSavings))
    .limit(limit)
    .offset(offset)

  return rows.map(r => ({
    ...r,
    estimatedSavingsUsd: parseFloat(r.estimatedSavings || '0'),
    estimatedSavingsEur: toEur(parseFloat(r.estimatedSavings || '0')),
    eurUsdRate: EUR_USD_RATE,
  }))
})
