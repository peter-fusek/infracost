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
        })

        let usageData: Record<string, unknown> = {}
        if (usageResponse.ok) {
          usageData = await usageResponse.json()
        }

        // Get databases
        const dbResponse = await fetch(`https://api.turso.tech/v1/organizations/${orgSlug}/databases`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        let dbCount = 0
        if (dbResponse.ok) {
          const dbData = await dbResponse.json() as { databases: Array<{ name: string }> }
          dbCount = dbData.databases?.length ?? 0
        }

        // Free tier — $0 cost but track usage metrics
        records.push({
          platformId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: '0.00',
          currency: 'USD',
          costType: 'usage',
          collectionMethod: 'api',
          rawData: { org: orgSlug, databases: dbCount, usage: usageData },
          notes: `Turso: ${dbCount} database(s) in "${orgSlug}", free tier`,
        })
      }
      catch (err) {
        errors.push(`Turso collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
