import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Railway cost collector using GraphQL API.
 * Fetches project list and usage metrics, then estimates costs using Railway pricing.
 *
 * Railway pricing (Hobby plan):
 * - CPU: $0.000463 / vCPU / minute
 * - Memory: $0.000231 / GB / minute
 * - Egress: $0.05 / GB
 * - Disk: $0.000003 / GB / minute
 */

const RAILWAY_PRICING = {
  CPU_USAGE: 0.000463, // per vCPU-minute
  MEMORY_USAGE_GB: 0.000231, // per GB-minute
  NETWORK_TX_GB: 0.05, // per GB
  DISK_USAGE_GB: 0.000003, // per GB-minute
}

export function createRailwayCollector(apiToken: string, platformId: number, serviceId?: number): BaseCollector {
  return {
    platformSlug: 'railway',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        const query = `
          query {
            projects {
              edges {
                node {
                  id
                  name
                }
              }
            }
            estimatedUsage(measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB]) {
              estimatedValue
              measurement
              projectId
            }
          }
        `

        const response = await fetch('https://backboard.railway.app/graphql/v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`,
          },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(30_000),
        })

        if (!response.ok) {
          errors.push(`Railway API error ${response.status}: ${await response.text()}`)
          return { records, errors }
        }

        const data = await response.json() as {
          data?: {
            estimatedUsage?: Array<{
              estimatedValue: number
              measurement: string
              projectId: string
            }>
            projects?: {
              edges: Array<{
                node: { id: string; name: string }
              }>
            }
          }
          errors?: Array<{ message: string }>
        }

        if (data.errors?.length) {
          errors.push(...data.errors.map(e => `Railway GraphQL: ${e.message}`))
          return { records, errors }
        }

        const usage = data.data?.estimatedUsage
        const projects = data.data?.projects?.edges?.map(e => e.node) ?? []
        const projectNames = Object.fromEntries(projects.map(p => [p.id, p.name]))

        if (usage && usage.length > 0) {
          // Group by project and calculate cost
          const projectCosts: Record<string, { cost: number; details: Record<string, number> }> = {}

          for (const item of usage) {
            if (!projectCosts[item.projectId]) {
              projectCosts[item.projectId] = { cost: 0, details: {} }
            }
            const rate = RAILWAY_PRICING[item.measurement as keyof typeof RAILWAY_PRICING] ?? 0
            const itemCost = item.estimatedValue * rate
            projectCosts[item.projectId]!.cost += itemCost
            projectCosts[item.projectId]!.details[item.measurement] = item.estimatedValue
          }

          // Create a record per project with estimated cost
          for (const [projectId, data] of Object.entries(projectCosts)) {
            if (data.cost > 0) {
              const name = projectNames[projectId] ?? projectId
              records.push({
                platformId,
                serviceId,
                recordDate: new Date(),
                periodStart,
                periodEnd,
                amount: data.cost.toFixed(4),
                currency: 'USD',
                costType: 'usage',
                collectionMethod: 'api',
                rawData: { projectId, projectName: name, metrics: data.details },
                notes: `Railway project "${name}" estimated usage`,
              })
            }
          }
        }
      }
      catch (err) {
        errors.push(`Railway collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
