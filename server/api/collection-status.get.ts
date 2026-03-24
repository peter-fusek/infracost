import { sql } from 'drizzle-orm'

/**
 * Returns the latest collection run timestamp across all platforms.
 * Used by StaleDataBanner to detect when data is too old.
 */
export default defineEventHandler(async () => {
  const db = useDB()

  const row = await db.execute<{ latest: string | null; total_runs: number }>(sql`
    select max(completed_at) as latest, count(*)::int as total_runs
    from collection_runs
    where status in ('success', 'partial')
  `)

  return {
    lastCollectedAt: row.rows[0]?.latest ?? null,
    totalRuns: row.rows[0]?.total_runs ?? 0,
  }
})
