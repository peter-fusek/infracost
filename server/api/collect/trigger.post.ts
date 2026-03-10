import { eq } from 'drizzle-orm'
import { platforms, services, costRecords, collectionRuns } from '../../db/schema'
import { getCurrentMonthRange } from '../../collectors/base'
import { createAnthropicCollector } from '../../collectors/anthropic'
import { createRailwayCollector } from '../../collectors/railway'
import { createRenderCollector } from '../../collectors/render'

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
        case 'render':
          if (!config.renderApiKey) {
            results.push({ platform: platform.slug, records: 0, errors: ['No API key configured'] })
            continue
          }
          collector = createRenderCollector(config.renderApiKey, platform.id)
          break
        default:
          results.push({ platform: platform.slug, records: 0, errors: [`No collector implemented for ${platform.slug}`] })
          continue
      }

      const result = await collector.collect(start, end)

      // Insert collected records
      if (result.records.length > 0) {
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

  return { collected: results, period: { start, end } }
})
