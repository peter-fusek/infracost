import { and, eq, isNull } from 'drizzle-orm'
import { projects } from '../../db/schema'
import { ANALYTICS_CONFIG } from '../../utils/analytics-config'
import { fetchGA4Traffic } from '../../services/analytics-ga4'
import { fetchGSCPerformance } from '../../services/analytics-gsc'

/**
 * Analytics summary — returns overview data for all configured projects.
 * Fetches GA4 + GSC data in parallel for each project.
 */
export default defineEventHandler(async () => {
  const db = useDB()

  const allProjects = await db
    .select({ slug: projects.slug, name: projects.name, productionUrl: projects.productionUrl })
    .from(projects)
    .where(and(eq(projects.isActive, true), isNull(projects.deletedAt)))
    .orderBy(projects.name)

  // Compute exclusion set upfront so both batches can run in parallel
  const dbSlugs = new Set(allProjects.map(p => p.slug))

  async function fetchAnalytics(config: typeof ANALYTICS_CONFIG[number], project: { slug: string; name: string; productionUrl: string | null }) {
    const [ga4, gsc] = await Promise.all([
      config.ga4PropertyId ? fetchGA4Traffic(config.ga4PropertyId, 30).catch((err) => { console.warn('[analytics-summary] GA4 failed for', config.slug + ':', err instanceof Error ? err.message : err); return null }) : Promise.resolve(null),
      config.gscSiteUrl ? fetchGSCPerformance(config.gscSiteUrl, 30).catch((err) => { console.warn('[analytics-summary] GSC failed for', config.slug + ':', err instanceof Error ? err.message : err); return null }) : Promise.resolve(null),
    ])

    return {
      ...project,
      ga4PropertyId: config.ga4PropertyId ?? null,
      gscSiteUrl: config.gscSiteUrl ?? null,
      ga4: ga4 ? {
        sessions: ga4.totals.sessions,
        users: ga4.totals.users,
        humanSessions: ga4.totals.humanSessions,
        botSessions: ga4.totals.botSessions,
        daily: ga4.daily.map(d => ({ date: d.date, sessions: d.sessions, humans: d.humanSessions, bots: d.botSessions })),
        errors: ga4.errors,
      } : null,
      gsc: gsc ? {
        clicks: gsc.totals.clicks,
        impressions: gsc.totals.impressions,
        ctr: gsc.totals.ctr,
        position: gsc.totals.position,
        seoScore: gsc.seoScore,
        tips: gsc.tips,
        daily: gsc.daily.map(d => ({ date: d.date, clicks: d.clicks, impressions: d.impressions, position: d.position })),
        topQueries: gsc.topQueries.slice(0, 5),
        errors: gsc.errors,
      } : null,
    }
  }

  // Fetch DB projects and analytics-only entries in parallel
  const [results, analyticsOnly] = await Promise.all([
    Promise.all(
      allProjects.map(async (project) => {
        const config = ANALYTICS_CONFIG.find(c => c.slug === project.slug)
        if (!config) return { ...project, ga4PropertyId: null, gscSiteUrl: null, ga4: null, gsc: null }
        return fetchAnalytics(config, project)
      }),
    ),
    Promise.all(
      ANALYTICS_CONFIG
        .filter(c => !dbSlugs.has(c.slug))
        .map(config => fetchAnalytics(config, {
          slug: config.slug,
          name: config.slug,
          productionUrl: null,
        })),
    ),
  ])

  const all = [...results, ...analyticsOnly]

  // Detect shared GA4 / GSC sources: two config entries pointing at the same property
  // surface identical numbers and silently mask whether the second card has its own stream.
  const ga4Groups = new Map<string, string[]>()
  const gscGroups = new Map<string, string[]>()
  for (const p of all) {
    if (p.ga4PropertyId) {
      const list = ga4Groups.get(p.ga4PropertyId) ?? []
      list.push(p.slug)
      ga4Groups.set(p.ga4PropertyId, list)
    }
    if (p.gscSiteUrl) {
      const list = gscGroups.get(p.gscSiteUrl) ?? []
      list.push(p.slug)
      gscGroups.set(p.gscSiteUrl, list)
    }
  }

  const withSharing = all.map(p => ({
    ...p,
    sharedGa4With: p.ga4PropertyId ? (ga4Groups.get(p.ga4PropertyId) ?? []).filter(s => s !== p.slug) : [],
    sharedGscWith: p.gscSiteUrl ? (gscGroups.get(p.gscSiteUrl) ?? []).filter(s => s !== p.slug) : [],
  }))

  return {
    projects: withSharing.filter(p => p.ga4 || p.gsc),
    unconfigured: results.filter(p => !p.ga4 && !p.gsc).map(p => p.slug),
    fetchedAt: new Date().toISOString(),
  }
})
