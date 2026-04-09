import { eq } from 'drizzle-orm'
import { budgets } from '../../db/schema'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = parseId(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { name, monthlyLimit, alertAt50, alertAt75, alertAt90, alertAt100, isActive } = body as {
    name?: string
    monthlyLimit?: number
    alertAt50?: boolean
    alertAt75?: boolean
    alertAt90?: boolean
    alertAt100?: boolean
    isActive?: boolean
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) throw createError({ statusCode: 400, message: 'name must be a non-empty string' })
    if (name.length > 200) throw createError({ statusCode: 400, message: 'name too long (max 200)' })
    updates.name = name.trim()
  }
  if (monthlyLimit !== undefined) {
    if (typeof monthlyLimit !== 'number' || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) throw createError({ statusCode: 400, message: 'monthlyLimit must be a positive number' })
    if (monthlyLimit > 1_000_000) throw createError({ statusCode: 400, message: 'monthlyLimit too large (max 1,000,000)' })
    updates.monthlyLimit = String(monthlyLimit)
  }
  if (alertAt50 !== undefined) updates.alertAt50 = alertAt50
  if (alertAt75 !== undefined) updates.alertAt75 = alertAt75
  if (alertAt90 !== undefined) updates.alertAt90 = alertAt90
  if (alertAt100 !== undefined) updates.alertAt100 = alertAt100
  if (isActive !== undefined) updates.isActive = isActive

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const db = useDB()
  const [updated] = await db.update(budgets).set(updates).where(eq(budgets.id, id)).returning()

  if (!updated) {
    throw createError({ statusCode: 404, message: 'Budget not found' })
  }

  return { budget: updated }
})
