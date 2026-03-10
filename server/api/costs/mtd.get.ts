import { getMTDSummary } from '../../services/cost-aggregation'

export default defineEventHandler(async () => {
  const db = useDB()
  return getMTDSummary(db)
})
