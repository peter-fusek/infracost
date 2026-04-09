import { and, eq, isNull, gte } from 'drizzle-orm'
import { budgets, alerts, projects } from '../db/schema'
import { getMTDSummary, getProjectEOM } from './cost-aggregation'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'

const THRESHOLDS = [
  { pct: 100, severity: 'critical' as const, label: 'exceeded' },
  { pct: 90, severity: 'warning' as const, label: 'at 90%' },
  { pct: 75, severity: 'warning' as const, label: 'at 75%' },
  { pct: 50, severity: 'info' as const, label: 'at 50%' },
]

export async function checkBudgetAlerts(db: ReturnType<typeof import('../utils/db').useDB>, config?: Record<string, string>) {
  const summary = await getMTDSummary(db)
  const newAlerts: Array<{ severity: string; message: string; budgetId: number }> = []

  // Get active budgets with project info
  const budgetList = await db
    .select({
      id: budgets.id,
      name: budgets.name,
      platformId: budgets.platformId,
      projectId: budgets.projectId,
      monthlyLimit: budgets.monthlyLimit,
      alertAt50: budgets.alertAt50,
      alertAt75: budgets.alertAt75,
      alertAt90: budgets.alertAt90,
      alertAt100: budgets.alertAt100,
      projectSlug: projects.slug,
    })
    .from(budgets)
    .leftJoin(projects, eq(budgets.projectId, projects.id))
    .where(and(eq(budgets.isActive, true), isNull(budgets.deletedAt)))

  for (const budget of budgetList) {
    const limit = parseFloat(budget.monthlyLimit)
    if (limit <= 0) continue

    // Use project-specific EOM if budget is project-scoped, otherwise global
    const eom = budget.projectSlug
      ? await getProjectEOM(db, budget.projectSlug)
      : summary.eomEstimate
    const pct = Math.round((eom / limit) * 100)

    // Find highest threshold that's breached
    for (const threshold of THRESHOLDS) {
      if (pct < threshold.pct) continue

      // Check the budget's alert flag for this threshold
      const flagKey = `alertAt${threshold.pct}` as keyof typeof budget
      if (budget[flagKey] === false) continue

      // Check if we already sent this alert this month
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const existing = await db
        .select()
        .from(alerts)
        .where(
          and(
            eq(alerts.budgetId, budget.id),
            eq(alerts.alertType, `budget_${threshold.pct}`),
            gte(alerts.createdAt, monthStart),
            eq(alerts.isActive, true),
          ),
        )
        .limit(1)

      if (existing.length > 0) continue

      // Create alert
      const message = `Budget "${budget.name}" ${threshold.label}: EOM estimate $${eom.toFixed(2)} vs limit $${limit.toFixed(2)} (${pct}%)`
      await db.insert(alerts).values({
        severity: threshold.severity,
        alertType: `budget_${threshold.pct}`,
        message,
        budgetId: budget.id,
      })
      newAlerts.push({ severity: threshold.severity, message, budgetId: budget.id })

      // Send email + WhatsApp for warning and critical alerts
      if (config && (threshold.severity === 'warning' || threshold.severity === 'critical')) {
        try {
          await Promise.all([
            sendAlertEmail(message, threshold.severity, message.substring(0, 80), config),
            sendWhatsApp(`🚨 InfraCost ${threshold.severity}: ${message}`, config),
          ])
        }
        catch (err) {
          console.error(`[budget-alerts] Notification failed for budget ${budget.name}:`, err instanceof Error ? err.message : err)
        }
      }

      // Only create the highest threshold alert, not all lower ones
      break
    }
  }

  return newAlerts
}
