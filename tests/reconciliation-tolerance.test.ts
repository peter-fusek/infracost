import { describe, it, expect } from 'vitest'

/**
 * Mirrors the tolerance math in server/services/reconciliation.ts classifyStatus.
 * Keep these in sync — if the service tolerances change, update both.
 */
const TOLERANCE_PCT = 0.02
const TOLERANCE_ABS = 1.00

function classify(costSum: number, invSum: number): string {
  if (invSum === 0 && costSum === 0) return 'match'
  if (invSum === 0) return 'no_invoice'
  if (costSum === 0) return 'no_records'
  const delta = costSum - invSum
  const tolerance = Math.max(TOLERANCE_ABS, invSum * TOLERANCE_PCT)
  if (Math.abs(delta) <= tolerance) return 'match'
  return delta > 0 ? 'over' : 'under'
}

describe('reconciliation classify', () => {
  it('empty-empty is match', () => {
    expect(classify(0, 0)).toBe('match')
  })

  it('records-only is no_invoice', () => {
    expect(classify(50, 0)).toBe('no_invoice')
  })

  it('invoice-only is no_records', () => {
    expect(classify(0, 50)).toBe('no_records')
  })

  it('exact match is match', () => {
    expect(classify(100, 100)).toBe('match')
  })

  it('within $1 absolute tolerance is match for small amounts', () => {
    expect(classify(5.5, 5)).toBe('match')
    expect(classify(4.5, 5)).toBe('match')
  })

  it('outside $1 absolute on small amount is mismatch', () => {
    expect(classify(6.5, 5)).toBe('over')
    expect(classify(3.5, 5)).toBe('under')
  })

  it('within 2% is match for large amounts', () => {
    expect(classify(509, 500)).toBe('match') // 1.8% over
    expect(classify(491, 500)).toBe('match') // 1.8% under
  })

  it('outside 2% on large amount is mismatch', () => {
    expect(classify(511, 500)).toBe('over') // 2.2%
    expect(classify(489, 500)).toBe('under') // 2.2%
  })

  it('picks larger of abs vs pct tolerance', () => {
    // $50 invoice: 2% = $1, abs floor = $1 → tolerance = max($1, $1) = $1
    expect(classify(51, 50)).toBe('match')
    expect(classify(52, 50)).toBe('over')
    // $500 invoice: 2% = $10, abs floor = $1 → tolerance = $10
    expect(classify(509, 500)).toBe('match')
    expect(classify(511, 500)).toBe('over')
  })
})
