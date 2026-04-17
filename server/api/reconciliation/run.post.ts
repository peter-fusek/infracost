import { reconcileAll, persistReconciliationRun } from '../../services/reconciliation'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDB()
  const config = useRuntimeConfig()
  const body = await readBody(event).catch(() => ({}))
  const now = new Date()
  const year = body?.year ? Number(body.year) : now.getUTCFullYear()
  const month = body?.month ? Number(body.month) : now.getUTCMonth() + 1

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw createError({ statusCode: 400, message: 'invalid year/month' })
  }

  const results = await reconcileAll(db, year, month)
  const { saved, mismatches } = await persistReconciliationRun(
    db,
    results,
    config as unknown as Record<string, string>,
  )

  return { year, month, saved, mismatches, results }
})
