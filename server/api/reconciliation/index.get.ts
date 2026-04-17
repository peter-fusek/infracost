import { reconcileAll, findDuplicateCostRecords, findMissingPeriods } from '../../services/reconciliation'
import { EUR_USD_RATE, toEur } from '../../utils/currency'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const q = getQuery(event)
  const now = new Date()
  const year = q.year ? Number(q.year) : now.getUTCFullYear()
  const month = q.month ? Number(q.month) : now.getUTCMonth() + 1

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw createError({ statusCode: 400, message: 'invalid year/month' })
  }

  const [results, duplicates, missingPeriods] = await Promise.all([
    reconcileAll(db, year, month),
    findDuplicateCostRecords(db, year, month),
    findMissingPeriods(db, year, month),
  ])

  const grandCost = results.reduce((s, r) => s + r.costRecordsSum, 0)
  const grandInv = results.reduce((s, r) => s + r.invoicesSum, 0)
  const grandDelta = grandCost - grandInv

  return {
    year,
    month,
    results,
    duplicates,
    missingPeriods,
    grandCostRecordsUsd: Math.round(grandCost * 100) / 100,
    grandInvoicesUsd: Math.round(grandInv * 100) / 100,
    grandDeltaUsd: Math.round(grandDelta * 100) / 100,
    grandCostRecordsEur: toEur(grandCost),
    grandInvoicesEur: toEur(grandInv),
    grandDeltaEur: toEur(grandDelta),
    eurUsdRate: EUR_USD_RATE,
    matchCount: results.filter(r => r.status === 'match').length,
    mismatchCount: results.filter(r => r.status === 'over' || r.status === 'under').length,
    noInvoiceCount: results.filter(r => r.status === 'no_invoice').length,
    noRecordsCount: results.filter(r => r.status === 'no_records').length,
  }
})
