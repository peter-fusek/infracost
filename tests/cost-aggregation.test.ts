import { describe, it, expect } from 'vitest'
import { EUR_USD_RATE, toEur } from '../server/utils/currency'

// Test the pure functions used in cost-aggregation
// We can't test getMTDSummary directly (needs DB), but we can test the logic

function isFixedCost(costType: string): boolean {
  return costType === 'subscription' || costType === 'one_time'
}

function computeEomEstimate(fixedMtd: number, usageMtd: number, progress: number): number {
  const usageProjected = progress > 0 ? usageMtd / progress : 0
  return fixedMtd + usageProjected
}

// Mirrors the actualMap merge in server/api/costs/breakdown.get.ts. Kept as a
// pure function so the mixed-costType guard can be tested without a DB fixture.
interface ActualRow { platformId: number; serviceId: number | null; total: string; count: number; costType: string; collectionMethod: string }
function buildActualMap(actuals: ActualRow[]) {
  const map = new Map<string, { total: number; count: number; costType: string; method: string; mixedCostType: boolean }>()
  for (const a of actuals) {
    const key = `${a.platformId}-${a.serviceId ?? 'platform'}`
    const existing = map.get(key)
    const total = parseFloat(a.total || '0')
    if (existing) {
      existing.total += total
      existing.count += a.count
      if (existing.costType !== a.costType) existing.mixedCostType = true
    }
    else {
      map.set(key, { total, count: a.count, costType: a.costType, method: a.collectionMethod, mixedCostType: false })
    }
  }
  return map
}

describe('toEur', () => {
  it('converts USD to EUR at current rate', () => {
    expect(toEur(100)).toBe(Math.round(100 * EUR_USD_RATE * 100) / 100)
    expect(toEur(10.50)).toBe(Math.round(10.50 * EUR_USD_RATE * 100) / 100)
    expect(toEur(0)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    expect(toEur(1.111)).toBe(Math.round(1.111 * EUR_USD_RATE * 100) / 100)
    expect(toEur(33.33)).toBe(Math.round(33.33 * EUR_USD_RATE * 100) / 100)
  })
})

describe('isFixedCost', () => {
  it('treats subscription as fixed', () => {
    expect(isFixedCost('subscription')).toBe(true)
  })

  it('treats one_time as fixed', () => {
    expect(isFixedCost('one_time')).toBe(true)
  })

  it('treats usage as variable', () => {
    expect(isFixedCost('usage')).toBe(false)
  })

  it('treats overage as variable', () => {
    expect(isFixedCost('overage')).toBe(false)
  })
})

describe('EOM projection', () => {
  it('projects usage costs based on month progress', () => {
    // 50% through the month, $10 usage so far → $20 projected
    const eom = computeEomEstimate(0, 10, 0.5)
    expect(eom).toBe(20)
  })

  it('does not project fixed costs', () => {
    // $100 fixed + $10 usage at 50% = $100 + $20 = $120
    const eom = computeEomEstimate(100, 10, 0.5)
    expect(eom).toBe(120)
  })

  it('handles zero progress (start of month)', () => {
    // At 0% progress, usage projection is 0
    const eom = computeEomEstimate(100, 0, 0)
    expect(eom).toBe(100)
  })

  it('handles 100% progress (end of month)', () => {
    // At 100%, projected = actual
    const eom = computeEomEstimate(50, 50, 1.0)
    expect(eom).toBe(100)
  })

  it('handles early month with small usage', () => {
    // 10% through month, $5 usage → $50 projected + $200 fixed
    const eom = computeEomEstimate(200, 5, 0.1)
    expect(eom).toBe(250)
  })
})

describe('budget percentage', () => {
  it('calculates budget used percentage', () => {
    const budgetLimit = 550
    const eomEstimate = 506
    const pct = Math.round((eomEstimate / budgetLimit) * 100)
    expect(pct).toBe(92)
  })

  it('handles zero budget gracefully', () => {
    const budgetLimit = 0
    const pct = budgetLimit > 0 ? Math.round((100 / budgetLimit) * 100) : 0
    expect(pct).toBe(0)
  })
})

describe('buildActualMap — mixed costType guard (#89 follow-up)', () => {
  it('merges same-costType records without flagging mixed', () => {
    const map = buildActualMap([
      { platformId: 1, serviceId: 10, total: '5.00', count: 1, costType: 'usage', collectionMethod: 'api' },
      { platformId: 1, serviceId: 10, total: '3.00', count: 1, costType: 'usage', collectionMethod: 'api' },
    ])
    const entry = map.get('1-10')
    expect(entry?.total).toBe(8)
    expect(entry?.mixedCostType).toBe(false)
  })

  it('flags mixed when subscription + usage land on the same (platform, service) key', () => {
    const map = buildActualMap([
      { platformId: 1, serviceId: 10, total: '100.00', count: 1, costType: 'subscription', collectionMethod: 'api' },
      { platformId: 1, serviceId: 10, total: '50.00', count: 1, costType: 'usage', collectionMethod: 'api' },
    ])
    const entry = map.get('1-10')
    expect(entry?.total).toBe(150)
    expect(entry?.mixedCostType).toBe(true)
  })

  it('keeps the first-seen costType on the merged entry (first-writer-wins for the label)', () => {
    const map = buildActualMap([
      { platformId: 1, serviceId: 10, total: '100.00', count: 1, costType: 'subscription', collectionMethod: 'api' },
      { platformId: 1, serviceId: 10, total: '50.00', count: 1, costType: 'usage', collectionMethod: 'api' },
    ])
    // The label is not load-bearing once mixedCostType=true — isFixed falls back to false.
    expect(map.get('1-10')?.costType).toBe('subscription')
  })

  it('downstream isFixed check should return false when mixed, regardless of base costType', () => {
    const map = buildActualMap([
      { platformId: 1, serviceId: 10, total: '100.00', count: 1, costType: 'subscription', collectionMethod: 'api' },
      { platformId: 1, serviceId: 10, total: '50.00', count: 1, costType: 'usage', collectionMethod: 'api' },
    ])
    const actual = map.get('1-10')
    const isFixed = !actual?.mixedCostType && (actual?.costType === 'subscription' || actual?.costType === 'one_time')
    expect(isFixed).toBe(false) // prevents EOM under-predicting the usage component
  })

  it('still treats pure subscription as fixed (isFixed=true)', () => {
    const map = buildActualMap([
      { platformId: 1, serviceId: 10, total: '100.00', count: 1, costType: 'subscription', collectionMethod: 'api' },
    ])
    const actual = map.get('1-10')
    const isFixed = !actual?.mixedCostType && (actual?.costType === 'subscription' || actual?.costType === 'one_time')
    expect(isFixed).toBe(true)
  })
})
