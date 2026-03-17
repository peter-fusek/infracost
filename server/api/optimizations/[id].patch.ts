import { eq } from 'drizzle-orm'
import { optimizations } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = parseId(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDB()

  const validStatuses = ['suggested', 'approved', 'rejected', 'implemented', 'dismissed']
  const updates: Record<string, unknown> = {}
  if (body.status) {
    if (!validStatuses.includes(body.status)) {
      throw createError({ statusCode: 400, message: `status must be one of: ${validStatuses.join(', ')}` })
    }
    updates.status = body.status
    if (body.status === 'approved') updates.approvedAt = new Date()
    if (body.status === 'implemented') updates.implementedAt = new Date()
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }

  const [updated] = await db
    .update(optimizations)
    .set(updates)
    .where(eq(optimizations.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, message: 'Optimization not found' })
  }

  return updated
})
