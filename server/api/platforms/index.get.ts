import { eq, isNull } from 'drizzle-orm'
import { platforms } from '../../db/schema'

export default defineEventHandler(async () => {
  const db = useDB()
  return db
    .select()
    .from(platforms)
    .where(eq(platforms.isActive, true))
    .orderBy(platforms.name)
})
