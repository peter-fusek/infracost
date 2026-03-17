import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useDB() {
  if (!_db) {
    const config = useRuntimeConfig()
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is not configured. Set it in your environment variables.')
    }
    _db = drizzle(config.databaseUrl, { schema })
  }
  return _db
}
