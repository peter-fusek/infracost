import { sql } from 'drizzle-orm'

/**
 * One-time cleanup: soft-delete duplicate Claude Max services.
 * Keeps only: "Max Subscription (personal)" and "Extra Usage (personal)"
 * Soft-deletes: "Max Subscription", "Extra Usage Credits", "Team Subscription (instarea)", "Extra Usage (instarea)"
 * Also reassigns unallocated cost_records to the correct services.
 */
export default defineEventHandler(async () => {
  const db = useDB()

  // 1. Soft-delete duplicate/stale Claude Max services
  const deleted = await db.execute(sql`
    update services
    set is_active = false, deleted_at = now()
    where platform_id = (select id from platforms where slug = 'claude-max')
      and name in (
        ${'Max Subscription'},
        ${'Extra Usage Credits'},
        ${'Team Subscription (instarea)'},
        ${'Extra Usage (instarea)'}
      )
      and is_active = true
    returning id, name
  `)

  // 2. Reassign unallocated cost_records for claude-max to the correct services
  // Subscription cost records → Max Subscription (personal)
  const subReassign = await db.execute(sql`
    update cost_records
    set service_id = (
      select s.id from services s
      join platforms p on p.id = s.platform_id
      where p.slug = 'claude-max' and s.name = 'Max Subscription (personal)' and s.is_active = true
      limit 1
    )
    where platform_id = (select id from platforms where slug = 'claude-max')
      and service_id is null
      and cost_type = 'subscription'
      and is_active = true
    returning id
  `)

  // Usage/one_time cost records → Extra Usage (personal)
  const usageReassign = await db.execute(sql`
    update cost_records
    set service_id = (
      select s.id from services s
      join platforms p on p.id = s.platform_id
      where p.slug = 'claude-max' and s.name = 'Extra Usage (personal)' and s.is_active = true
      limit 1
    )
    where platform_id = (select id from platforms where slug = 'claude-max')
      and service_id is null
      and cost_type in ('usage', 'one_time', 'overage')
      and is_active = true
    returning id
  `)

  // 3. Soft-delete robota project and its services
  const robotaProject = await db.execute(sql`
    update projects set is_active = false, deleted_at = now()
    where slug = 'robota' and is_active = true
    returning id, slug
  `)
  const robotaServices = await db.execute(sql`
    update services set is_active = false, deleted_at = now()
    where project = 'robota' and is_active = true
    returning id, name
  `)

  return {
    deletedServices: deleted.rows,
    reassignedSubscription: subReassign.rows.length,
    reassignedUsage: usageReassign.rows.length,
    robotaProject: robotaProject.rows,
    robotaServices: robotaServices.rows,
    message: 'Cleanup complete: Claude Max duplicates removed, robota project archived',
  }
})
