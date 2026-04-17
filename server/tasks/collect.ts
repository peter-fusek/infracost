import { eq, and, gte, lte } from 'drizzle-orm'
import type { BaseCollector } from '../collectors/base'
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
import { checkPlanLimitAlerts } from '../services/plan-limit-alerts'
import { checkDepletionAlerts } from '../services/depletion-alerts'
import { checkCollectorRegressions } from '../services/collector-regression-alerts'
import { detectDrift, persistDriftAlerts } from '../services/drift-detector'
import { detectAnomalies, persistAnomalyAlerts } from '../services/anomaly-detector'
import { refreshClaudeMaxWeights } from '../utils/attribution'
import { checkUnallocatedAlert } from '../services/unallocated-alerts'

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

    // Batch-load all services once to avoid N+1
    const allServices = await db.select().from(services).where(eq(services.isActive, true))
    const servicesByPlatform = new Map<number, typeof allServices>()
    for (const svc of allServices) {
      const list = servicesByPlatform.get(svc.platformId) ?? []
      list.push(svc)
      servicesByPlatform.set(svc.platformId, list)
    }

    for (const platform of platformList) {
      if (platform.collectionMethod === 'manual') continue

      const platformServices = servicesByPlatform.get(platform.id) ?? []
      const apiServiceId = platformServices.find(s => s.serviceType === 'api_usage')?.id

      // Build collector — skip if API key missing (before inserting run record)
      let collector: BaseCollector | null = null
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
        case 'anthropic': {
          if (!config.anthropicAdminApiKey) continue
          // Build workspace_id → serviceId map from services.externalId.
          // Each per-project workspace service row has externalId set to the
          // Anthropic workspace_id; collector uses this to attribute costs directly.
          const wsMap = new Map<string, number>()
          for (const svc of platformServices) {
            if (svc.externalId) wsMap.set(svc.externalId, svc.id)
          }
          collector = createAnthropicCollector(config.anthropicAdminApiKey, platform.id, apiServiceId, wsMap)
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
        triggerType: 'cron',
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

        // A run that produced 0 records AND has errors is a hard failure,
        // not a partial success — don't let it look yellow on the dashboard.
        const hadErrors = result.errors.length > 0
        const hadRecords = result.records.length > 0
        const runStatus = hadErrors && !hadRecords
          ? 'failed'
          : hadErrors
            ? 'partial'
            : 'success'

        await db.update(collectionRuns).set({
          status: runStatus,
          recordsCollected: result.records.length,
          errorMessage: hadErrors ? result.errors.join('; ') : null,
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
    let newAlerts: Awaited<ReturnType<typeof checkBudgetAlerts>> = []
    let alertsError: string | null = null
    try {
      newAlerts = await checkBudgetAlerts(db, config as unknown as Record<string, string>)
    }
    catch (err) {
      alertsError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Budget alerts check failed:', alertsError)
    }

    // Check plan limit alerts
    let limitAlerts: Awaited<ReturnType<typeof checkPlanLimitAlerts>> = []
    let limitAlertsError: string | null = null
    try {
      limitAlerts = await checkPlanLimitAlerts(db, config as unknown as Record<string, string>)
    }
    catch (err) {
      limitAlertsError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Plan limit alerts check failed:', limitAlertsError)
    }

    // Refresh Claude Max attribution weights from Anthropic workspace usage share.
    // Runs after collection so it sees the latest per-workspace cost records.
    let attributionBasis: string | null = null
    let attributionError: string | null = null
    try {
      const { basis } = await refreshClaudeMaxWeights(db)
      attributionBasis = basis
    }
    catch (err) {
      attributionError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Attribution weights refresh failed:', attributionError)
    }

    // Depletion alerts — catches prepaid credit running low (Anthropic, Railway)
    let depletionAlerts: Awaited<ReturnType<typeof checkDepletionAlerts>> = []
    let depletionAlertsError: string | null = null
    try {
      depletionAlerts = await checkDepletionAlerts(db, config as unknown as Record<string, string>)
    }
    catch (err) {
      depletionAlertsError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Depletion alerts check failed:', depletionAlertsError)
    }

    // Collector regression — catches silently broken collectors (API contract changes)
    let regressionAlerts: Awaited<ReturnType<typeof checkCollectorRegressions>> = []
    let regressionError: string | null = null
    try {
      regressionAlerts = await checkCollectorRegressions(db, config as unknown as Record<string, string>)
    }
    catch (err) {
      regressionError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Collector regression check failed:', regressionError)
    }

    // Unallocated-costs-high alert — fires when a big share of MTD can't be attributed
    let unallocatedAlert: Awaited<ReturnType<typeof checkUnallocatedAlert>> | null = null
    let unallocatedError: string | null = null
    try {
      unallocatedAlert = await checkUnallocatedAlert(db, config as unknown as Record<string, string>)
    }
    catch (err) {
      unallocatedError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Unallocated alert check failed:', unallocatedError)
    }

    // Run drift detection + persist alerts
    let drifts: Awaited<ReturnType<typeof detectDrift>> = []
    let driftAlertCount = 0
    let driftError: string | null = null
    try {
      drifts = await detectDrift(db, config as unknown as Record<string, string>)
      driftAlertCount = await persistDriftAlerts(db, drifts, config as unknown as Record<string, string>)
    }
    catch (err) {
      driftError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Drift detection failed:', driftError)
    }

    // Run anomaly detection
    let anomalies: Awaited<ReturnType<typeof detectAnomalies>> = []
    let anomalyError: string | null = null
    try {
      anomalies = await detectAnomalies(db)
      await persistAnomalyAlerts(db, anomalies, config as unknown as Record<string, string>)
    }
    catch (err) {
      anomalyError = err instanceof Error ? err.message : String(err)
      console.error('[collect] Anomaly detection failed:', anomalyError)
    }

    return {
      result: results,
      alerts: newAlerts,
      limitAlerts,
      depletionAlerts,
      regressionAlerts,
      attributionBasis,
      unallocatedAlert,
      drifts,
      driftAlertCount,
      anomalies,
      errors: { alertsError, limitAlertsError, depletionAlertsError, regressionError, attributionError, unallocatedError, driftError, anomalyError },
    }
  },
})
