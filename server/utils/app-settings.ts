import { eq, sql } from 'drizzle-orm'
import { appSettings } from '../db/schema'

const SAVING_MODE_KEY = 'saving_mode'
const CACHE_TTL_MS = 60_000

type Cache<T> = { value: T, expiresAt: number } | null
let savingModeCache: Cache<boolean> = null

// When no row exists (fresh deploy), the system defaults to saving mode ON.
// This preserves the invariant "new deployments do not fire autonomous work
// until a human explicitly turns it off".
const DEFAULT_SAVING_MODE = true

export function _resetAppSettingsCacheForTests() {
  savingModeCache = null
}

export async function getSavingMode(): Promise<boolean> {
  const now = Date.now()
  if (savingModeCache && savingModeCache.expiresAt > now) {
    return savingModeCache.value
  }

  const db = useDB()
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SAVING_MODE_KEY)).limit(1)
  const value = row ? Boolean(row.value) : DEFAULT_SAVING_MODE

  savingModeCache = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

export async function setSavingMode(on: boolean): Promise<void> {
  const db = useDB()
  await db.insert(appSettings)
    .values({ key: SAVING_MODE_KEY, value: on })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: on, updatedAt: sql`now()` },
    })
  savingModeCache = { value: on, expiresAt: Date.now() + CACHE_TTL_MS }
}
