import { eq } from 'drizzle-orm'
import { services } from '../db/schema'

/**
 * One-off migration: rename Render services to match API names + update stale estimates.
 * DELETE THIS FILE after successful run.
 *
 * Renames:
 *   homegrif_com (id=2) → homegrif-prod ($24.50 Standard)
 *   homegrif_com-test (id=3) → homegrif-test ($0 suspended)
 *   contacts-refiner-dashboard (id=10) → contactrefiner-dashboard ($6.85 Starter)
 *
 * Estimate updates:
 *   scrabsnap (id=8): $2.57 → $6.85
 *   budgetco (id=9): $2.14 → $6.85
 *   budgetco-db (id=20): $0.00 → $6.19
 *   infracost (id=36): $7.00 → $6.85
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDB()
  const results: string[] = []

  // Renames + estimate updates
  const renames = [
    { id: 2, oldName: 'homegrif_com', newName: 'homegrif-prod', estimate: '24.50', project: 'homegrif.com' },
    { id: 3, oldName: 'homegrif_com-test', newName: 'homegrif-test', estimate: '0.00', project: 'homegrif.com' },
    { id: 10, oldName: 'contacts-refiner-dashboard', newName: 'contactrefiner-dashboard', estimate: '6.85', project: 'contacts-refiner' },
  ]

  for (const r of renames) {
    const existing = await db.select().from(services).where(eq(services.id, r.id)).limit(1)
    if (existing.length === 0) {
      results.push(`SKIP: id=${r.id} not found`)
      continue
    }
    if (existing[0]!.name === r.newName) {
      results.push(`SKIP: id=${r.id} already named "${r.newName}"`)
      continue
    }
    await db.update(services).set({
      name: r.newName,
      monthlyCostEstimate: r.estimate,
      project: r.project,
    }).where(eq(services.id, r.id))
    results.push(`RENAMED: id=${r.id} "${r.oldName}" → "${r.newName}" (est=$${r.estimate})`)
  }

  // Estimate-only updates
  const estimateUpdates = [
    { id: 8, name: 'scrabsnap', estimate: '6.85' },
    { id: 9, name: 'budgetco', estimate: '6.85' },
    { id: 20, name: 'budgetco-db', estimate: '6.19' },
    { id: 36, name: 'infracost', estimate: '6.85' },
  ]

  for (const u of estimateUpdates) {
    const existing = await db.select().from(services).where(eq(services.id, u.id)).limit(1)
    if (existing.length === 0) {
      results.push(`SKIP: id=${u.id} (${u.name}) not found`)
      continue
    }
    if (existing[0]!.monthlyCostEstimate === u.estimate) {
      results.push(`SKIP: id=${u.id} (${u.name}) already at $${u.estimate}`)
      continue
    }
    await db.update(services).set({ monthlyCostEstimate: u.estimate }).where(eq(services.id, u.id))
    results.push(`UPDATED: id=${u.id} "${u.name}" estimate → $${u.estimate}`)
  }

  return { migrated: results }
})
