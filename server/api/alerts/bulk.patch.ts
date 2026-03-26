import { inArray } from 'drizzle-orm'
import { alerts } from '../../db/schema'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody(event)
  const db = useDB()

  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, message: 'ids array is required' })
  }
  if (ids.length > 200) {
    throw createError({ statusCode: 400, message: 'Maximum 200 alerts per bulk update' })
  }

  const parsedIds = ids.map((id: unknown) => parseId(id))

  const updates: Record<string, unknown> = {}
  if (body.status === 'acknowledged' || body.status === 'resolved') {
    updates.status = body.status
    if (body.status === 'resolved') updates.resolvedAt = new Date()
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'Valid status (acknowledged or resolved) is required' })
  }

  const updated = await db
    .update(alerts)
    .set(updates)
    .where(inArray(alerts.id, parsedIds))
    .returning({ id: alerts.id })

  return { updated: updated.length }
})
