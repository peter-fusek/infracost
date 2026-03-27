import { and, eq, gte, lte } from 'drizzle-orm'
import type { BaseCollector } from '../../collectors/base'
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
import { checkPlanLimitAlerts } from '../../services/plan-limit-alerts'

// Rate limiting: minimum 2 minutes between manual triggers
let lastTriggerAt = 0
const MIN_TRIGGER_INTERVAL_MS = 2 * 60 * 1000

// Concurrent run guard
let isRunning = false

export default defineEventHandler(async (event) => {
  // Prevent concurrent runs
  if (isRunning) {
    throw createError({ statusCode: 429, message: 'Collection already in progress' })
  }

  // Rate limit manual triggers
  const now = Date.now()
  const elapsed = now - lastTriggerAt
  if (elapsed < MIN_TRIGGER_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_TRIGGER_INTERVAL_MS - elapsed) / 1000)
    throw createError({ statusCode: 429, message: `Please wait ${waitSec}s before triggering again` })
  }

  isRunning = true
  lastTriggerAt = now

  try {
    return await runCollection(event)
  } finally {
    isRunning = false
  }
})

async function runCollection(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]) {
  const body = await readBody(event) || {}
  const targetPlatform = body.platform as string | undefined

  const db = useDB()
  const config = useRuntimeConfig()
  const { start, end } = getCurrentMonthRange()

  const results: Array<{ platform: string; records: number; errors: string[] }> = []
  const platformList = await db.select().from(platforms).where(eq(platforms.isActive, true))

  // Batch-load all services once to avoid N+1
  const allServices = await db.select().from(services).where(eq(services.isActive, true))
  const servicesByPlatform = new Map<number, typeof allServices>()
  for (const svc of allServices) {
    const list = servicesByPlatform.get(svc.platformId) ?? []
    list.push(svc)
    servicesByPlatform.set(svc.platformId, list)
  }

  for (const platform of platformList) {
    if (targetPlatform && platform.slug !== targetPlatform) continue
    if (platform.collectionMethod === 'manual') continue

    const platformServices = servicesByPlatform.get(platform.id) ?? []
    const apiServiceId = platformServices.find(s => s.serviceType === 'api_usage')?.id

    // Build collector — skip if API key missing (before inserting run record)
    let collector: BaseCollector | null = null
    switch (platform.slug) {
      case 'anthropic':
        if (!config.anthropicAdminApiKey) continue
        collector = createAnthropicCollector(config.anthropicAdminApiKey, platform.id, apiServiceId)
        break
      case 'railway':
        if (!config.railwayApiToken) continue
        collector = createRailwayCollector(config.railwayApiToken, platform.id, apiServiceId)
        break
      case 'render': {
        if (!config.renderApiKey) continue
        const svcMap = new Map(platformServices.map(s => [s.name, s.id]))
        collector = createRenderCollector(config.renderApiKey, platform.id, svcMap)
        break
      }
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

    // Insert run record only after confirming we have a collector
    const [run] = await db.insert(collectionRuns).values({
      platformId: platform.id,
      triggerType: ['manual', 'cron', 'api'].includes(body.trigger) ? body.trigger : 'manual',
    }).returning()

    try {
      const result = await collector.collect(start, end)

      // Persist account identifier if returned
      if (result.accountIdentifier) {
        await db.update(platforms).set({
          accountIdentifier: result.accountIdentifier,
        }).where(eq(platforms.id, platform.id))
      }

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
      }).where(eq(collectionRuns.id, run!.id))

      results.push({ platform: platform.slug, records: result.records.length, errors: result.errors })
    }
    catch (err) {
      await db.update(collectionRuns).set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      }).where(eq(collectionRuns.id, run!.id))
      results.push({ platform: platform.slug, records: 0, errors: [String(err)] })
    }
  }

  // Check budget alerts after collection
  let newAlerts: Awaited<ReturnType<typeof checkBudgetAlerts>> = []
  let alertsError: string | null = null
  try {
    newAlerts = await checkBudgetAlerts(db, config as unknown as Record<string, string>)
  }
  catch (err) {
    alertsError = err instanceof Error ? err.message : String(err)
    console.error('[trigger] Budget alerts check failed:', alertsError)
  }

  // Check plan limit alerts
  let limitAlerts: Awaited<ReturnType<typeof checkPlanLimitAlerts>> = []
  let limitAlertsError: string | null = null
  try {
    limitAlerts = await checkPlanLimitAlerts(db, config as unknown as Record<string, string>)
  }
  catch (err) {
    limitAlertsError = err instanceof Error ? err.message : String(err)
    console.error('[trigger] Plan limit alerts check failed:', limitAlertsError)
  }

  return { collected: results, period: { start, end }, alerts: newAlerts, limitAlerts, errors: { alertsError, limitAlertsError } }
}
