import { eq } from 'drizzle-orm'
import { services } from '../../db/schema'
import { parseId } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = parseId(getRouterParam(event, 'id'))
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Request body is required' })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.project === 'string') {
    updates.project = body.project.trim() || null
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim()
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No valid fields to update (project, name)' })
  }

  const db = useDB()
  const [updated] = await db
    .update(services)
    .set(updates)
    .where(eq(services.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, message: `Service ${id} not found` })
  }

  return updated
})
