import { eq } from 'drizzle-orm'
import { platforms, services, budgets, optimizations, projects } from '../db/schema'
import { platformSeed, serviceSeed, budgetSeed, optimizationSeed, projectSeed } from '../db/seed'

/** Seed platform and service inventory. Idempotent — skips existing records. */
export default defineEventHandler(async () => {
  const db = useDB()
  const results = { platforms: 0, services: 0, budgets: 0, optimizations: 0, projects: 0 }

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

  // Seed budgets (upsert — update limit if it changed)
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
    } else if (existing[0].monthlyLimit !== b.monthlyLimit) {
      await db.update(budgets).set({ monthlyLimit: b.monthlyLimit }).where(eq(budgets.id, existing[0].id))
      results.budgets++
    }
  }

  // Seed optimizations
  for (const o of optimizationSeed) {
    const existing = await db.select().from(optimizations)
      .where(eq(optimizations.title, o.title))
      .limit(1)
    if (existing.length === 0) {
      const platformId = platformMap.get(o.platformSlug)
      await db.insert(optimizations).values({
        title: o.title,
        description: o.description,
        platformId: platformId ?? null,
        estimatedSavings: o.estimatedSavings,
        effort: o.effort,
        suggestedBy: o.suggestedBy,
      })
      results.optimizations++
    }
  }

  // Seed projects
  for (const p of projectSeed) {
    const existing = await db.select().from(projects).where(eq(projects.slug, p.slug)).limit(1)
    if (existing.length === 0) {
      await db.insert(projects).values({
        slug: p.slug,
        name: p.name,
        description: p.description,
        repoUrl: p.repoUrl,
        productionUrl: p.productionUrl,
        techStack: p.techStack,
        status: p.status,
      })
      results.projects++
    }
  }

  return { seeded: results }
})
