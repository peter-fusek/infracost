import { describe, it, expect } from 'vitest'

// Test pure formatting logic from weekly-digest.ts

interface PlatformSpend {
  name: string
  mtd: number
  eom: number
}

function getTopPlatforms(platforms: PlatformSpend[], limit: number = 5): PlatformSpend[] {
  return [...platforms].sort((a, b) => b.mtd - a.mtd).slice(0, limit)
}

function formatDigestLine(platform: PlatformSpend): string {
  return `  • ${platform.name}: $${platform.mtd.toFixed(2)} MTD → $${platform.eom.toFixed(2)} EOM`
}

function computeBudgetSeverity(usedPct: number): 'warning' | 'info' {
  return usedPct >= 90 ? 'warning' : 'info'
}

function formatAlertLine(severity: string, message: string): string {
  return `  [${severity.toUpperCase()}] ${message}`
}

function computeMonthRange(now: Date): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { monthStart, monthEnd }
}

describe('getTopPlatforms', () => {
  const platforms: PlatformSpend[] = [
    { name: 'Render', mtd: 50, eom: 60 },
    { name: 'Claude Max', mtd: 196, eom: 196 },
    { name: 'Railway', mtd: 20, eom: 25 },
    { name: 'Anthropic', mtd: 65, eom: 80 },
    { name: 'Resend', mtd: 20, eom: 20 },
    { name: 'Websupport', mtd: 5, eom: 5 },
  ]

  it('returns top 5 sorted by MTD descending', () => {
    const top = getTopPlatforms(platforms)
    expect(top).toHaveLength(5)
    expect(top[0].name).toBe('Claude Max')
    expect(top[1].name).toBe('Anthropic')
    expect(top[2].name).toBe('Render')
  })

  it('excludes 6th platform', () => {
    const top = getTopPlatforms(platforms)
    expect(top.find(p => p.name === 'Websupport')).toBeUndefined()
  })

  it('handles fewer than 5 platforms', () => {
    const top = getTopPlatforms(platforms.slice(0, 3))
    expect(top).toHaveLength(3)
  })

  it('handles empty list', () => {
    expect(getTopPlatforms([])).toHaveLength(0)
  })
})

describe('formatDigestLine', () => {
  it('formats platform spend line with 2 decimals', () => {
    const line = formatDigestLine({ name: 'Render', mtd: 50.5, eom: 62.33 })
    expect(line).toBe('  • Render: $50.50 MTD → $62.33 EOM')
  })

  it('handles zero amounts', () => {
    const line = formatDigestLine({ name: 'UptimeRobot', mtd: 0, eom: 0 })
    expect(line).toBe('  • UptimeRobot: $0.00 MTD → $0.00 EOM')
  })
})

describe('computeBudgetSeverity', () => {
  it('returns warning at 90%', () => {
    expect(computeBudgetSeverity(90)).toBe('warning')
  })

  it('returns warning above 90%', () => {
    expect(computeBudgetSeverity(100)).toBe('warning')
    expect(computeBudgetSeverity(150)).toBe('warning')
  })

  it('returns info below 90%', () => {
    expect(computeBudgetSeverity(89)).toBe('info')
    expect(computeBudgetSeverity(50)).toBe('info')
    expect(computeBudgetSeverity(0)).toBe('info')
  })
})

describe('formatAlertLine', () => {
  it('uppercases severity', () => {
    expect(formatAlertLine('warning', 'Budget exceeded')).toBe('  [WARNING] Budget exceeded')
    expect(formatAlertLine('critical', 'Test alert')).toBe('  [CRITICAL] Test alert')
    expect(formatAlertLine('info', 'FYI')).toBe('  [INFO] FYI')
  })
})

describe('computeMonthRange', () => {
  it('returns first and last day of March 2026', () => {
    const { monthStart, monthEnd } = computeMonthRange(new Date(2026, 2, 15))
    expect(monthStart.getDate()).toBe(1)
    expect(monthStart.getMonth()).toBe(2)
    expect(monthEnd.getDate()).toBe(31)
    expect(monthEnd.getMonth()).toBe(2)
  })

  it('handles February non-leap (28 days)', () => {
    const { monthEnd } = computeMonthRange(new Date(2026, 1, 10))
    expect(monthEnd.getDate()).toBe(28)
  })

  it('handles February leap year (29 days)', () => {
    const { monthEnd } = computeMonthRange(new Date(2028, 1, 10))
    expect(monthEnd.getDate()).toBe(29)
  })

  it('handles December (31 days)', () => {
    const { monthStart, monthEnd } = computeMonthRange(new Date(2026, 11, 25))
    expect(monthStart.getMonth()).toBe(11)
    expect(monthEnd.getDate()).toBe(31)
  })
})
