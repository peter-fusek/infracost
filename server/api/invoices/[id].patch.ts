/**
 * Link an invoice to cost_records. Enforces same-platform constraint —
 * you can't attribute an Anthropic invoice to Render cost records.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { costRecords, invoices } from '../../db/schema'
import { parseId } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDB()
  const id = parseId(getRouterParam(event, 'id'))
  const body = await readBody<{ costRecordIds: number[] }>(event)

  if (!Array.isArray(body.costRecordIds) || body.costRecordIds.length === 0) {
    throw createError({ statusCode: 400, message: 'costRecordIds must be a non-empty array' })
  }
  const recordIds = body.costRecordIds.map(String).map(parseId)

  const [inv] = await db
    .select({ id: invoices.id, platformId: invoices.platformId })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1)
  if (!inv) throw createError({ statusCode: 404, message: 'Invoice not found' })

  // Confirm all costRecords belong to the same platform — prevents cross-contamination
  const recs = await db
    .select({ id: costRecords.id, platformId: costRecords.platformId })
    .from(costRecords)
    .where(inArray(costRecords.id, recordIds))
  const foreign = recs.filter(r => r.platformId !== inv.platformId)
  if (foreign.length > 0) {
    throw createError({
      statusCode: 400,
      message: `Refusing to link: ${foreign.length} cost record(s) belong to a different platform than this invoice`,
    })
  }

  await db
    .update(costRecords)
    .set({ invoiceId: inv.id })
    .where(and(inArray(costRecords.id, recordIds), eq(costRecords.platformId, inv.platformId)))

  return { invoiceId: inv.id, linked: recs.length }
})
