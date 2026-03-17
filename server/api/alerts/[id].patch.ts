import { eq } from 'drizzle-orm'
import { alerts } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = parseId(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDB()

  const updates: Record<string, unknown> = {}
  if (body.status === 'acknowledged' || body.status === 'resolved') {
    updates.status = body.status
    if (body.status === 'resolved') updates.resolvedAt = new Date()
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }

  const [updated] = await db
    .update(alerts)
    .set(updates)
    .where(eq(alerts.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, message: 'Alert not found' })
  }

  return updated
})
