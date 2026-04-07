import { eq } from 'drizzle-orm'
import { projects } from '../../db/schema'

export default defineEventHandler(async (event) => {
  // One-off migration: rename project slug 'instarea' → 'instarea.com'
  // and merge cost records into instarea.sk where appropriate
  // DELETE THIS FILE after running

  const results: string[] = []

  // 1. Check if 'instarea' project exists
  const old = await db.select().from(projects).where(eq(projects.slug, 'instarea'))
  if (!old.length) {
    return { status: 'skipped', message: 'No project with slug "instarea" found — already migrated?' }
  }

  const oldProject = old[0]
  results.push(`Found project: ${oldProject.slug} (id=${oldProject.id})`)

  // 2. Check if 'instarea.com' already exists
  const existing = await db.select().from(projects).where(eq(projects.slug, 'instarea.com'))
  if (existing.length) {
    return { status: 'error', message: 'Project "instarea.com" already exists — manual resolution needed' }
  }

  // 3. Rename the slug
  await db.update(projects).set({ slug: 'instarea.com', name: 'Instarea.com' }).where(eq(projects.id, oldProject.id))
  results.push('Renamed project slug: instarea → instarea.com')

  return { status: 'done', results }
})
