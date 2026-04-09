import { budgets } from '../../db/schema'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody(event)
  const { name, monthlyLimit, platformId, projectId, alertAt50, alertAt75, alertAt90, alertAt100 } = body as {
    name: string
    monthlyLimit: number
    platformId?: number | null
    projectId?: number | null
    alertAt50?: boolean
    alertAt75?: boolean
    alertAt90?: boolean
    alertAt100?: boolean
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw createError({ statusCode: 400, message: 'name is required' })
  }
  if (name.length > 200) {
    throw createError({ statusCode: 400, message: 'name too long (max 200)' })
  }
  if (!monthlyLimit || typeof monthlyLimit !== 'number' || monthlyLimit <= 0) {
    throw createError({ statusCode: 400, message: 'monthlyLimit must be a positive number' })
  }
  if (monthlyLimit > 1_000_000) {
    throw createError({ statusCode: 400, message: 'monthlyLimit too large (max 1,000,000)' })
  }
  if (platformId && projectId) {
    throw createError({ statusCode: 400, message: 'Budget cannot be scoped to both a platform and a project' })
  }

  const db = useDB()
  const [created] = await db.insert(budgets).values({
    name: name.trim(),
    monthlyLimit: String(monthlyLimit),
    platformId: platformId || null,
    projectId: projectId || null,
    alertAt50: alertAt50 ?? true,
    alertAt75: alertAt75 ?? true,
    alertAt90: alertAt90 ?? true,
    alertAt100: alertAt100 ?? true,
  }).returning()

  return { budget: created }
})
