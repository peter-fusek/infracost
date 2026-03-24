import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, message: 'slug is required' })
  }

  const db = useDB()

  // Query audit_log for drift events linked to this project (via details->project)
  // Also include events where the service name matches a service linked to this project
  const events = await db.execute<{
    id: number
    action: string
    details: { platform: string; service: string; project: string | null; detail: string }
    created_at: string
  }>(sql`
    select id, action, details, created_at
    from audit_log
    where entity_type = 'service'
      and action like 'drift_%'
      and (
        details->>'project' = ${slug}
        or details->>'service' in (
          select name from services where project = ${slug} and is_active = true and deleted_at is null
        )
      )
    order by created_at desc
    limit 50
  `)

  return {
    changes: events.rows.map(e => ({
      id: e.id,
      action: e.action,
      platform: e.details?.platform ?? 'Unknown',
      service: e.details?.service ?? 'Unknown',
      detail: e.details?.detail ?? '',
      createdAt: e.created_at,
    })),
    count: events.rows.length,
  }
})
