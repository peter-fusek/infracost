import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Anthropic Claude API cost collector.
 *
 * Uses the Admin API cost_report endpoint to pull actual billing data.
 * Endpoint: GET /v1/organizations/cost_report
 * Requires an Admin API key (sk-ant-admin-...).
 *
 * Falls back gracefully if the endpoint is unavailable.
 */

interface CostReportItem {
  workspace_id: string
  workspace_name: string
  description: string
  cost_cents: string // e.g. "12345" = $123.45
}

interface CostReportResponse {
  data: CostReportItem[]
}

interface UsageReportBucket {
  date: string
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

interface UsageReportResponse {
  data: UsageReportBucket[]
}

export function createAnthropicCollector(apiKey: string, platformId: number, serviceId?: number): BaseCollector {
  return {
    platformSlug: 'anthropic',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []
      let accountIdentifier: string | undefined

      // Format dates as YYYY-MM-DD for the API
      const startDate = periodStart.toISOString().slice(0, 10)
      const endDate = periodEnd.toISOString().slice(0, 10)

      // Try cost_report endpoint first (gives USD amounts directly)
      try {
        const costUrl = `https://api.anthropic.com/v1/organizations/cost_report?start_date=${startDate}&end_date=${endDate}&group_by[]=workspace`
        const costResponse = await fetch(costUrl, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: AbortSignal.timeout(15_000),
        })

        if (costResponse.ok) {
          const costData = await costResponse.json() as CostReportResponse

          if (costData.data?.length) {
            // Sum all workspace costs
            let totalCents = 0
            const workspaces: string[] = []

            for (const item of costData.data) {
              totalCents += parseFloat(item.cost_cents || '0')
              if (item.workspace_name && !workspaces.includes(item.workspace_name)) {
                workspaces.push(item.workspace_name)
              }
            }

            const totalUsd = totalCents / 100

            if (totalUsd > 0) {
              records.push({
                platformId,
                serviceId,
                recordDate: new Date(),
                periodStart,
                periodEnd,
                amount: totalUsd.toFixed(4),
                currency: 'USD',
                costType: 'usage',
                collectionMethod: 'api',
                rawData: {
                  source: 'cost_report',
                  workspaces: costData.data,
                  totalCents,
                },
              })
            }

            accountIdentifier = workspaces.length
              ? workspaces.join(', ')
              : undefined
          }

          // Also fetch usage details for metadata
          try {
            const usageUrl = `https://api.anthropic.com/v1/organizations/usage_report/messages?start_date=${startDate}&end_date=${endDate}&bucket_width=1d`
            const usageResponse = await fetch(usageUrl, {
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              signal: AbortSignal.timeout(15_000),
            })

            if (usageResponse.ok) {
              const usageData = await usageResponse.json() as UsageReportResponse
              if (usageData.data?.length && records.length > 0) {
                // Attach token totals to the cost record's rawData
                const totalInput = usageData.data.reduce((s, b) => s + b.input_tokens, 0)
                const totalOutput = usageData.data.reduce((s, b) => s + b.output_tokens, 0)
                const totalCacheRead = usageData.data.reduce((s, b) => s + (b.cache_read_input_tokens || 0), 0)
                const totalCacheWrite = usageData.data.reduce((s, b) => s + (b.cache_creation_input_tokens || 0), 0)

                const rawData = records[0]!.rawData as Record<string, unknown>
                rawData.tokens = {
                  input: totalInput,
                  output: totalOutput,
                  cacheRead: totalCacheRead,
                  cacheWrite: totalCacheWrite,
                  total: totalInput + totalOutput,
                }
              }
            }
          }
          catch {
            // Usage report failure is non-critical — we already have cost data
          }

          return { records, errors, accountIdentifier }
        }

        // Handle specific error codes
        const status = costResponse.status
        if (status === 404) {
          errors.push('Anthropic Admin API: cost_report endpoint not found. May need newer API version.')
        }
        else if (status === 401 || status === 403) {
          errors.push(`Anthropic Admin API: auth failed (${status}). Ensure ANTHROPIC_ADMIN_API_KEY is an Admin key (sk-ant-admin-...).`)
        }
        else {
          const body = await costResponse.text().catch(() => '')
          errors.push(`Anthropic Admin API error ${status}: ${body.slice(0, 200)}`)
        }
      }
      catch (err) {
        errors.push(`Anthropic collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors, accountIdentifier }
    },
  }
}
