/**
 * Free tier / plan limits per platform.
 * Used by GET /api/limits to compute usage percentages.
 *
 * Sources:
 * - Neon: https://neon.com/docs/introduction/plans (100 CU-hours = 360,000 seconds)
 * - Turso: https://turso.tech/pricing
 * - UptimeRobot: https://uptimerobot.com/pricing/
 * - Resend: https://resend.com/docs/knowledge-base/account-quotas-and-limits
 * - Render: https://render.com/docs/free
 * - Railway: https://docs.railway.com/reference/pricing/plans
 */

export interface PlanLimit {
  limit: number
  unit: string
  label: string
  period: 'month' | 'day' | 'total'
}

export const PLAN_LIMITS: Record<string, Record<string, PlanLimit>> = {
  neon: {
    active_seconds: { limit: 360_000, unit: 'seconds', label: 'Compute Hours', period: 'month' },
    projects: { limit: 10, unit: 'count', label: 'Projects', period: 'total' },
    storage_gib: { limit: 0.5, unit: 'GiB', label: 'Storage', period: 'total' },
  },
  turso: {
    rows_read: { limit: 500_000_000, unit: 'rows', label: 'Rows Read', period: 'month' },
    rows_written: { limit: 10_000_000, unit: 'rows', label: 'Rows Written', period: 'month' },
    storage_bytes: { limit: 5_368_709_120, unit: 'bytes', label: 'Storage', period: 'total' }, // 5 GiB
    databases: { limit: 500, unit: 'count', label: 'Databases', period: 'total' },
  },
  uptimerobot: {
    monitors: { limit: 50, unit: 'count', label: 'Monitors', period: 'total' },
  },
  resend: {
    emails_per_month: { limit: 3_000, unit: 'count', label: 'Emails / Month', period: 'month' },
    emails_per_day: { limit: 100, unit: 'count', label: 'Emails / Day', period: 'day' },
  },
  render: {
    pipeline_minutes: { limit: 500, unit: 'minutes', label: 'Build Minutes', period: 'month' },
  },
  railway: {
    monthly_credit_usd: { limit: 5.00, unit: 'USD', label: 'Included Credit', period: 'month' },
  },
}

/** Format usage value for display */
export function formatUsage(value: number, unit: string): string {
  if (unit === 'bytes') {
    if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(2)} GiB`
    if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MiB`
    return `${(value / 1024).toFixed(0)} KiB`
  }
  if (unit === 'seconds') {
    return `${(value / 3600).toFixed(1)}h`
  }
  if (unit === 'rows') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
    return String(value)
  }
  if (unit === 'USD') return `$${value.toFixed(2)}`
  return String(value)
}

/** Format limit value for display */
export function formatLimit(limit: PlanLimit): string {
  return formatUsage(limit.limit, limit.unit)
}

/**
 * Extract usage values from the latest rawData for each platform.
 * Each platform has a different rawData shape — we handle them individually.
 */
export function extractUsage(slug: string, rawData: Record<string, unknown>): Record<string, number | null> {
  switch (slug) {
    case 'neon':
      return {
        active_seconds: typeof rawData.activeSecondsLimit === 'number' ? 0 : null, // usage needs consumption API
        projects: typeof rawData.projectsLimit === 'number' ? rawData.projectsLimit as number : null,
      }
    case 'turso':
      return {
        rows_read: typeof rawData.rowsRead === 'number' ? rawData.rowsRead : null,
        rows_written: typeof rawData.rowsWritten === 'number' ? rawData.rowsWritten : null,
        storage_bytes: typeof rawData.storageBytes === 'number' ? rawData.storageBytes : null,
        databases: typeof rawData.databases === 'number' ? rawData.databases : null,
      }
    case 'uptimerobot':
      return {
        monitors: typeof rawData.totalMonitors === 'number' ? rawData.totalMonitors : null,
      }
    case 'resend':
      return { emails_per_month: null, emails_per_day: null }
    case 'render':
      return { pipeline_minutes: null }
    case 'railway':
      return { monthly_credit_usd: null }
    default:
      return {}
  }
}
