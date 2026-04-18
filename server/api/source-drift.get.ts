import { runReconciliation } from '../services/source-reconciler'
import { createGA4Adapter } from '../services/source-adapters/ga4-adapter'
import { createGSCAdapter } from '../services/source-adapters/gsc-adapter'

/**
 * GET /api/source-drift
 * Runs the source reconciliation framework (#94) across all registered adapters
 * and returns a per-adapter summary. Persists new drift as alerts + audit_log.
 */
export default defineEventHandler(async () => {
  const db = useDB()
  const summary = await runReconciliation(db, [createGA4Adapter(), createGSCAdapter()])
  return {
    ...summary,
    checkedAt: new Date().toISOString(),
  }
})
