import { and, eq, isNull, gte } from 'drizzle-orm'
import { budgets, alerts } from '../db/schema'
import { getMTDSummary } from './cost-aggregation'

async function sendAlertEmail(message: string, severity: string, config: Record<string, string>) {
  if (!config.resendApiKey) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'InfraCost <alerts@contactrefiner.com>',
        to: ['peterfusek1980@gmail.com'],
        subject: `[InfraCost ${severity.toUpperCase()}] ${message.substring(0, 80)}`,
        text: message,
      }),
    })
  }
  catch { /* email send failed silently */ }
}

const THRESHOLDS = [
  { pct: 100, severity: 'critical' as const, label: 'exceeded' },
  { pct: 90, severity: 'warning' as const, label: 'at 90%' },
  { pct: 75, severity: 'warning' as const, label: 'at 75%' },
  { pct: 50, severity: 'info' as const, label: 'at 50%' },
]

export async function checkBudgetAlerts(db: ReturnType<typeof import('../utils/db').useDB>, config?: Record<string, string>) {
  const summary = await getMTDSummary(db)
  const newAlerts: Array<{ severity: string; message: string; budgetId: number }> = []

  // Get active budgets
  const budgetList = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.isActive, true), isNull(budgets.deletedAt)))

  for (const budget of budgetList) {
    const limit = parseFloat(budget.monthlyLimit)
    if (limit <= 0) continue

    // Use EOM estimate for forward-looking alerts
    const eom = summary.eomEstimate
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

      // Send email for warning and critical alerts
      if (config && (threshold.severity === 'warning' || threshold.severity === 'critical')) {
        await sendAlertEmail(message, threshold.severity, config)
      }

      // Only create the highest threshold alert, not all lower ones
      break
    }
  }

  return newAlerts
}
