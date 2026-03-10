import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Render hybrid collector.
 * No billing API exists — uses service list API + known pricing formulas.
 * Pricing data from our research (render-cost-optimization.md):
 * - Professional plan: $19/mo (fixed)
 * - Free tier web services: $0
 * - Basic-256mb DB: $6/mo base
 * - DB storage: $0.30/GB/mo (1GB min)
 * - Pipeline: 500 min/mo included, $5/1000 min overage
 */

// Known Render pricing map
const RENDER_PRICING = {
  professional_plan: 19.00,
  db_basic_256mb: 6.00,
  db_storage_per_gb: 0.30,
  pipeline_included_minutes: 500,
  pipeline_overage_per_1000: 5.00,
  free_web_service: 0.00,
}

interface RenderService {
  id: string
  name: string
  type: string // web_service, private_service, background_worker, cron_job, static_site, postgres
  plan?: string
  disk?: { sizeGB: number }
}

export function createRenderCollector(apiKey: string, platformId: number): BaseCollector {
  return {
    platformSlug: 'render',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        // Fetch all services from Render API
        const response = await fetch('https://api.render.com/v1/services?limit=50', {
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (!response.ok) {
          errors.push(`Render API error ${response.status}: ${await response.text()}`)
          return { records, errors }
        }

        const servicesData = await response.json() as Array<{ service: RenderService }>

        // Professional plan (fixed monthly)
        records.push({
          platformId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: RENDER_PRICING.professional_plan.toFixed(2),
          currency: 'USD',
          costType: 'subscription',
          collectionMethod: 'hybrid',
          rawData: { type: 'professional_plan' },
          notes: 'Render Professional plan (1 seat)',
        })

        // Calculate costs per service based on known pricing
        for (const { service } of servicesData) {
          let cost = 0
          let costType: CostRecord['costType'] = 'subscription'
          let notes = ''

          if (service.type === 'postgres') {
            // DB pricing: base + storage
            const diskGB = service.disk?.sizeGB || 1
            cost = RENDER_PRICING.db_basic_256mb + (diskGB * RENDER_PRICING.db_storage_per_gb)
            notes = `PostgreSQL: Basic-256mb + ${diskGB}GB storage`
          }
          else if (service.plan === 'free' || !service.plan) {
            cost = 0
            costType = 'usage'
            notes = 'Free tier'
          }

          records.push({
            platformId,
            recordDate: new Date(),
            periodStart,
            periodEnd,
            amount: cost.toFixed(2),
            currency: 'USD',
            costType,
            collectionMethod: 'hybrid',
            rawData: { service },
            notes: notes || `${service.type}: ${service.name}`,
          })
        }
      }
      catch (err) {
        errors.push(`Render collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
