import { sendWeeklyDigest } from '../services/weekly-digest'

export default defineTask({
  meta: {
    name: 'weekly-digest',
    description: 'Send weekly cost digest email',
  },
  async run() {
    try {
      const db = useDB()
      const config = useRuntimeConfig()
      const result = await sendWeeklyDigest(db, config as unknown as Record<string, string>)
      return { result }
    }
    catch (err) {
      console.error('[weekly-digest] Task failed:', err instanceof Error ? err.message : err)
      return { result: { error: err instanceof Error ? err.message : 'Unknown error' } }
    }
  },
})
