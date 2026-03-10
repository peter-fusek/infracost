import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Railway cost collector using GraphQL API.
 * Fetches usage and estimated costs for the current billing period.
 */
export function createRailwayCollector(apiToken: string, platformId: number, serviceId?: number): BaseCollector {
  return {
    platformSlug: 'railway',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        // Step 1: Get current usage estimate
        const usageQuery = `
          query {
            me {
              projects {
                edges {
                  node {
                    id
                    name
                    services {
                      edges {
                        node {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
            estimatedUsage {
              estimatedValue
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
          body: JSON.stringify({ query: usageQuery }),
        })

        if (!response.ok) {
          errors.push(`Railway API error ${response.status}: ${await response.text()}`)
          return { records, errors }
        }

        const data = await response.json() as {
          data?: {
            estimatedUsage?: Array<{
              estimatedValue: number
              projectId: string
            }>
            me?: {
              projects?: {
                edges: Array<{
                  node: {
                    id: string
                    name: string
                  }
                }>
              }
            }
          }
          errors?: Array<{ message: string }>
        }

        if (data.errors?.length) {
          errors.push(...data.errors.map(e => `Railway GraphQL: ${e.message}`))
          return { records, errors }
        }

        const usage = data.data?.estimatedUsage
        if (usage && usage.length > 0) {
          // Sum all project usage
          let totalCost = 0
          const projectDetails: Record<string, unknown>[] = []

          for (const item of usage) {
            totalCost += item.estimatedValue / 100 // Railway returns cents
            projectDetails.push(item)
          }

          if (totalCost > 0) {
            records.push({
              platformId,
              serviceId,
              recordDate: new Date(),
              periodStart,
              periodEnd,
              amount: totalCost.toFixed(4),
              currency: 'USD',
              costType: 'usage',
              collectionMethod: 'api',
              rawData: { usage: projectDetails },
              notes: `Railway estimated usage for ${usage.length} project(s)`,
            })
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
