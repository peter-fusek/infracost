import { and, eq, isNull, desc } from 'drizzle-orm'
import { alerts } from '../../db/schema'
import { computeExpiryStatuses } from '../../utils/free-tier-expiry'
import {
  normaliseAlert, normaliseExpiry, normaliseDepletion, normaliseLimit,
  normaliseReminder, normaliseDrift,
  type TriageItem,
} from '../../utils/triage-normaliser'

/**
 * Full triage endpoint — aggregates all attention-requiring items.
 * Drift detection calls external APIs so this can be slow (~3s).
 */
export default defineEventHandler(async (event) => {
  const db = useDB()
  const config = useRuntimeConfig(event)

  // Fan out to all sources in parallel — each individually caught
  const warnings: string[] = []
  const [alertRows, expiryItems, depletionResult, limitsResult, reminderResult, driftResult] = await Promise.all([
    db.select({
      id: alerts.id,
      severity: alerts.severity,
      alertType: alerts.alertType,
      message: alerts.message,
      status: alerts.status,
    })
      .from(alerts)
      .where(and(
        eq(alerts.isActive, true),
        isNull(alerts.deletedAt),
        eq(alerts.status, 'pending'),
      ))
      .orderBy(desc(alerts.createdAt))
      .limit(50)
      .catch((err) => { console.error('[triage] alerts query failed:', err instanceof Error ? err.message : err); warnings.push('alerts'); return [] }),

    Promise.resolve(computeExpiryStatuses()),

    // Use event.$fetch for Nitro-internal calls (avoids relative URL issues in production)
    event.$fetch('/api/depletion').catch((err) => { console.error('[triage] depletion fetch failed:', err instanceof Error ? err.message : err); warnings.push('depletion'); return { platforms: [] } }),
    event.$fetch('/api/limits').catch((err) => { console.error('[triage] limits fetch failed:', err instanceof Error ? err.message : err); warnings.push('limits'); return { platforms: [] } }),
    event.$fetch('/api/costs/manual-reminders').catch((err) => { console.error('[triage] reminders fetch failed:', err instanceof Error ? err.message : err); warnings.push('reminders'); return { reminders: [] } }),

    // Drift is the slowest — calls 3 external APIs
    (async () => {
      const { detectDrift } = await import('../../services/drift-detector')
      return detectDrift(db, config as Record<string, string>).catch((err) => { console.error('[triage] drift detection failed:', err instanceof Error ? err.message : err); warnings.push('drift'); return [] })
    })(),
  ])

  // Normalise all sources into TriageItem[]
  const items: TriageItem[] = []

  for (const a of alertRows) {
    const item = normaliseAlert(a)
    if (item) items.push(item)
  }

  for (const e of expiryItems) {
    const item = normaliseExpiry(e)
    if (item) items.push(item)
  }

  for (const d of (depletionResult as any).platforms ?? []) {
    const item = normaliseDepletion(d)
    if (item) items.push(item)
  }

  for (const p of (limitsResult as any).platforms ?? []) {
    items.push(...normaliseLimit(p))
  }

  for (const r of (reminderResult as any).reminders ?? []) {
    const item = normaliseReminder(r)
    if (item) items.push(item)
  }

  for (const d of (driftResult ?? [])) {
    items.push(normaliseDrift(d))
  }

  // Sort by urgency (most urgent first)
  items.sort((a, b) => a.urgencyScore - b.urgencyScore)

  const redCount = items.filter(i => i.severity === 'red').length
  const yellowCount = items.filter(i => i.severity === 'yellow').length

  return {
    items,
    counts: { red: redCount, yellow: yellowCount, total: items.length },
    warnings,
    checkedAt: new Date().toISOString(),
  }
})
