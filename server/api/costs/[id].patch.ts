import { eq } from 'drizzle-orm'
import { costRecords } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDB()

  const updates: Record<string, unknown> = {}
  if (body.costType) updates.costType = body.costType
  if (body.amount !== undefined) updates.amount = String(body.amount)
  if (body.notes !== undefined) updates.notes = body.notes

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }

  const [updated] = await db
    .update(costRecords)
    .set(updates)
    .where(eq(costRecords.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, message: 'Cost record not found' })
  }

  return updated
})
