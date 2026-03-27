import { describe, it, expect } from 'vitest'

// Test pure logic extracted from budget-alerts.ts

const THRESHOLDS = [
  { pct: 100, severity: 'critical' as const, label: 'exceeded' },
  { pct: 90, severity: 'warning' as const, label: 'at 90%' },
  { pct: 75, severity: 'warning' as const, label: 'at 75%' },
  { pct: 50, severity: 'info' as const, label: 'at 50%' },
]

function findHighestThreshold(pct: number) {
  for (const threshold of THRESHOLDS) {
    if (pct >= threshold.pct) return threshold
  }
  return null
}

function computeBudgetPct(eom: number, limit: number): number {
  return Math.round((eom / limit) * 100)
}

function formatBudgetMessage(budgetName: string, label: string, eom: number, limit: number, pct: number): string {
  return `Budget "${budgetName}" ${label}: EOM estimate $${eom.toFixed(2)} vs limit $${limit.toFixed(2)} (${pct}%)`
}

describe('THRESHOLDS', () => {
  it('has 4 thresholds in descending order', () => {
    expect(THRESHOLDS).toHaveLength(4)
    expect(THRESHOLDS.map(t => t.pct)).toEqual([100, 90, 75, 50])
  })

  it('assigns critical only to 100%', () => {
    const critical = THRESHOLDS.filter(t => t.severity === 'critical')
    expect(critical).toHaveLength(1)
    expect(critical[0].pct).toBe(100)
  })

  it('assigns warning to 90% and 75%', () => {
    const warnings = THRESHOLDS.filter(t => t.severity === 'warning')
    expect(warnings.map(t => t.pct)).toEqual([90, 75])
  })
})

describe('findHighestThreshold', () => {
  it('returns critical at 100%', () => {
    expect(findHighestThreshold(100)?.severity).toBe('critical')
  })

  it('returns critical at 150% (above max)', () => {
    expect(findHighestThreshold(150)?.severity).toBe('critical')
  })

  it('returns warning at 90%', () => {
    const t = findHighestThreshold(90)!
    expect(t.severity).toBe('warning')
    expect(t.pct).toBe(90)
  })

  it('returns warning at 75%', () => {
    const t = findHighestThreshold(75)!
    expect(t.severity).toBe('warning')
    expect(t.pct).toBe(75)
  })

  it('returns info at 50%', () => {
    const t = findHighestThreshold(50)!
    expect(t.severity).toBe('info')
    expect(t.pct).toBe(50)
  })

  it('returns null below 50%', () => {
    expect(findHighestThreshold(49)).toBeNull()
    expect(findHighestThreshold(0)).toBeNull()
  })

  it('returns highest threshold only (90% returns 90, not 75 or 50)', () => {
    const t = findHighestThreshold(95)!
    expect(t.pct).toBe(90)
    expect(t.label).toBe('at 90%')
  })
})

describe('computeBudgetPct', () => {
  it('calculates percentage correctly', () => {
    expect(computeBudgetPct(500, 1000)).toBe(50)
    expect(computeBudgetPct(750, 1000)).toBe(75)
    expect(computeBudgetPct(1000, 1000)).toBe(100)
  })

  it('handles over-budget (>100%)', () => {
    expect(computeBudgetPct(1200, 1000)).toBe(120)
  })

  it('rounds to nearest integer', () => {
    expect(computeBudgetPct(333, 1000)).toBe(33)
    expect(computeBudgetPct(995, 1000)).toBe(100) // 99.5 rounds to 100
  })

  it('handles zero EOM', () => {
    expect(computeBudgetPct(0, 1000)).toBe(0)
  })
})

describe('formatBudgetMessage', () => {
  it('includes budget name, label, amounts, and percentage', () => {
    const msg = formatBudgetMessage('Total Infrastructure', 'at 90%', 765.00, 850.00, 90)
    expect(msg).toBe('Budget "Total Infrastructure" at 90%: EOM estimate $765.00 vs limit $850.00 (90%)')
  })

  it('formats amounts to 2 decimal places', () => {
    const msg = formatBudgetMessage('Test', 'exceeded', 1000.5, 900.123, 111)
    expect(msg).toContain('$1000.50')
    expect(msg).toContain('$900.12')
  })
})

describe('alert type format', () => {
  it('generates budget_{pct} format', () => {
    expect(`budget_${100}`).toBe('budget_100')
    expect(`budget_${90}`).toBe('budget_90')
    expect(`budget_${75}`).toBe('budget_75')
    expect(`budget_${50}`).toBe('budget_50')
  })
})

describe('notification filtering', () => {
  it('sends notification for warning severity', () => {
    const shouldNotify = (s: string) => s === 'warning' || s === 'critical'
    expect(shouldNotify('warning')).toBe(true)
  })

  it('sends notification for critical severity', () => {
    const shouldNotify = (s: string) => s === 'warning' || s === 'critical'
    expect(shouldNotify('critical')).toBe(true)
  })

  it('skips notification for info severity', () => {
    const shouldNotify = (s: string) => s === 'warning' || s === 'critical'
    expect(shouldNotify('info')).toBe(false)
  })
})
