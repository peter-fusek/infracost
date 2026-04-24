/**
 * Expiry tracking for free tiers, domains, hosting, and SSL.
 * Tracks known expiration dates so the countdown page warns before renewal.
 *
 * Expiry sources:
 * - Render: free plan DBs expire after 90 days
 * - Websupport: domain registrations, hosting, SSL certificates
 * - Platform promotional credits with end dates
 */

export interface ExpiryItem {
  platform: string
  service: string
  expiresAt: string // ISO date
  description: string
  impact: string // what happens when it expires
  monthlyAfter: number | null // estimated monthly cost after expiry (USD)
  category?: 'free_tier' | 'domain' | 'hosting' | 'ssl' // for badge display
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

  // Websupport — SSL certificate
  { platform: 'Websupport', service: 'SSL: www.instarea.com', expiresAt: '2026-05-28', description: 'Standard SSL certificate for instarea.com WordPress site', impact: 'Site will show security warning. Renew before expiry.', monthlyAfter: null, category: 'ssl' },

  // Websupport — Hosting
  { platform: 'Websupport', service: 'Hosting Super (instarea)', expiresAt: '2026-07-07', description: 'WordPress hosting for instarea.com', impact: 'instarea.com goes offline. Will be decommissioned when instarea.sk replaces it.', monthlyAfter: 5.00, category: 'hosting' },

  // Websupport — Domains (sorted by expiry date)
  { platform: 'Websupport', service: 'instarea.com', expiresAt: '2026-06-13', description: 'Company domain (.com)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'replica.city', expiresAt: '2026-06-27', description: 'Domain for DISCONTINUED Replica City — redirects to instarea.sk/products/replicacity (verified 2026-04-24)', impact: 'Project DISCONTINUED 2026-04-24. SCHEDULED TO LAPSE 2026-06-27 — user decision: do not renew. Disable auto-renew on Websupport before 2026-06-27.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'repli.city', expiresAt: '2026-06-27', description: 'Alternate domain for DISCONTINUED Replica City — redirects to instarea.sk/products/replicacity (verified 2026-04-24)', impact: 'Project DISCONTINUED 2026-04-24. SCHEDULED TO LAPSE 2026-06-27 — user decision: do not renew. Disable auto-renew on Websupport before 2026-06-27.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'goreplicity.com', expiresAt: '2026-06-27', description: 'Alternate domain for DISCONTINUED Replica City — legacy alias, redirect status not verified', impact: 'Project DISCONTINUED 2026-04-24. SCHEDULED TO LAPSE 2026-06-27 — user decision: do not renew. Disable auto-renew on Websupport before 2026-06-27.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'goreplicacity.com', expiresAt: '2026-06-27', description: 'Alternate domain for DISCONTINUED Replica City — legacy alias, redirect status not verified', impact: 'Project DISCONTINUED 2026-04-24. SCHEDULED TO LAPSE 2026-06-27 — user decision: do not renew. Disable auto-renew on Websupport before 2026-06-27.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'grandpacheck.com', expiresAt: '2026-09-26', description: 'Domain for DISCONTINUED Grandpa Check — redirects to instarea.sk/products/grandpacheck (verified 2026-04-24)', impact: 'Project DISCONTINUED 2026-04-24. Decide before 2026-09-26: renew to keep redirect, or let lapse. Auto-renews via credit unless disabled.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'getwhysurvey.com', expiresAt: '2026-09-26', description: 'Orphaned domain — no active project (.com)', impact: 'Domain expires. No project uses it — decide if still needed.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'getsurveylink.com', expiresAt: '2026-09-26', description: 'Orphaned domain — no active project (.com)', impact: 'Domain expires. No project uses it — decide if still needed.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'instarea.sk', expiresAt: '2026-09-26', description: 'Company domain for new Nuxt site (.sk)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'shiftrotation.com', expiresAt: '2026-11-26', description: 'Orphaned domain — no active project (.com)', impact: 'Domain expires. No project uses it — decide if still needed.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'homegrif.com', expiresAt: '2026-12-05', description: 'Primary domain for HomeGrif.com (.com)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'homegrif.cz', expiresAt: '2027-02-25', description: 'Czech domain for HomeGrif (.cz)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'contactrefiner.com', expiresAt: '2027-03-10', description: 'Domain for Contacts Refiner (.com)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'oncoteam.cloud', expiresAt: '2027-03-11', description: 'Domain for Oncoteam (.cloud)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'oncofiles.com', expiresAt: '2027-03-11', description: 'Domain for Oncofiles (.com)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'pulseshape.com', expiresAt: '2027-03-13', description: 'Domain for DISCONTINUED PulseShape — redirects to instarea.sk/products/pulseshape (verified 2026-04-24)', impact: 'Project DISCONTINUED 2026-04-24. Decide before 2027-03-13: renew to keep redirect, or let lapse. Auto-renews via credit unless disabled.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'infracost.eu', expiresAt: '2027-03-18', description: 'Domain for InfraCost (.eu)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'budgetco.eu', expiresAt: '2027-03-18', description: 'Domain for BudgetCo (.eu)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'scrabsnap.com', expiresAt: '2027-03-27', description: 'Domain for ScrabSnap (.com)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
  { platform: 'Websupport', service: 'homegrif.sk', expiresAt: '2027-04-08', description: 'Slovak domain for HomeGrif — standalone SK site, Tatrabanka demo (.sk)', impact: 'Domain expires. Auto-renews via credit.', monthlyAfter: 0.58, category: 'domain' },
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
