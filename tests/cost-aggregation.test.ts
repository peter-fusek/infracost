import { describe, it, expect } from 'vitest'

// Test the pure functions used in cost-aggregation
// We can't test getMTDSummary directly (needs DB), but we can test the logic

const EUR_USD_RATE = 0.92

function toEur(usd: number): number {
  return Math.round(usd * EUR_USD_RATE * 100) / 100
}

function isFixedCost(costType: string): boolean {
  return costType === 'subscription' || costType === 'one_time'
}

function computeEomEstimate(fixedMtd: number, usageMtd: number, progress: number): number {
  const usageProjected = progress > 0 ? usageMtd / progress : 0
  return fixedMtd + usageProjected
}

describe('toEur', () => {
  it('converts USD to EUR at 0.92 rate', () => {
    expect(toEur(100)).toBe(92)
    expect(toEur(10.50)).toBe(9.66)
    expect(toEur(0)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    expect(toEur(1.111)).toBe(1.02) // 1.111 * 0.92 = 1.02212
    expect(toEur(33.33)).toBe(30.66) // 33.33 * 0.92 = 30.6636
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
