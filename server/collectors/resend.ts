import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Resend collector — checks email sending usage via API.
 * Free tier: 3000 emails/mo, 100/day. No billing API — check usage via domains endpoint.
 * API docs: https://resend.com/docs/api-reference
 */
const RESEND_PRO_MONTHLY = '20.00'

export function createResendCollector(apiKey: string, platformId: number, serviceId?: number): BaseCollector {
  return {
    platformSlug: 'resend',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        const authHeaders = { Authorization: `Bearer ${apiKey}` }

        // Verify API key by listing domains
        const response = await fetch('https://api.resend.com/domains', {
          headers: authHeaders,
          signal: AbortSignal.timeout(15_000),
        })

        if (!response.ok) {
          errors.push(`Resend API error ${response.status}: ${await response.text()}`)
          return { records, errors }
        }

        const domains = await response.json() as { data: Array<{ id: string; name: string; status: string }> }

        // Count emails sent this month + today via GET /emails (paginated, capped)
        // Max 10 pages to prevent API overdrawing (covers up to ~1000 emails)
        const MAX_EMAIL_PAGES = 10
        let emailsThisMonth = 0
        let emailsToday = 0
        const monthStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        try {
          let hasMore = true
          let lastId: string | undefined
          let pages = 0
          while (hasMore && pages < MAX_EMAIL_PAGES) {
            pages++
            const url = new URL('https://api.resend.com/emails')
            if (lastId) url.searchParams.set('last_id', lastId)
            const emailsRes = await fetch(url.toString(), {
              headers: authHeaders,
              signal: AbortSignal.timeout(15_000),
            })
            if (!emailsRes.ok) {
              errors.push(`Resend emails API error ${emailsRes.status}`)
              break
            }
            const emailsData = await emailsRes.json() as {
              data: Array<{ id: string; created_at: string }>
            }
            if (!emailsData.data?.length) break
            for (const email of emailsData.data) {
              const created = new Date(email.created_at)
              if (created >= monthStart) {
                emailsThisMonth++
                if (created >= todayStart) emailsToday++
              } else {
                hasMore = false
                break
              }
            }
            if (hasMore) {
              lastId = emailsData.data[emailsData.data.length - 1]?.id
            }
          }
          if (pages >= MAX_EMAIL_PAGES && hasMore) {
            errors.push(`Resend: email count capped at ${MAX_EMAIL_PAGES} pages (${emailsThisMonth}+ emails)`)
          }
        } catch (err) {
          errors.push(`Resend: email count failed: ${err instanceof Error ? err.message : String(err)}`)
        }

        // Resend doesn't expose a billing API, so we report the known subscription amount
        records.push({
          platformId,
          serviceId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: RESEND_PRO_MONTHLY,
          currency: 'USD',
          costType: 'subscription',
          collectionMethod: 'api',
          rawData: {
            domains: domains.data?.length ?? 0,
            emailsThisMonth,
            emailsToday,
            plan: 'pro',
          },
          notes: `Resend Pro: ${domains.data?.length ?? 0} domain(s), ${emailsThisMonth} emails this month`,
        })
      }
      catch (err) {
        errors.push(`Resend collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
