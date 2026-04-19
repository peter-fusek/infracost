import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Drizzle DB before importing the module under test.
// The module imports `useDB` as a Nuxt auto-import global, so we stub it.

interface Row { key: string, value: unknown, updated_at: Date }
const store = new Map<string, Row>()

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          const row = store.get('saving_mode')
          return row ? [row] : []
        },
      }),
    }),
  }),
  insert: () => ({
    values: (v: { key: string, value: unknown }) => ({
      onConflictDoUpdate: async ({ set }: { set: { value: unknown } }) => {
        store.set(v.key, { key: v.key, value: set.value, updated_at: new Date() })
      },
    }),
  }),
}

vi.stubGlobal('useDB', () => fakeDb)
vi.stubGlobal('useRuntimeConfig', () => ({ databaseUrl: 'stub' }))

// Import after stubs are in place so module-level code sees them.
const { getSavingMode, setSavingMode, _resetAppSettingsCacheForTests } = await import('../server/utils/app-settings')

describe('app-settings / saving mode', () => {
  beforeEach(() => {
    store.clear()
    _resetAppSettingsCacheForTests()
  })

  it('defaults to ON when no row exists', async () => {
    expect(await getSavingMode()).toBe(true)
  })

  it('returns stored false after setSavingMode(false)', async () => {
    await setSavingMode(false)
    _resetAppSettingsCacheForTests()
    expect(await getSavingMode()).toBe(false)
  })

  it('returns stored true after setSavingMode(true)', async () => {
    await setSavingMode(false)
    await setSavingMode(true)
    _resetAppSettingsCacheForTests()
    expect(await getSavingMode()).toBe(true)
  })

  it('caches reads within the TTL window', async () => {
    // First read populates cache with default (true).
    expect(await getSavingMode()).toBe(true)
    // Mutate the underlying store directly — if cache is honoured, this is invisible.
    store.set('saving_mode', { key: 'saving_mode', value: false, updated_at: new Date() })
    expect(await getSavingMode()).toBe(true)
  })

  it('setSavingMode invalidates cache so next read sees the new value', async () => {
    expect(await getSavingMode()).toBe(true)
    await setSavingMode(false)
    expect(await getSavingMode()).toBe(false)
  })
})
