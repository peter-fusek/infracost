import { costRecords, platforms } from '../../db/schema'

interface ImportRow {
  platformSlug: string
  amount: number
  costType?: string
  date?: string
  notes?: string
}

export default defineEventHandler(async (event) => {
  const db = useDB()
  const body = await readBody<{ rows: ImportRow[] }>(event)

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw createError({ statusCode: 400, message: 'rows array is required and must not be empty' })
  }

  if (body.rows.length > 200) {
    throw createError({ statusCode: 400, message: 'Maximum 200 rows per import' })
  }

  // Pre-fetch all platforms for slug lookup
  const allPlatforms = await db.select().from(platforms)
  const platformMap = new Map(allPlatforms.map(p => [p.slug, p]))

  const results: { inserted: number; errors: string[] } = { inserted: 0, errors: [] }
  const toInsert: (typeof costRecords.$inferInsert)[] = []

  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i]
    try {
      if (!row?.platformSlug || row.amount === undefined) {
        results.errors.push(`Row ${i + 1}: platformSlug and amount are required`)
        continue
      }

      const amt = parseAmount(row.amount)
      if (row.costType) validateCostType(row.costType)

      const platform = platformMap.get(row.platformSlug)
      if (!platform) {
        results.errors.push(`Row ${i + 1}: platform '${row.platformSlug}' not found`)
        continue
      }

      const recordDate = row!.date ? new Date(row!.date) : new Date()
      const periodStart = new Date(recordDate.getFullYear(), recordDate.getMonth(), 1)
      const periodEnd = new Date(recordDate.getFullYear(), recordDate.getMonth() + 1, 0)

      toInsert.push({
        platformId: platform.id,
        recordDate,
        periodStart,
        periodEnd,
        amount: String(amt),
        currency: 'USD',
        costType: (row!.costType || 'usage') as typeof costRecords.$inferInsert.costType,
        collectionMethod: 'csv_import' as const,
        notes: typeof row!.notes === 'string' ? row!.notes.slice(0, 2000) : undefined,
      })
    }
    catch (err: any) {
      results.errors.push(`Row ${i + 1}: ${err.message || 'Unknown error'}`)
    }
  }

  if (toInsert.length > 0) {
    try {
      await db.insert(costRecords).values(toInsert)
      results.inserted = toInsert.length
    }
    catch (err: any) {
      results.errors.push(`Bulk insert failed: ${err.message || 'Unknown error'}`)
    }
  }

  return results
})
