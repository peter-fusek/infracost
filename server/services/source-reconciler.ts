import { gte } from 'drizzle-orm'
import { alerts, auditLog } from '../db/schema'

/** Shared prefix used by source-reconciler alertTypes.
 *  Also parsed by triage-normaliser.ts — keep in sync. */
export const SOURCE_DRIFT_PREFIX = 'source_drift_'

/**
 * Source reconciliation framework (#94 Phase 1).
 *
 * A SourceAdapter compares the code-owned config (ANALYTICS_CONFIG, service registry,
 * etc.) against a live upstream source (GA4 Admin API, GSC, Render, Railway …) and
 * emits a list of `SourceDrift` events. The runner deduplicates against recent alerts
 * (7d window) and persists new drift as both an `alerts` row (for /triage + /alerts UI)
 * and an `audit_log` row (for /status change history).
 *
 * Why it exists: "spotted-by-eye" bugs like #93 (homegrif.com card never rendered because
 * config entry never landed) and the silent instarea.com/instarea.sk dedup happen because
 * there is no periodic reality check between code and upstream. See CLAUDE.md meta-principle.
 */

export type DriftKind =
  | 'missing'  // config points at upstream ID that doesn't exist / no access
  | 'unknown'  // upstream has entity that no config entry references

export interface SourceDrift {
  kind: DriftKind
  slug: string          // identifier in alert + dedup key (config slug for 'missing', upstream display name for 'unknown')
  upstreamId: string | null
  details: string
}

export interface AdapterResult {
  drifts: SourceDrift[]
  errors: string[]        // non-fatal warnings (logged, surfaced in summary, do not block persistence)
  fatal: string | null    // auth/setup failure — suppresses persistence to avoid false-positive storm
}

export interface SourceAdapter {
  readonly name: string        // short id — first token after `source_drift_` in alertType (max 12 chars)
  readonly displayName: string // human-readable for alert messages
  reconcile: () => Promise<AdapterResult>
}

type DB = ReturnType<typeof import('../utils/db').useDB>

const DEDUP_WINDOW_DAYS = 7
const ALERT_TYPE_MAX = 50 // matches alerts.alertType varchar(50)

export interface ReconciliationSummary {
  total: number
  persisted: number
  deduped: number
  errors: string[]
  byAdapter: Record<string, { persisted: number; deduped: number; total: number; fatal: string | null }>
}

export function buildAlertType(adapterName: string, drift: SourceDrift): string {
  const base = `${SOURCE_DRIFT_PREFIX}${adapterName}_${drift.kind}_${drift.slug}`
  return base.length > ALERT_TYPE_MAX ? base.slice(0, ALERT_TYPE_MAX) : base
}

export async function runReconciliation(db: DB, adapterList: SourceAdapter[]): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    total: 0,
    persisted: 0,
    deduped: 0,
    errors: [],
    byAdapter: {},
  }

  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const recent = await db
    .select({ alertType: alerts.alertType })
    .from(alerts)
    .where(gte(alerts.createdAt, since))
  const recentTypes = new Set(recent.map(a => a.alertType))

  for (const adapter of adapterList) {
    summary.byAdapter[adapter.name] = { persisted: 0, deduped: 0, total: 0, fatal: null }

    let result: AdapterResult
    try {
      result = await adapter.reconcile()
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[source-reconciler] ${adapter.name} threw:`, msg)
      summary.errors.push(`${adapter.name}: ${msg}`)
      summary.byAdapter[adapter.name]!.fatal = msg
      continue
    }

    if (result.fatal) {
      console.warn(`[source-reconciler] ${adapter.name} skipped (fatal): ${result.fatal}`)
      summary.byAdapter[adapter.name]!.fatal = result.fatal
      continue
    }

    for (const err of result.errors) {
      console.warn(`[source-reconciler] ${adapter.name} warning: ${err}`)
      summary.errors.push(`${adapter.name}: ${err}`)
    }

    summary.byAdapter[adapter.name]!.total = result.drifts.length
    summary.total += result.drifts.length

    const alertRows: typeof alerts.$inferInsert[] = []
    const auditRows: typeof auditLog.$inferInsert[] = []

    for (const drift of result.drifts) {
      const alertType = buildAlertType(adapter.name, drift)
      if (recentTypes.has(alertType)) {
        summary.deduped++
        summary.byAdapter[adapter.name]!.deduped++
        continue
      }

      const upstreamSuffix = drift.upstreamId ? ` (${drift.upstreamId})` : ''
      const message = `[${adapter.displayName}] ${drift.kind}: ${drift.slug}${upstreamSuffix} — ${drift.details}`

      alertRows.push({ severity: 'warning', alertType, message })
      auditRows.push({
        action: `${SOURCE_DRIFT_PREFIX}${drift.kind}`,
        entityType: 'source_config',
        actorType: 'system',
        details: {
          adapter: adapter.name,
          kind: drift.kind,
          slug: drift.slug,
          upstreamId: drift.upstreamId,
          details: drift.details,
        },
      })
      recentTypes.add(alertType) // prevent duplicate inserts within this run
      summary.persisted++
      summary.byAdapter[adapter.name]!.persisted++
    }

    if (alertRows.length > 0) await db.insert(alerts).values(alertRows)
    if (auditRows.length > 0) await db.insert(auditLog).values(auditRows)
  }

  return summary
}
