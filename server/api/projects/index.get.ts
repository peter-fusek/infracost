import { and, eq, isNull, sql } from 'drizzle-orm'
import { projects, services, costRecords } from '../../db/schema'
import { getCurrentMonthRange } from '../../collectors/base'
import { toEur } from '../../utils/currency'

export default defineEventHandler(async () => {
  const db = useDB()
  const { start, end } = getCurrentMonthRange()

  // Get all active projects
  const allProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.isActive, true), isNull(projects.deletedAt)))
    .orderBy(projects.name)

  // Get service counts + MTD costs per project
  const projectStats = await db.execute<{
    project: string
    service_count: number
    mtd_usd: string
    estimate_usd: string
  }>(sql`
    select
      s.project,
      count(distinct s.id)::int as service_count,
      coalesce(sum(case when cr.period_start >= ${start} and cr.period_end <= ${end} and cr.is_active then cr.amount else 0 end), 0) as mtd_usd,
      coalesce(sum(s.monthly_cost_estimate), 0) as estimate_usd
    from services s
    left join cost_records cr on cr.service_id = s.id
    where s.is_active = true and s.deleted_at is null and s.project is not null
    group by s.project
  `)

  const statsMap = new Map(projectStats.rows.map(r => [r.project, r]))

  // Get recent change counts per project (last 7 days) from audit_log
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
  const recentChanges = await db.execute<{ project: string; change_count: number }>(sql`
    select details->>'project' as project, count(*)::int as change_count
    from audit_log
    where entity_type = 'service'
      and action like 'drift_%'
      and created_at >= ${sevenDaysAgo}
      and details->>'project' is not null
    group by details->>'project'
  `)
  const changesMap = new Map(recentChanges.rows.map(r => [r.project, r.change_count]))

  const result = allProjects.map((p) => {
    const stats = statsMap.get(p.slug)
    const mtd = parseFloat(stats?.mtd_usd || '0')
    const estimate = parseFloat(stats?.estimate_usd || '0')
    return {
      ...p,
      serviceCount: stats?.service_count ?? 0,
      mtdUsd: Math.round(mtd * 100) / 100,
      mtdEur: toEur(mtd),
      estimateUsd: Math.round(estimate * 100) / 100,
      estimateEur: toEur(estimate),
      recentChanges: changesMap.get(p.slug) ?? 0,
    }
  })

  return { projects: result }
})
