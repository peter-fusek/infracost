import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { verifications, costRecords, platforms } from '../../db/schema'
import { parseId, parseAmount } from '../../utils/validation'

const VALID_METHODS = ['manual', 'browser', 'cli', 'api'] as const
const MAX_SCREENSHOT_BYTES = 280_000 // ~200 KB base64

interface VerificationPayload {
  platformId: number
  periodStart: string // ISO date string
  verifiedUsd: number
  method: 'manual' | 'browser' | 'cli' | 'api'
  notes?: {
    raw?: string
    screenshotBase64?: string
    url?: string
    extractedText?: string
  }
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDB()
  const body = await readBody<VerificationPayload>(event)

  const platformId = parseId(String(body.platformId))
  const verifiedUsd = parseAmount(body.verifiedUsd)

  if (!VALID_METHODS.includes(body.method)) {
    throw createError({ statusCode: 400, message: `method must be one of: ${VALID_METHODS.join(', ')}` })
  }

  const screenshot = body.notes?.screenshotBase64
  if (screenshot && screenshot.length > MAX_SCREENSHOT_BYTES) {
    throw createError({ statusCode: 400, message: `screenshotBase64 exceeds ${MAX_SCREENSHOT_BYTES} bytes (~200 KB)` })
  }

  // Confirm platform exists
  const plat = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, platformId)).limit(1)
  if (plat.length === 0) {
    throw createError({ statusCode: 404, message: 'Platform not found' })
  }

  // Normalize to month-start for consistent period alignment
  const startDate = new Date(body.periodStart)
  if (Number.isNaN(startDate.getTime())) {
    throw createError({ statusCode: 400, message: 'periodStart must be a valid ISO date' })
  }
  const periodStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
  const periodEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0, 23, 59, 59))

  // Compute what infracost thinks the MTD is for this platform+period
  const reportedRows = await db
    .select({ total: sql<string>`coalesce(sum(${costRecords.amount}), 0)` })
    .from(costRecords)
    .where(and(
      eq(costRecords.platformId, platformId),
      gte(costRecords.periodStart, periodStart),
      lte(costRecords.periodEnd, periodEnd),
      eq(costRecords.isActive, true),
      isNull(costRecords.deletedAt),
    ))
  const reportedUsd = parseFloat(reportedRows[0]?.total ?? '0')

  const delta = verifiedUsd - reportedUsd
  const deltaPct = reportedUsd > 0 ? (delta / reportedUsd) * 100 : null

  // Upsert on (platformId, periodStart, method). Manual, browser, cli, api
  // are each independent source evidence — we keep one row per method per month.
  // Check for existing first (drizzle onConflictDoUpdate needs named constraint).
  const existing = await db
    .select({ id: verifications.id })
    .from(verifications)
    .where(and(
      eq(verifications.platformId, platformId),
      eq(verifications.periodStart, periodStart),
      eq(verifications.method, body.method),
      eq(verifications.isActive, true),
    ))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(verifications)
      .set({
        verifiedUsd: verifiedUsd.toFixed(4),
        reportedUsd: reportedUsd.toFixed(4),
        delta: delta.toFixed(4),
        deltaPct: deltaPct !== null ? deltaPct.toFixed(4) : null,
        notes: body.notes ?? null,
        verifiedAt: new Date(),
      })
      .where(eq(verifications.id, existing[0]!.id))
    return { updated: true, id: existing[0]!.id, reportedUsd, verifiedUsd, delta, deltaPct }
  }

  const [row] = await db
    .insert(verifications)
    .values({
      platformId,
      periodStart,
      periodEnd,
      reportedUsd: reportedUsd.toFixed(4),
      verifiedUsd: verifiedUsd.toFixed(4),
      delta: delta.toFixed(4),
      deltaPct: deltaPct !== null ? deltaPct.toFixed(4) : null,
      method: body.method,
      notes: body.notes ?? null,
      verifiedBy: 'peter',
    })
    .returning()

  return { created: true, id: row!.id, reportedUsd, verifiedUsd, delta, deltaPct }
})
