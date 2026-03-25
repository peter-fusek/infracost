/**
 * Analytics configuration — maps projects to their GA4 and GSC properties.
 * GA4 Property ID: numeric ID from Google Analytics (e.g. "123456789")
 * GSC Site URL: the property URL in Search Console (e.g. "https://infracost.eu")
 *
 * To find your GA4 Property ID: GA4 Admin > Property Settings > Property ID
 * To find GSC sites: Search Console > Settings > Property
 */

export interface ProjectAnalyticsConfig {
  slug: string
  ga4PropertyId: string | null
  gscSiteUrl: string | null
}

// Map project slugs to their analytics properties
// Update these when adding GA4 or GSC to a project
// GA4 Property IDs from Google Analytics (instarea.sk account: 319689036, BudgetCo: 388351377)
// Service account: homegrif-reports@homegrif-analytics.iam.gserviceaccount.com
export const ANALYTICS_CONFIG: ProjectAnalyticsConfig[] = [
  { slug: 'infracost', ga4PropertyId: '529880367', gscSiteUrl: 'https://infracost.eu' },
  { slug: 'homegrif.com', ga4PropertyId: '516113889', gscSiteUrl: 'https://homegrif.com' },
  { slug: 'oncoteam', ga4PropertyId: '529091873', gscSiteUrl: 'https://dashboard.oncoteam.cloud' },
  { slug: 'oncofiles', ga4PropertyId: '529720507', gscSiteUrl: 'https://oncofiles.com' },
  { slug: 'contacts-refiner', ga4PropertyId: '529886218', gscSiteUrl: 'https://contactrefiner.com' },
  { slug: 'budgetco', ga4PropertyId: '529309393', gscSiteUrl: 'sc-domain:budgetco.eu' },
  { slug: 'pulseshape', ga4PropertyId: '494047490', gscSiteUrl: 'sc-domain:pulseshape.com' },
  { slug: 'instarea', ga4PropertyId: null, gscSiteUrl: 'sc-domain:instarea.com' },
  { slug: 'scrabsnap', ga4PropertyId: '529720507', gscSiteUrl: null },
  // robota removed — project no longer exists
]

export function getAnalyticsConfig(slug: string): ProjectAnalyticsConfig | undefined {
  return ANALYTICS_CONFIG.find(c => c.slug === slug)
}

export function getProjectsWithAnalytics(): ProjectAnalyticsConfig[] {
  return ANALYTICS_CONFIG.filter(c => c.ga4PropertyId || c.gscSiteUrl)
}
