import { and, eq, isNull } from 'drizzle-orm'
import { platforms, services } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'slug is required' })

  const db = useDB()

  const [platform] = await db
    .select()
    .from(platforms)
    .where(and(eq(platforms.slug, slug), eq(platforms.isActive, true)))
    .limit(1)

  if (!platform) {
    throw createError({ statusCode: 404, message: `Platform '${slug}' not found` })
  }

  const platformServices = await db
    .select()
    .from(services)
    .where(and(eq(services.platformId, platform.id), eq(services.isActive, true)))

  return { ...platform, services: platformServices }
})
