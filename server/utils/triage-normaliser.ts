/**
 * Triage normaliser — converts alerts, countdown items, drift, and reminders
 * into a unified TriageItem[] for the /triage page and weekly digest.
 */

import { SOURCE_DRIFT_PREFIX } from '../services/source-reconciler'

export type TriageSource = 'alert' | 'expiry' | 'depletion' | 'limit' | 'reminder' | 'drift'

export interface TriageItem {
  id: string
  source: TriageSource
  urgencyScore: number    // 0=depleted/expired, 1=exceeded, 2=critical, 3=warning
  severity: 'red' | 'yellow'
  title: string
  subtitle: string
  detail: string
  platform: string
  actionType: 'alert_resolve' | 'alert_ack' | 'external_link' | 'record_cost' | 'drift_issue'
  actionLabel: string
  actionHref?: string
  alertId?: number
  reminderSlug?: string
  driftKey?: string
}

/** Must stay in sync with app/utils/risk.ts URGENCY_SCORES */
export const URGENCY_SCORES: Record<string, number> = {
  depleted: 0, expired: 0, exceeded: 1,
  critical: 2, warning: 3, ok: 4, unknown: 5,
}

function severityFromUrgency(score: number): 'red' | 'yellow' {
  return score <= 2 ? 'red' : 'yellow'
}

/** Platform billing/dashboard URLs for action links */
export const PLATFORM_ACTION_URLS: Record<string, string> = {
  railway: 'https://railway.app/account/billing',
  anthropic: 'https://console.anthropic.com/settings/billing',
  neon: 'https://console.neon.tech/app/billing',
  turso: 'https://app.turso.tech/settings/billing',
  resend: 'https://resend.com/overview',
  render: 'https://dashboard.render.com/billing',
  uptimerobot: 'https://dashboard.uptimerobot.com/',
  gcp: 'https://console.cloud.google.com/billing',
  github: 'https://github.com/settings/billing',
  websupport: 'https://www.websupport.sk/sprava/domeny',
}

export function normaliseAlert(alert: {
  id: number
  severity: string
  alertType: string
  message: string
  status: string
}): TriageItem | null {
  if (alert.status === 'resolved') return null
  const urgency = alert.severity === 'critical' ? 2 : 3

  // Source-reconciler alerts use alertType format `{SOURCE_DRIFT_PREFIX}<adapter>_<kind>_<slug>`.
  // Unpack so /triage can show the adapter (ga4/gsc) as platform instead of "source".
  let platform = alert.alertType.split('_')[0] ?? ''
  let subtitle = `${alert.alertType} alert`
  if (alert.alertType.startsWith(SOURCE_DRIFT_PREFIX)) {
    const parts = alert.alertType.slice(SOURCE_DRIFT_PREFIX.length).split('_')
    platform = parts[0] ?? 'source'
    const kind = parts[1] ?? ''
    subtitle = `Source reconciliation: ${platform} ${kind}`.trim()
  }

  return {
    id: `alert:${alert.id}`,
    source: 'alert',
    urgencyScore: urgency,
    severity: severityFromUrgency(urgency),
    title: alert.message,
    subtitle,
    detail: `Status: ${alert.status}`,
    platform,
    actionType: alert.status === 'pending' ? 'alert_ack' : 'alert_resolve',
    actionLabel: alert.status === 'pending' ? 'Acknowledge' : 'Resolve',
    alertId: alert.id,
  }
}

export function normaliseExpiry(item: {
  platform: string
  service: string
  daysUntil: number
  risk: string
  description: string
  impact: string
  monthlyAfter: number | null
}): TriageItem | null {
  const urgency = URGENCY_SCORES[item.risk] ?? 5
  if (urgency >= 4) return null
  return {
    id: `expiry:${item.platform}:${item.service}`,
    source: 'expiry',
    urgencyScore: urgency,
    severity: severityFromUrgency(urgency),
    title: `${item.platform}: ${item.service}`,
    subtitle: item.description,
    detail: item.daysUntil <= 0 ? 'Expired' : `${item.daysUntil} days remaining`,
    platform: item.platform.toLowerCase(),
    actionType: 'external_link',
    actionLabel: 'Review',
    actionHref: PLATFORM_ACTION_URLS[item.platform.toLowerCase()] ?? undefined,
  }
}

export function normaliseDepletion(item: {
  slug: string
  name: string
  creditBalance: number
  daysRemaining: number | null
  riskLevel: string
}): TriageItem | null {
  const urgency = URGENCY_SCORES[item.riskLevel] ?? 5
  if (urgency >= 4) return null
  return {
    id: `depletion:${item.slug}`,
    source: 'depletion',
    urgencyScore: urgency,
    severity: severityFromUrgency(urgency),
    title: `${item.name} credit depleting`,
    subtitle: `$${item.creditBalance.toFixed(2)} remaining`,
    detail: item.daysRemaining !== null ? `~${item.daysRemaining} days left` : 'No burn rate data',
    platform: item.slug,
    actionType: 'external_link',
    actionLabel: 'Top Up',
    actionHref: PLATFORM_ACTION_URLS[item.slug] ?? undefined,
  }
}

export function normaliseLimit(platform: {
  slug: string
  name: string
  metrics: Array<{ metric: string; label: string; pct: number | null; riskLevel: string; usedFormatted: string; limitFormatted: string }>
}): TriageItem[] {
  const items: TriageItem[] = []
  for (const m of platform.metrics) {
    const urgency = URGENCY_SCORES[m.riskLevel] ?? 5
    if (urgency >= 4) continue
    items.push({
      id: `limit:${platform.slug}:${m.metric}`,
      source: 'limit',
      urgencyScore: urgency,
      severity: severityFromUrgency(urgency),
      title: `${platform.name}: ${m.label}`,
      subtitle: `${m.usedFormatted} / ${m.limitFormatted}`,
      detail: m.pct !== null ? `${m.pct}% used` : 'Unknown usage',
      platform: platform.slug,
      actionType: 'external_link',
      actionLabel: 'Usage Page',
      actionHref: PLATFORM_ACTION_URLS[platform.slug] ?? undefined,
    })
  }
  return items
}

export function normaliseReminder(item: {
  slug: string
  name: string
  daysSinceLastRecord: number | null
  currentMonthRecorded: boolean
  expectedAmount: number | null
}): TriageItem | null {
  if (item.currentMonthRecorded) return null
  const overdue = item.daysSinceLastRecord !== null && item.daysSinceLastRecord > 35
  return {
    id: `reminder:${item.slug}`,
    source: 'reminder',
    urgencyScore: overdue ? 2 : 3,
    severity: overdue ? 'red' : 'yellow',
    title: `${item.name}: record this month's cost`,
    subtitle: item.expectedAmount ? `Expected: $${item.expectedAmount.toFixed(2)}` : 'No expected amount',
    detail: item.daysSinceLastRecord !== null ? `Last recorded ${item.daysSinceLastRecord} days ago` : 'Never recorded',
    platform: item.slug,
    actionType: 'record_cost',
    actionLabel: 'Record',
    reminderSlug: item.slug,
  }
}

export function normaliseDrift(item: {
  type: 'new' | 'removed' | 'changed'
  platform: string
  name: string
  detail: string
}): TriageItem {
  const urgency = item.type === 'removed' ? 2 : 3
  return {
    id: `drift:${item.platform}:${item.name}`,
    source: 'drift',
    urgencyScore: urgency,
    severity: severityFromUrgency(urgency),
    title: `${item.platform}: ${item.name}`,
    subtitle: item.detail,
    detail: `${item.type} service`,
    platform: item.platform.toLowerCase(),
    actionType: 'drift_issue',
    actionLabel: item.type === 'new' ? 'Add to Registry' : 'Add to Ignore List',
    driftKey: `${item.platform}_${item.name}`,
  }
}
