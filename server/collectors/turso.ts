import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Turso collector — fetches database usage via API.
 * Free tier: 500M rows read/mo, 10M rows written/mo, 5GB storage.
 * API: https://docs.turso.tech/api-reference
 */
export function createTursoCollector(apiKey: string, platformId: number): BaseCollector {
  return {
    platformSlug: 'turso',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        // Get organizations
        const orgResponse = await fetch('https://api.turso.tech/v1/organizations', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })

        if (!orgResponse.ok) {
          errors.push(`Turso API error ${orgResponse.status}: ${await orgResponse.text()}`)
          return { records, errors }
        }

        const orgs = await orgResponse.json() as Array<{ slug: string; name: string }>
        const orgSlug = orgs[0]?.slug
        if (!orgSlug) {
          errors.push('Turso: no organizations found')
          return { records, errors }
        }

        // Get org-level usage
        const usageResponse = await fetch(`https://api.turso.tech/v1/organizations/${orgSlug}/usage`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })

        let usageData: Record<string, unknown> = {}
        if (usageResponse.ok) {
          usageData = await usageResponse.json()
        } else {
          errors.push(`Turso usage API error ${usageResponse.status}: usage data not collected`)
        }

        // Get databases
        const dbResponse = await fetch(`https://api.turso.tech/v1/organizations/${orgSlug}/databases`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })

        let dbCount = 0
        if (dbResponse.ok) {
          const dbData = await dbResponse.json() as { databases: Array<{ name: string }> }
          dbCount = dbData.databases?.length ?? 0
        } else {
          errors.push(`Turso databases API error ${dbResponse.status}: database count not collected`)
        }

        // Extract normalized usage metrics from Turso API response
        const orgUsage = (usageData as { organization?: { usage?: { rows_read?: number; rows_written?: number; storage_bytes?: number } } })
          ?.organization?.usage
        const rowsRead = orgUsage?.rows_read ?? 0
        const rowsWritten = orgUsage?.rows_written ?? 0
        const storageBytes = orgUsage?.storage_bytes ?? 0

        // Fetch invoices to get actual billed amount for this period
        let invoiceAmount = '0.00'
        let invoiceNotes = 'free tier'
        try {
          const invoiceRes = await fetch(`https://api.turso.tech/v1/organizations/${orgSlug}/invoices`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(15_000),
          })
          if (invoiceRes.ok) {
            const invoiceData = await invoiceRes.json() as {
              invoices?: Array<{
                invoice_number: string
                amount_due: string
                due_date: string
                paid_at?: string
                status: string
              }>
            }
            // Find invoice for current period month
            const periodMonth = periodStart.toISOString().slice(0, 7) // YYYY-MM
            const matchingInvoice = invoiceData.invoices?.find((inv) => {
              const invDate = inv.due_date || inv.paid_at || ''
              return invDate.startsWith(periodMonth) && (inv.status === 'paid' || inv.status === 'issued')
            })
            if (matchingInvoice) {
              const parsed = parseFloat(matchingInvoice.amount_due)
              invoiceAmount = Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : '0.00'
              invoiceNotes = `invoice ${matchingInvoice.invoice_number}, ${matchingInvoice.status}`
            }
          } else {
            errors.push(`Turso invoices API error ${invoiceRes.status}`)
          }
        } catch (err) {
          errors.push(`Turso invoice fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        }

        records.push({
          platformId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: invoiceAmount,
          currency: 'USD',
          costType: 'usage',
          collectionMethod: 'api',
          rawData: {
            org: orgSlug,
            databases: dbCount,
            rowsRead,
            rowsWritten,
            storageBytes,
            usage: usageData,
          },
          notes: `Turso: ${dbCount} database(s) in "${orgSlug}", ${invoiceNotes}`,
        })

        return { records, errors, accountIdentifier: orgSlug }
      }
      catch (err) {
        errors.push(`Turso collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
