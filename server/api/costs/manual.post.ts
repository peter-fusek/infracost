import { eq } from 'drizzle-orm'
import { costRecords, platforms, services } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const body = await readBody(event)

  // Validate required fields
  if (!body.platformSlug || !body.amount) {
    throw createError({ statusCode: 400, message: 'platformSlug and amount are required' })
  }

  // Look up platform
  const [platform] = await db
    .select()
    .from(platforms)
    .where(eq(platforms.slug, body.platformSlug))
    .limit(1)

  if (!platform) {
    throw createError({ statusCode: 404, message: `Platform '${body.platformSlug}' not found` })
  }

  // Optionally look up service
  let serviceId: number | undefined
  if (body.serviceName) {
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.name, body.serviceName))
      .limit(1)
    serviceId = service?.id
  }

  const recordDate = body.date ? new Date(body.date) : new Date()
  const periodStart = body.periodStart ? new Date(body.periodStart) : new Date(recordDate.getFullYear(), recordDate.getMonth(), 1)
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date(recordDate.getFullYear(), recordDate.getMonth() + 1, 0)

  const [record] = await db.insert(costRecords).values({
    platformId: platform.id,
    serviceId,
    recordDate,
    periodStart,
    periodEnd,
    amount: String(body.amount),
    currency: body.currency || 'USD',
    costType: body.costType || 'usage',
    collectionMethod: 'manual',
    notes: body.notes,
    rawData: body.rawData,
  }).returning()

  return record
})
