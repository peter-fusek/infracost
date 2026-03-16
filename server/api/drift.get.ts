import { detectDrift } from '../services/drift-detector'

export default defineEventHandler(async () => {
  const db = useDB()
  const config = useRuntimeConfig()
  const drifts = await detectDrift(db, config as unknown as Record<string, string>)
  return { drifts, count: drifts.length, checkedAt: new Date().toISOString() }
})
