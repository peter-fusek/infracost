/**
 * Ingests Turso invoices into our invoices table.
 * Turso is the only platform with a clean invoice API — see #88.
 *
 * For each invoice: upsert on (platformId, invoiceNumber) with PDF URL,
 * amount, period dates. Skips invoices already stored.
 */
import { and, eq } from 'drizzle-orm'
import { invoices, platforms } from '../db/schema'

interface TursoInvoice {
  invoice_number: string
  amount_due: string
  due_date: string
  paid_at?: string
  status: string // 'paid' | 'issued' | 'upcoming' | ...
  invoice_pdf?: string
}

interface TursoInvoiceResponse {
  invoices?: TursoInvoice[]
}

export async function ingestTursoInvoices(
  db: ReturnType<typeof import('../utils/db').useDB>,
  apiKey: string,
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const errors: string[] = []
  let inserted = 0
  let skipped = 0

  const [tursoPlatform] = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.slug, 'turso'))
    .limit(1)

  if (!tursoPlatform) {
    return { inserted: 0, skipped: 0, errors: ['Turso platform row not found'] }
  }

  // Get first org
  const orgRes = await fetch('https://api.turso.tech/v1/organizations', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!orgRes.ok) {
    errors.push(`Turso orgs API ${orgRes.status}: ${await orgRes.text().catch(() => '')}`)
    return { inserted: 0, skipped: 0, errors }
  }
  const orgs = await orgRes.json() as Array<{ slug: string }>
  const orgSlug = orgs[0]?.slug
  if (!orgSlug) {
    errors.push('Turso: no organizations found')
    return { inserted: 0, skipped: 0, errors }
  }

  // Get all issued/paid invoices
  const invRes = await fetch(`https://api.turso.tech/v1/organizations/${orgSlug}/invoices?type=issued`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!invRes.ok) {
    errors.push(`Turso invoices API ${invRes.status}: ${await invRes.text().catch(() => '')}`)
    return { inserted: 0, skipped: 0, errors }
  }
  const json = await invRes.json() as TursoInvoiceResponse
  const list = json.invoices ?? []

  for (const inv of list) {
    if (!inv.invoice_number) continue

    // Dedup on (platformId, invoiceNumber)
    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.platformId, tursoPlatform.id), eq(invoices.invoiceNumber, inv.invoice_number)))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    // Derive period from due_date (Turso bills monthly in arrears)
    const dueDate = inv.due_date ? new Date(inv.due_date) : null
    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      errors.push(`Invoice ${inv.invoice_number}: invalid due_date`)
      continue
    }

    // The billed period is the month BEFORE the due_date
    const billedMonth = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() - 1, 1))
    const billedEnd = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 0, 23, 59, 59))
    const amount = parseFloat(inv.amount_due || '0')

    await db.insert(invoices).values({
      platformId: tursoPlatform.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: dueDate,
      periodStart: billedMonth,
      periodEnd: billedEnd,
      totalAmount: amount.toFixed(2),
      currency: 'USD',
      sourceSystem: 'platform_api',
      pdfUrl: inv.invoice_pdf ?? null,
      rawData: { status: inv.status, paid_at: inv.paid_at ?? null, org: orgSlug },
    })
    inserted++
  }

  return { inserted, skipped, errors }
}
