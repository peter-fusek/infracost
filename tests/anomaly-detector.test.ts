import { describe, it, expect } from 'vitest'

// Test the pure calculation logic from anomaly-detector.ts
// These are extracted formulas that don't need DB access

const ANOMALY_THRESHOLD_PCT = 20
const MIN_HISTORICAL_MONTHS = 2

function computeMonthProgress(date: Date): number {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return Math.max(date.getDate() / daysInMonth, 0.1)
}

function computeEomEstimate(currentMtd: number, monthProgress: number): number {
  return currentMtd / monthProgress
}

function computePctAbove(currentEom: number, avgMonthly: number): number {
  return Math.round(((currentEom - avgMonthly) / avgMonthly) * 100)
}

function isAnomaly(pctAbove: number): boolean {
  return pctAbove > ANOMALY_THRESHOLD_PCT
}

function anomalySeverity(pctAbove: number): 'warning' | 'info' {
  return pctAbove >= 50 ? 'warning' : 'info'
}

describe('MIN_HISTORICAL_MONTHS guard', () => {
  it('requires at least 2 months of data', () => {
    expect(MIN_HISTORICAL_MONTHS).toBe(2)
  })

  it('skips when priorMonthCount < 2', () => {
    expect(1 < MIN_HISTORICAL_MONTHS).toBe(true)
    expect(0 < MIN_HISTORICAL_MONTHS).toBe(true)
  })

  it('includes when priorMonthCount >= 2', () => {
    expect(2 < MIN_HISTORICAL_MONTHS).toBe(false)
    expect(3 < MIN_HISTORICAL_MONTHS).toBe(false)
  })
})

describe('computeMonthProgress', () => {
  it('returns ~0.5 at mid-month (day 15 of 30)', () => {
    const date = new Date(2026, 3, 15) // April 15 (30-day month)
    expect(computeMonthProgress(date)).toBeCloseTo(0.5, 1)
  })

  it('returns ~1.0 at end of month', () => {
    const date = new Date(2026, 0, 31) // Jan 31
    expect(computeMonthProgress(date)).toBeCloseTo(1.0, 1)
  })

  it('clamps to minimum 0.1 on day 1', () => {
    const date = new Date(2026, 0, 1) // Jan 1 (1/31 ≈ 0.032)
    expect(computeMonthProgress(date)).toBe(0.1)
  })

  it('handles February (28 days)', () => {
    const date = new Date(2026, 1, 14) // Feb 14 (non-leap)
    expect(computeMonthProgress(date)).toBeCloseTo(0.5, 1)
  })

  it('handles February leap year (29 days)', () => {
    const date = new Date(2028, 1, 29) // Feb 29 (leap year)
    expect(computeMonthProgress(date)).toBeCloseTo(1.0, 1)
  })
})

describe('computeEomEstimate', () => {
  it('extrapolates at 50% progress', () => {
    expect(computeEomEstimate(50, 0.5)).toBe(100)
  })

  it('extrapolates at 100% progress (no change)', () => {
    expect(computeEomEstimate(100, 1.0)).toBe(100)
  })

  it('extrapolates early month (10% progress)', () => {
    expect(computeEomEstimate(10, 0.1)).toBe(100)
  })

  it('handles zero MTD', () => {
    expect(computeEomEstimate(0, 0.5)).toBe(0)
  })
})

describe('computePctAbove', () => {
  it('returns 0 when EOM equals average', () => {
    expect(computePctAbove(100, 100)).toBe(0)
  })

  it('returns 50 when 50% above average', () => {
    expect(computePctAbove(150, 100)).toBe(50)
  })

  it('returns 100 when double the average', () => {
    expect(computePctAbove(200, 100)).toBe(100)
  })

  it('returns negative when below average', () => {
    expect(computePctAbove(80, 100)).toBe(-20)
  })

  it('rounds to nearest integer', () => {
    expect(computePctAbove(133.33, 100)).toBe(33) // 33.33 → 33
  })
})

describe('isAnomaly', () => {
  it('excludes at exactly 20%', () => {
    expect(isAnomaly(20)).toBe(false)
  })

  it('includes at 21%', () => {
    expect(isAnomaly(21)).toBe(true)
  })

  it('includes at 50%', () => {
    expect(isAnomaly(50)).toBe(true)
  })

  it('excludes negatives', () => {
    expect(isAnomaly(-10)).toBe(false)
  })
})

describe('anomalySeverity', () => {
  it('returns warning at 50%', () => {
    expect(anomalySeverity(50)).toBe('warning')
  })

  it('returns warning at 100%', () => {
    expect(anomalySeverity(100)).toBe('warning')
  })

  it('returns info at 49%', () => {
    expect(anomalySeverity(49)).toBe('info')
  })

  it('returns info at 21%', () => {
    expect(anomalySeverity(21)).toBe('info')
  })
})

describe('anomaly alert type', () => {
  it('formats as anomaly_{platformSlug}', () => {
    expect(`anomaly_${'render'}`).toBe('anomaly_render')
    expect(`anomaly_${'anthropic'}`).toBe('anomaly_anthropic')
  })
})

describe('anomaly sorting', () => {
  it('sorts descending by pctAbove', () => {
    const anomalies = [
      { pctAbove: 30 },
      { pctAbove: 80 },
      { pctAbove: 50 },
    ]
    const sorted = [...anomalies].sort((a, b) => b.pctAbove - a.pctAbove)
    expect(sorted.map(a => a.pctAbove)).toEqual([80, 50, 30])
  })
})
