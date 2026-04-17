import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { invoices, platforms } from '../../db/schema'
import { parseId, parsePagination } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const q = getQuery(event)
  const platformId = q.platformId ? parseId(q.platformId as string) : undefined
  const { limit, offset } = parsePagination(q as Record<string, unknown>, 100)

  const conditions = [eq(invoices.isActive, true)]
  if (platformId) conditions.push(eq(invoices.platformId, platformId))
  if (q.year && q.month) {
    const yr = Number(q.year), mo = Number(q.month)
    if (Number.isFinite(yr) && Number.isFinite(mo)) {
      conditions.push(
        gte(invoices.periodStart, new Date(yr, mo - 1, 1)),
        lt(invoices.periodStart, new Date(yr, mo, 1)),
      )
    }
  }

  const rows = await db
    .select({
      id: invoices.id,
      platformId: invoices.platformId,
      platformSlug: platforms.slug,
      platformName: platforms.name,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.invoiceDate,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      totalAmount: invoices.totalAmount,
      currency: invoices.currency,
      sourceSystem: invoices.sourceSystem,
      checksum: invoices.checksum,
      hasPdf: sql<boolean>`(${invoices.pdfData} is not null)`.as('has_pdf'),
      pdfUrl: invoices.pdfUrl,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(platforms, eq(invoices.platformId, platforms.id))
    .where(and(...conditions))
    .orderBy(desc(invoices.invoiceDate))
    .limit(limit)
    .offset(offset)

  return rows
})
