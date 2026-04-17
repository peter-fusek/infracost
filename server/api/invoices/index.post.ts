import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { invoices } from '../../db/schema'
import { parseAmount, parseId } from '../../utils/validation'

const MAX_PDF_BYTES = 7_000_000 // ~5MB decoded
const VALID_SOURCES = ['platform_api', 'email_parse', 'manual'] as const

interface InvoicePayload {
  platformId: number
  invoiceNumber?: string
  invoiceDate: string
  periodStart: string
  periodEnd?: string
  totalAmount: number
  currency?: string
  sourceSystem?: 'platform_api' | 'email_parse' | 'manual'
  pdfBase64?: string
  pdfUrl?: string
  rawData?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDB()
  const body = await readBody<InvoicePayload>(event)

  const platformId = parseId(String(body.platformId))
  const totalAmount = parseAmount(body.totalAmount)
  const currency = (body.currency ?? 'USD').toUpperCase()
  const sourceSystem = body.sourceSystem ?? 'manual'
  if (!VALID_SOURCES.includes(sourceSystem)) {
    throw createError({ statusCode: 400, message: `sourceSystem must be one of: ${VALID_SOURCES.join(', ')}` })
  }

  if (body.pdfBase64 && body.pdfBase64.length > MAX_PDF_BYTES) {
    throw createError({ statusCode: 400, message: `pdfBase64 exceeds ${MAX_PDF_BYTES} bytes (~5 MB)` })
  }

  const invoiceDate = new Date(body.invoiceDate)
  const periodStart = new Date(body.periodStart)
  const periodEnd = body.periodEnd
    ? new Date(body.periodEnd)
    : new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0, 23, 59, 59))

  if (Number.isNaN(invoiceDate.getTime()) || Number.isNaN(periodStart.getTime())) {
    throw createError({ statusCode: 400, message: 'invalid dates' })
  }

  let checksum: string | null = null
  if (body.pdfBase64) {
    checksum = createHash('sha256').update(body.pdfBase64).digest('hex')
    // Dedup on (platformId, checksum)
    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.platformId, platformId), eq(invoices.checksum, checksum), eq(invoices.isActive, true)))
      .limit(1)
    if (existing.length > 0) {
      return { duplicate: true, id: existing[0]!.id }
    }
  }

  const [row] = await db.insert(invoices).values({
    platformId,
    invoiceNumber: body.invoiceNumber ?? null,
    invoiceDate,
    periodStart,
    periodEnd,
    totalAmount: totalAmount.toFixed(2),
    currency,
    sourceSystem,
    checksum,
    pdfData: body.pdfBase64 ?? null,
    pdfUrl: body.pdfUrl ?? null,
    rawData: body.rawData ?? null,
  }).returning({ id: invoices.id })

  return { created: true, id: row!.id, checksum }
})
