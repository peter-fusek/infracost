import { and, eq, gte, lte } from 'drizzle-orm'
import { platforms, services, costRecords, collectionRuns } from '../../db/schema'
import { getCurrentMonthRange } from '../../collectors/base'
import { createAnthropicCollector } from '../../collectors/anthropic'
import { createGcpCollector } from '../../collectors/gcp'
import { createNeonCollector } from '../../collectors/neon'
import { createRailwayCollector } from '../../collectors/railway'
import { createRenderCollector } from '../../collectors/render'
import { createResendCollector } from '../../collectors/resend'
import { createTursoCollector } from '../../collectors/turso'
import { createUptimeRobotCollector } from '../../collectors/uptimerobot'
import { checkBudgetAlerts } from '../../services/budget-alerts'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const targetPlatform = body.platform as string | undefined // optional: collect only specific platform

  const db = useDB()
  const config = useRuntimeConfig()
  const { start, end } = getCurrentMonthRange()

  const results: Array<{ platform: string, records: number, errors: string[] }> = []

  // Get platforms to collect
  const platformList = await db.select().from(platforms).where(eq(platforms.isActive, true))

  for (const platform of platformList) {
    if (targetPlatform && platform.slug !== targetPlatform) continue
    if (platform.collectionMethod === 'manual') continue

    // Create collection run
    const [run] = await db.insert(collectionRuns).values({
      platformId: platform.id,
      triggerType: body.trigger || 'manual',
    }).returning()

    try {
      // Get service IDs for this platform
      const platformServices = await db
        .select()
        .from(services)
        .where(eq(services.platformId, platform.id))

      const apiServiceId = platformServices.find(s => s.serviceType === 'api_usage')?.id

      // Create appropriate collector
      let collector
      switch (platform.slug) {
        case 'anthropic':
          if (!config.anthropicAdminApiKey) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API key configured'] })
            continue
          }
          collector = createAnthropicCollector(config.anthropicAdminApiKey, platform.id, apiServiceId)
          break
        case 'railway':
          if (!config.railwayApiToken) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API token configured'] })
            continue
          }
          collector = createRailwayCollector(config.railwayApiToken, platform.id, apiServiceId)
          break
        case 'render': {
          if (!config.renderApiKey) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API key configured'] })
            continue
          }
          // Build name→serviceId map for linking records to services
          const svcMap = new Map(platformServices.map(s => [s.name, s.id]))
          collector = createRenderCollector(config.renderApiKey, platform.id, svcMap)
          break
        }
        case 'resend':
          if (!config.resendApiKey) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API key configured'] })
            continue
          }
          collector = createResendCollector(config.resendApiKey, platform.id, apiServiceId)
          break
        case 'neon':
          if (!config.neonApiKey) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API key configured'] })
            continue
          }
          collector = createNeonCollector(config.neonApiKey, platform.id)
          break
        case 'turso':
          if (!config.tursoApiToken) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API token configured'] })
            continue
          }
          collector = createTursoCollector(config.tursoApiToken, platform.id)
          break
        case 'gcp':
          collector = createGcpCollector('', platform.id, apiServiceId)
          break
        case 'uptimerobot':
          if (!config.uptimeRobotApiKey) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API key configured'] })
            continue
          }
          collector = createUptimeRobotCollector(config.uptimeRobotApiKey, platform.id)
          break
        default:
          results.push({ platform: platform.slug, records: 0, errors: [`No collector implemented for ${platform.slug}`] })
          continue
      }

      const result = await collector.collect(start, end)

      // Delete previous automated records for this platform+period to avoid duplicates
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

      // Update collection run
      await db.update(collectionRuns)
        .set({
          status: result.errors.length > 0 ? 'partial' : 'success',
          recordsCollected: result.records.length,
          errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
          completedAt: new Date(),
        })
        .where(eq(collectionRuns.id, run.id))

      results.push({
        platform: platform.slug,
        records: result.records.length,
        errors: result.errors,
      })
    }
    catch (err) {
      await db.update(collectionRuns)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        })
        .where(eq(collectionRuns.id, run.id))

      results.push({
        platform: platform.slug,
        records: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })
    }
  }

  // Check budget alerts after collection
  const newAlerts = await checkBudgetAlerts(db, config as unknown as Record<string, string>)

  return { collected: results, period: { start, end }, alerts: newAlerts }
})
