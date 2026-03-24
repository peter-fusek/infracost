/**
 * Free tier expiry tracking.
 * Tracks known expiration dates for free-tier services
 * and upcoming pricing changes.
 *
 * Expiry sources:
 * - Render: free plan DBs expire after 90 days
 * - Platform promotional credits with end dates
 * - Trial periods
 */

export interface ExpiryItem {
  platform: string
  service: string
  expiresAt: string // ISO date
  description: string
  impact: string // what happens when it expires
  monthlyAfter: number | null // estimated monthly cost after expiry (USD)
}

// Known free tier expirations — update as services are created/renewed
// Render free PostgreSQL databases expire 90 days after creation
export const FREE_TIER_EXPIRY: ExpiryItem[] = [
  {
    platform: 'Render',
    service: 'budgetco-db',
    expiresAt: '2026-06-01',
    description: 'Free PostgreSQL database (90-day limit)',
    impact: 'DB will be suspended. Must upgrade to Basic ($6.42/mo) or migrate.',
    monthlyAfter: 6.42,
  },
  {
    platform: 'Render',
    service: 'oncoteam-db-prod',
    expiresAt: '2026-04-15',
    description: 'Free PostgreSQL database (suspended — migrated to Railway)',
    impact: 'Already suspended. Can be deleted to clean up inventory.',
    monthlyAfter: null,
  },
  {
    platform: 'Render',
    service: 'oncoteam-db-test',
    expiresAt: '2026-04-15',
    description: 'Free PostgreSQL database (suspended — migrated to Railway)',
    impact: 'Already suspended. Can be deleted to clean up inventory.',
    monthlyAfter: null,
  },
]

export interface ExpiryStatus extends ExpiryItem {
  daysUntil: number
  risk: 'expired' | 'critical' | 'warning' | 'ok'
}

export function computeExpiryStatuses(now: Date = new Date()): ExpiryStatus[] {
  return FREE_TIER_EXPIRY.map((item) => {
    const expiryDate = new Date(item.expiresAt)
    const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000)

    let risk: ExpiryStatus['risk']
    if (daysUntil <= 0) risk = 'expired'
    else if (daysUntil <= 7) risk = 'critical'
    else if (daysUntil <= 30) risk = 'warning'
    else risk = 'ok'

    return { ...item, daysUntil, risk }
  }).sort((a, b) => a.daysUntil - b.daysUntil) // most urgent first
}
