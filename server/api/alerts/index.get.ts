import { and, eq, isNull, desc, gte, like, sql } from 'drizzle-orm'
import { alerts, budgets } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDB()

  const conditions = [
    eq(alerts.isActive, true),
    isNull(alerts.deletedAt),
  ]

  // Status filter: default shows only pending, ?status=all shows everything
  const statusFilter = String(query.status || '')
  if (statusFilter === 'all') {
    // no status filter
  } else if (['pending', 'sent', 'acknowledged', 'resolved'].includes(statusFilter)) {
    conditions.push(eq(alerts.status, statusFilter as any))
  } else {
    // Default: pending only
    conditions.push(eq(alerts.status, 'pending'))
  }

  // Severity filter
  const severity = String(query.severity || '')
  if (['info', 'warning', 'critical'].includes(severity)) {
    conditions.push(eq(alerts.severity, severity as any))
  }

  // Alert type filter (prefix match for grouped types like drift_*, anomaly_*)
  const alertType = String(query.type || '')
  if (alertType) {
    const safeType = alertType.replace(/[%_\\]/g, '\\$&')
    conditions.push(like(alerts.alertType, `${safeType}%`))
  }

  // Date range: default current month, ?months=3 for last 3 months, ?months=all for everything
  const months = String(query.months || '1')
  if (months !== 'all') {
    const monthCount = Math.min(Math.max(parseInt(months) || 1, 1), 12)
    const since = new Date()
    since.setMonth(since.getMonth() - monthCount + 1, 1)
    since.setHours(0, 0, 0, 0)
    conditions.push(gte(alerts.createdAt, since))
  }

  const { limit, offset } = parsePagination(query as Record<string, unknown>)

  const rows = await db
    .select({
      id: alerts.id,
      severity: alerts.severity,
      status: alerts.status,
      alertType: alerts.alertType,
      message: alerts.message,
      budgetName: budgets.name,
      createdAt: alerts.createdAt,
      resolvedAt: alerts.resolvedAt,
    })
    .from(alerts)
    .leftJoin(budgets, eq(alerts.budgetId, budgets.id))
    .where(and(...conditions))
    .orderBy(desc(alerts.createdAt))
    .limit(limit)
    .offset(offset)

  // Include total count for pagination UI
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .leftJoin(budgets, eq(alerts.budgetId, budgets.id))
    .where(and(...conditions))

  return { alerts: rows, total: count }
})
