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
// GA4 Property IDs from Google Analytics (instarea.sk account: 319689036, BudgetCo account: 388351377)
// Service account: homegrif-reports@homegrif-analytics.iam.gserviceaccount.com
export const ANALYTICS_CONFIG: ProjectAnalyticsConfig[] = [
  { slug: 'infracost', ga4PropertyId: '529880367', gscSiteUrl: 'https://infracost.eu' },
  { slug: 'homegrif.com', ga4PropertyId: '531741657', gscSiteUrl: 'https://homegrif.com' }, // HomeGrif COM, measurement ID: G-4T37QHBBDT
  { slug: 'homegrif.sk', ga4PropertyId: '531739129', gscSiteUrl: null }, // HomeGrif SK, measurement ID: G-YM9CSHN4YY
  { slug: 'homegrif.cz', ga4PropertyId: '526515342', gscSiteUrl: 'sc-domain:homegrif.cz' }, // www.homegrif.cz (historical), measurement ID: G-M34JCH2Z35
  { slug: 'oncoteam', ga4PropertyId: '529091873', gscSiteUrl: 'https://oncoteam.cloud' },
  { slug: 'oncofiles', ga4PropertyId: '529785236', gscSiteUrl: 'https://oncofiles.com' },
  { slug: 'contacts-refiner', ga4PropertyId: '529886218', gscSiteUrl: 'sc-domain:contactrefiner.com' },
  { slug: 'budgetco', ga4PropertyId: '529692948', gscSiteUrl: 'sc-domain:budgetco.eu' }, // moved to instarea.sk account (was 529309393 in separate BudgetCo account)
  { slug: 'pulseshape', ga4PropertyId: '494047490', gscSiteUrl: 'sc-domain:pulseshape.com' },
  { slug: 'instarea.com', ga4PropertyId: '530091886', gscSiteUrl: 'sc-domain:instarea.com' }, // shares G-TTWKJ2JWP5 with instarea.sk (same Railway app), old property 447834242 orphaned
  { slug: 'instarea.sk', ga4PropertyId: '530091886', gscSiteUrl: 'sc-domain:instarea.sk' },
  { slug: 'scrabsnap', ga4PropertyId: '529720507', gscSiteUrl: null }, // no GSC property verified
]

export function getAnalyticsConfig(slug: string): ProjectAnalyticsConfig | undefined {
  return ANALYTICS_CONFIG.find(c => c.slug === slug)
}

export function getProjectsWithAnalytics(): ProjectAnalyticsConfig[] {
  return ANALYTICS_CONFIG.filter(c => c.ga4PropertyId || c.gscSiteUrl)
}
