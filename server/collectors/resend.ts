import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Resend collector — checks email sending usage via API.
 * Free tier: 3000 emails/mo, 100/day. No billing API — check usage via domains endpoint.
 * API docs: https://resend.com/docs/api-reference
 */
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

        // Count emails sent this month via GET /emails (paginated)
        let emailsThisMonth = 0
        const monthStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
        try {
          // Resend GET /emails doesn't support date filters — paginate and count
          // Limited to recent emails; stop when we hit emails before this month
          let hasMore = true
          let lastId: string | undefined
          while (hasMore) {
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
            if (!emailsData.data?.length) {
              hasMore = false
              break
            }
            for (const email of emailsData.data) {
              if (new Date(email.created_at) >= monthStart) {
                emailsThisMonth++
              } else {
                hasMore = false
                break
              }
            }
            lastId = emailsData.data[emailsData.data.length - 1]?.id
          }
        } catch (err) {
          errors.push(`Resend: email count failed: ${err instanceof Error ? err.message : String(err)}`)
        }

        // Count emails sent today
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        let emailsToday = 0
        try {
          const url = 'https://api.resend.com/emails'
          const emailsRes = await fetch(url, {
            headers: authHeaders,
            signal: AbortSignal.timeout(15_000),
          })
          if (emailsRes.ok) {
            const emailsData = await emailsRes.json() as {
              data: Array<{ id: string; created_at: string }>
            }
            emailsToday = (emailsData.data || []).filter(
              (e: { created_at: string }) => new Date(e.created_at) >= todayStart,
            ).length
          }
        } catch {
          // Non-critical — daily count is best-effort
        }

        // Resend doesn't expose billing — report as $0 (free tier)
        records.push({
          platformId,
          serviceId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: '0.00',
          currency: 'USD',
          costType: 'usage',
          collectionMethod: 'api',
          rawData: {
            domains: domains.data?.length ?? 0,
            emailsThisMonth,
            emailsToday,
          },
          notes: `Resend: ${domains.data?.length ?? 0} domain(s), ${emailsThisMonth} emails this month, free tier`,
        })
      }
      catch (err) {
        errors.push(`Resend collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
