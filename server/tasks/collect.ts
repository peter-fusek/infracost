import { eq, and, gte, lte } from 'drizzle-orm'
import { platforms, services, costRecords, collectionRuns } from '../db/schema'
import { getCurrentMonthRange } from '../collectors/base'
import { createAnthropicCollector } from '../collectors/anthropic'
import { createGcpCollector } from '../collectors/gcp'
import { createNeonCollector } from '../collectors/neon'
import { createRailwayCollector } from '../collectors/railway'
import { createRenderCollector } from '../collectors/render'
import { createResendCollector } from '../collectors/resend'
import { createTursoCollector } from '../collectors/turso'
import { createUptimeRobotCollector } from '../collectors/uptimerobot'
import { checkBudgetAlerts } from '../services/budget-alerts'

export default defineTask({
  meta: {
    name: 'collect',
    description: 'Collect costs from all API-enabled platforms',
  },
  async run() {
    const db = useDB()
    const config = useRuntimeConfig()
    const { start, end } = getCurrentMonthRange()

    const results: Array<{ platform: string; records: number; errors: string[] }> = []
    const platformList = await db.select().from(platforms).where(eq(platforms.isActive, true))

    for (const platform of platformList) {
      if (platform.collectionMethod === 'manual') continue

      const [run] = await db.insert(collectionRuns).values({
        platformId: platform.id,
        triggerType: 'cron',
      }).returning()

      try {
        const platformServices = await db.select().from(services).where(eq(services.platformId, platform.id))
        const apiServiceId = platformServices.find(s => s.serviceType === 'api_usage')?.id

        let collector
        switch (platform.slug) {
          case 'render': {
            if (!config.renderApiKey) continue
            const svcMap = new Map(platformServices.map(s => [s.name, s.id]))
            collector = createRenderCollector(config.renderApiKey, platform.id, svcMap)
            break
          }
          case 'railway':
            if (!config.railwayApiToken) continue
            collector = createRailwayCollector(config.railwayApiToken, platform.id, apiServiceId)
            break
          case 'anthropic':
            if (!config.anthropicAdminApiKey) continue
            collector = createAnthropicCollector(config.anthropicAdminApiKey, platform.id, apiServiceId)
            break
          case 'resend':
            if (!config.resendApiKey) continue
            collector = createResendCollector(config.resendApiKey, platform.id, apiServiceId)
            break
          case 'neon':
            if (!config.neonApiKey) continue
            collector = createNeonCollector(config.neonApiKey, platform.id)
            break
          case 'turso':
            if (!config.tursoApiToken) continue
            collector = createTursoCollector(config.tursoApiToken, platform.id)
            break
          case 'gcp':
            collector = createGcpCollector('', platform.id, apiServiceId)
            break
          case 'uptimerobot':
            if (!config.uptimeRobotApiKey) continue
            collector = createUptimeRobotCollector(config.uptimeRobotApiKey, platform.id)
            break
          default:
            continue
        }

        const result = await collector.collect(start, end)

        if (result.records.length > 0) {
          await db.delete(costRecords).where(
            and(
              eq(costRecords.platformId, platform.id),
              gte(costRecords.periodStart, start),
              lte(costRecords.periodEnd, end),
              eq(costRecords.collectionMethod, platform.collectionMethod),
            ),
          )
          await db.insert(costRecords).values(result.records)
        }

        await db.update(collectionRuns).set({
          status: result.errors.length > 0 ? 'partial' : 'success',
          recordsCollected: result.records.length,
          errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
          completedAt: new Date(),
        }).where(eq(collectionRuns.id, run.id))

        results.push({ platform: platform.slug, records: result.records.length, errors: result.errors })
      }
      catch (err) {
        await db.update(collectionRuns).set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        }).where(eq(collectionRuns.id, run.id))
        results.push({ platform: platform.slug, records: 0, errors: [String(err)] })
      }
    }

    // Check budget alerts after collection
    const newAlerts = await checkBudgetAlerts(db)

    return { result: results, alerts: newAlerts }
  },
})
