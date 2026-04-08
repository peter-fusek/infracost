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

  const results = await Promise.all(
    allProjects.map(async (project) => {
      const config = ANALYTICS_CONFIG.find(c => c.slug === project.slug)
      if (!config) return { ...project, ga4: null, gsc: null }

      const [ga4, gsc] = await Promise.all([
        config.ga4PropertyId ? fetchGA4Traffic(config.ga4PropertyId, 30).catch(() => null) : Promise.resolve(null),
        config.gscSiteUrl ? fetchGSCPerformance(config.gscSiteUrl, 30).catch(() => null) : Promise.resolve(null),
      ])

      return {
        ...project,
        ga4PropertyId: config?.ga4PropertyId ?? null,
        gscSiteUrl: config?.gscSiteUrl ?? null,
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
    }),
  )

  return {
    projects: results.filter(p => p.ga4 || p.gsc),
    unconfigured: results.filter(p => !p.ga4 && !p.gsc).map(p => p.slug),
    fetchedAt: new Date().toISOString(),
  }
})
