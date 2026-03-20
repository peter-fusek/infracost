import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, formatUsage, formatLimit, extractUsage } from '../server/utils/plan-limits'

describe('PLAN_LIMITS', () => {
  it('defines limits for 6 platforms', () => {
    expect(Object.keys(PLAN_LIMITS)).toHaveLength(6)
    expect(PLAN_LIMITS).toHaveProperty('neon')
    expect(PLAN_LIMITS).toHaveProperty('turso')
    expect(PLAN_LIMITS).toHaveProperty('uptimerobot')
    expect(PLAN_LIMITS).toHaveProperty('resend')
    expect(PLAN_LIMITS).toHaveProperty('render')
    expect(PLAN_LIMITS).toHaveProperty('railway')
  })

  it('all limits have required fields', () => {
    for (const [slug, metrics] of Object.entries(PLAN_LIMITS)) {
      for (const [key, limit] of Object.entries(metrics)) {
        expect(limit.limit, `${slug}.${key}.limit`).toBeGreaterThan(0)
        expect(limit.unit, `${slug}.${key}.unit`).toBeTruthy()
        expect(limit.label, `${slug}.${key}.label`).toBeTruthy()
        expect(['month', 'day', 'total'], `${slug}.${key}.period`).toContain(limit.period)
      }
    }
  })
})

describe('formatUsage', () => {
  it('formats bytes', () => {
    expect(formatUsage(1024, 'bytes')).toBe('1 KiB')
    expect(formatUsage(1_048_576, 'bytes')).toBe('1.0 MiB')
    expect(formatUsage(1_073_741_824, 'bytes')).toBe('1.00 GiB')
    expect(formatUsage(5_368_709_120, 'bytes')).toBe('5.00 GiB')
  })

  it('formats seconds as hours', () => {
    expect(formatUsage(3600, 'seconds')).toBe('1.0h')
    expect(formatUsage(360_000, 'seconds')).toBe('100.0h')
  })

  it('formats rows with K/M suffixes', () => {
    expect(formatUsage(500, 'rows')).toBe('500')
    expect(formatUsage(1_500, 'rows')).toBe('2K')
    expect(formatUsage(1_500_000, 'rows')).toBe('1.5M')
    expect(formatUsage(500_000_000, 'rows')).toBe('500.0M')
  })

  it('formats USD', () => {
    expect(formatUsage(5, 'USD')).toBe('$5.00')
    expect(formatUsage(1.42, 'USD')).toBe('$1.42')
  })

  it('formats count and other units as plain string', () => {
    expect(formatUsage(50, 'count')).toBe('50')
    expect(formatUsage(500, 'minutes')).toBe('500')
  })
})

describe('formatLimit', () => {
  it('formats a PlanLimit using its unit', () => {
    expect(formatLimit({ limit: 360_000, unit: 'seconds', label: 'Compute Hours', period: 'month' })).toBe('100.0h')
    expect(formatLimit({ limit: 5, unit: 'USD', label: 'Credit', period: 'month' })).toBe('$5.00')
  })
})

describe('extractUsage', () => {
  it('extracts turso usage from rawData', () => {
    const raw = { rowsRead: 1000, rowsWritten: 50, storageBytes: 2048, databases: 3 }
    const usage = extractUsage('turso', raw)
    expect(usage.rows_read).toBe(1000)
    expect(usage.rows_written).toBe(50)
    expect(usage.storage_bytes).toBe(2048)
    expect(usage.databases).toBe(3)
  })

  it('returns null for missing turso fields', () => {
    const usage = extractUsage('turso', {})
    expect(usage.rows_read).toBeNull()
    expect(usage.rows_written).toBeNull()
    expect(usage.storage_bytes).toBeNull()
    expect(usage.databases).toBeNull()
  })

  it('extracts uptimerobot monitors', () => {
    expect(extractUsage('uptimerobot', { totalMonitors: 12 }).monitors).toBe(12)
    expect(extractUsage('uptimerobot', {}).monitors).toBeNull()
  })

  it('returns nulls for platforms without API usage data', () => {
    expect(extractUsage('resend', {}).emails_per_month).toBeNull()
    expect(extractUsage('render', {}).pipeline_minutes).toBeNull()
    expect(extractUsage('railway', {}).monthly_credit_usd).toBeNull()
  })

  it('returns empty object for unknown platform', () => {
    expect(extractUsage('unknown', {})).toEqual({})
  })

  it('extracts neon projects from limit field', () => {
    const usage = extractUsage('neon', { projectsLimit: 5, activeSecondsLimit: 360000 })
    expect(usage.projects).toBe(5)
    expect(usage.active_seconds).toBe(0) // hardcoded 0 — API doesn't expose actual usage
  })
})
