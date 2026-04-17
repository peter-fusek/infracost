/**
 * Cost attribution utilities.
 *
 * Splits a single cost amount across multiple projects using stored weights
 * or derived proportions (e.g. Anthropic API usage share, Render service count).
 * All splits preserve the total to within rounding tolerance.
 */
import { eq, desc, and, isNull, gte } from 'drizzle-orm'
import { costAttributionWeights, costRecords, platforms, services } from '../db/schema'

export interface AttributionSplit {
  projectSlug: string
  amount: number
}

/** Load stored weights for a platform. Returns projectSlug → weight. */
export async function loadAttributionWeights(
  db: ReturnType<typeof import('./db').useDB>,
  platformId: number,
): Promise<Map<string, number>> {
  const rows = await db
    .select()
    .from(costAttributionWeights)
    .where(eq(costAttributionWeights.platformId, platformId))

  return new Map(rows.map(r => [r.projectSlug, parseFloat(r.weight)]))
}

/** Load stored weights for every platform. Returns platformId → (projectSlug → weight). */
export async function loadAllAttributionWeights(
  db: ReturnType<typeof import('./db').useDB>,
): Promise<Map<number, Map<string, number>>> {
  const rows = await db.select().from(costAttributionWeights)
  const byPlatform = new Map<number, Map<string, number>>()
  for (const r of rows) {
    let inner = byPlatform.get(r.platformId)
    if (!inner) {
      inner = new Map()
      byPlatform.set(r.platformId, inner)
    }
    inner.set(r.projectSlug, parseFloat(r.weight))
  }
  return byPlatform
}

/**
 * Split a cost amount by stored weights.
 * Returns empty array if weights are missing or sum to 0.
 * Final entry absorbs rounding remainder so totals reconcile exactly.
 */
export function splitCostByWeights(
  totalAmount: number,
  weights: Map<string, number>,
): AttributionSplit[] {
  if (weights.size === 0) return []
  const sum = [...weights.values()].reduce((s, w) => s + w, 0)
  if (sum <= 0) return []

  const entries = [...weights.entries()]
  const splits: AttributionSplit[] = []
  let allocated = 0

  for (let i = 0; i < entries.length; i++) {
    const [slug, w] = entries[i]!
    const isLast = i === entries.length - 1
    const amount = isLast
      ? Math.round((totalAmount - allocated) * 10000) / 10000
      : Math.round((totalAmount * (w / sum)) * 10000) / 10000
    allocated += amount
    splits.push({ projectSlug: slug, amount })
  }

  return splits
}

/**
 * Split a cost amount by how many services each project owns on the platform.
 * Services with null project are excluded — a platform's $19 subscription shouldn't
 * be attributed to an unknown project.
 */
export function splitCostByServiceCount(
  totalAmount: number,
  svcList: Array<{ project: string | null }>,
): AttributionSplit[] {
  const counts = new Map<string, number>()
  for (const s of svcList) {
    if (!s.project) continue
    counts.set(s.project, (counts.get(s.project) ?? 0) + 1)
  }
  if (counts.size === 0) return []
  const totalServices = [...counts.values()].reduce((a, b) => a + b, 0)
  const weights = new Map<string, number>(
    [...counts.entries()].map(([p, c]) => [p, c / totalServices]),
  )
  return splitCostByWeights(totalAmount, weights)
}

/**
 * Refresh Claude Max attribution weights based on Anthropic API usage share
 * for the current month. Falls back to equal weights across all projects with
 * active services if no Anthropic data is available.
 */
export async function refreshClaudeMaxWeights(
  db: ReturnType<typeof import('./db').useDB>,
): Promise<{ basis: string; weights: Map<string, number> }> {
  const claudeMaxRow = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.slug, 'claude-max'))
    .limit(1)
  const claudeMaxId = claudeMaxRow[0]?.id
  if (!claudeMaxId) {
    return { basis: 'equal', weights: new Map() }
  }

  const anthropicRow = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.slug, 'anthropic'))
    .limit(1)
  const anthropicId = anthropicRow[0]?.id

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  let weights = new Map<string, number>()
  let basis = 'equal'

  // Try: Anthropic usage share (preferred signal)
  if (anthropicId) {
    const anthropicCosts = await db
      .select({
        project: services.project,
        amount: costRecords.amount,
      })
      .from(costRecords)
      .leftJoin(services, eq(services.id, costRecords.serviceId))
      .where(and(
        eq(costRecords.platformId, anthropicId),
        gte(costRecords.periodStart, monthStart),
        eq(costRecords.isActive, true),
        isNull(costRecords.deletedAt),
      ))

    const sums = new Map<string, number>()
    let total = 0
    for (const row of anthropicCosts) {
      if (!row.project) continue
      const amt = parseFloat(row.amount)
      if (amt <= 0) continue
      sums.set(row.project, (sums.get(row.project) ?? 0) + amt)
      total += amt
    }
    if (total > 0 && sums.size > 0) {
      weights = new Map([...sums.entries()].map(([p, s]) => [p, s / total]))
      basis = 'api_usage_share'
    }
  }

  // Fallback: equal-weight across projects with active services
  if (weights.size === 0) {
    const activeProjects = await db
      .selectDistinct({ project: services.project })
      .from(services)
      .where(eq(services.isActive, true))
    const projectList = activeProjects
      .map(r => r.project)
      .filter((p): p is string => !!p && p !== 'personal')
    if (projectList.length > 0) {
      const w = 1 / projectList.length
      weights = new Map(projectList.map(p => [p, w]))
      basis = 'equal'
    }
  }

  // Upsert into weights table
  if (weights.size > 0) {
    await db.delete(costAttributionWeights)
      .where(eq(costAttributionWeights.platformId, claudeMaxId))
    const rows = [...weights.entries()].map(([slug, w]) => ({
      platformId: claudeMaxId,
      projectSlug: slug,
      weight: w.toFixed(4),
      basis,
      updatedAt: new Date(),
    }))
    await db.insert(costAttributionWeights).values(rows)
  }

  return { basis, weights }
}

/** Sort weight entries by highest-first for display stability. */
export function sortedWeightEntries(weights: Map<string, number>): Array<[string, number]> {
  return [...weights.entries()].sort((a, b) => b[1] - a[1])
}

/** Last record fetch helper — used by depletion check to order by recency. */
export function _orderByRecent() {
  return desc(costRecords.periodStart)
}
