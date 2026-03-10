import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Anthropic Claude API cost collector.
 * Uses the Admin API to fetch organization usage.
 * Docs: https://docs.anthropic.com/en/api/admin-api
 */
export function createAnthropicCollector(apiKey: string, platformId: number, serviceId?: number): BaseCollector {
  return {
    platformSlug: 'anthropic',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        // Anthropic Admin API — get organization usage
        const startDate = periodStart.toISOString().split('T')[0]
        const endDate = periodEnd.toISOString().split('T')[0]

        const response = await fetch(
          `https://api.anthropic.com/v1/organizations/usage?start_date=${startDate}&end_date=${endDate}`,
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'admin-api-2025-04-10',
            },
          },
        )

        if (!response.ok) {
          const errorText = await response.text()
          errors.push(`Anthropic API error ${response.status}: ${errorText}`)
          return { records, errors }
        }

        const data = await response.json() as {
          daily_usage?: Array<{
            date: string
            input_tokens: number
            output_tokens: number
            cost_usd: number
          }>
          total_cost_usd?: number
        }

        // If we get daily usage breakdown
        if (data.daily_usage && Array.isArray(data.daily_usage)) {
          for (const day of data.daily_usage) {
            if (day.cost_usd > 0) {
              records.push({
                platformId,
                serviceId,
                recordDate: new Date(day.date),
                periodStart: new Date(day.date),
                periodEnd: new Date(day.date),
                amount: day.cost_usd.toFixed(4),
                currency: 'USD',
                costType: 'usage',
                collectionMethod: 'api',
                rawData: day as unknown as Record<string, unknown>,
                notes: `Tokens: ${day.input_tokens} in, ${day.output_tokens} out`,
              })
            }
          }
        }
        // Fallback: single total for the period
        else if (data.total_cost_usd && data.total_cost_usd > 0) {
          records.push({
            platformId,
            serviceId,
            recordDate: periodStart,
            periodStart,
            periodEnd,
            amount: data.total_cost_usd.toFixed(4),
            currency: 'USD',
            costType: 'usage',
            collectionMethod: 'api',
            rawData: data as unknown as Record<string, unknown>,
          })
        }
      }
      catch (err) {
        errors.push(`Anthropic collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
