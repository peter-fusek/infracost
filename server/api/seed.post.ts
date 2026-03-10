import { eq } from 'drizzle-orm'
import { platforms, services, budgets } from '../db/schema'
import { platformSeed, serviceSeed, budgetSeed } from '../db/seed'

/** Seed platform and service inventory. Idempotent — skips existing records. */
export default defineEventHandler(async () => {
  const db = useDB()
  const results = { platforms: 0, services: 0, budgets: 0 }

  // Seed platforms
  for (const p of platformSeed) {
    const existing = await db.select().from(platforms).where(eq(platforms.slug, p.slug)).limit(1)
    if (existing.length === 0) {
      await db.insert(platforms).values(p)
      results.platforms++
    }
  }

  // Get platform ID map
  const allPlatforms = await db.select().from(platforms)
  const platformMap = new Map(allPlatforms.map(p => [p.slug, p.id]))

  // Seed services
  for (const s of serviceSeed) {
    const platformId = platformMap.get(s.platformSlug)
    if (!platformId) continue

    const existing = await db.select().from(services)
      .where(eq(services.name, s.name))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(services).values({
        platformId,
        name: s.name,
        project: s.project,
        serviceType: s.serviceType,
        monthlyCostEstimate: s.monthlyCostEstimate,
      })
      results.services++
    }
  }

  // Seed budgets
  for (const b of budgetSeed) {
    const existing = await db.select().from(budgets)
      .where(eq(budgets.name, b.name))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(budgets).values({
        name: b.name,
        platformId: b.platformId,
        monthlyLimit: b.monthlyLimit,
      })
      results.budgets++
    }
  }

  return { seeded: results }
})
