import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Neon collector — checks account info via API.
 * Free tier: 0.5 GiB storage, 191.9 compute hours/mo.
 * Note: /projects endpoint requires org_id (not available on personal free tier).
 * Uses /users/me to verify account and report plan status.
 */
export function createNeonCollector(apiKey: string, platformId: number): BaseCollector {
  return {
    platformSlug: 'neon',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        // Use /users/me to verify key and get plan info
        const response = await fetch('https://console.neon.tech/api/v2/users/me', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })

        if (!response.ok) {
          errors.push(`Neon API error ${response.status}: ${await response.text()}`)
          return { records, errors }
        }

        const user = await response.json() as {
          plan: string
          active_seconds_limit: number
          projects_limit: number
          auth_accounts: Array<{ email: string; login: string }>
        }

        const email = user.auth_accounts?.[0]?.email || 'unknown'

        // Count actual projects
        let projectCount: number | null = null
        try {
          const projRes = await fetch('https://console.neon.tech/api/v2/projects', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(15_000),
          })
          if (projRes.ok) {
            const projData = await projRes.json() as { projects: Array<{ id: string }> }
            projectCount = projData.projects?.length ?? null
          }
        } catch {
          // Non-critical — project count is best-effort
        }

        records.push({
          platformId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: '0.00',
          currency: 'USD',
          costType: 'usage',
          collectionMethod: 'api',
          rawData: {
            plan: user.plan,
            email,
            projectCount,
            projectsLimit: user.projects_limit,
            activeSecondsLimit: user.active_seconds_limit,
          },
          notes: `Neon: ${user.plan} plan, ${projectCount ?? '?'} projects (${email})`,
        })

        return { records, errors, accountIdentifier: email }
      }
      catch (err) {
        errors.push(`Neon collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
