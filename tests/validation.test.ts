import { describe, it, expect, vi } from 'vitest'
import { parseAmount, parsePagination, VALID_COST_TYPES } from '../server/utils/validation'

// Mock createError since it's a Nuxt auto-import
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

describe('parseAmount', () => {
  it('parses valid positive numbers', () => {
    expect(parseAmount(42)).toBe(42)
    expect(parseAmount('3.50')).toBe(3.5)
    expect(parseAmount(0)).toBe(0)
  })

  it('rejects negative numbers', () => {
    expect(() => parseAmount(-1)).toThrow('non-negative')
  })

  it('rejects NaN values', () => {
    expect(() => parseAmount('abc')).toThrow('non-negative')
    expect(() => parseAmount(undefined)).toThrow('non-negative')
  })

  it('treats null as 0 (valid)', () => {
    expect(parseAmount(null)).toBe(0)
  })

  it('rejects Infinity', () => {
    expect(() => parseAmount(Infinity)).toThrow('non-negative')
  })
})

describe('parsePagination', () => {
  it('returns defaults when no query params', () => {
    const result = parsePagination({})
    expect(result.limit).toBe(100)
    expect(result.offset).toBe(0)
  })

  it('parses valid limit and offset', () => {
    const result = parsePagination({ limit: '25', offset: '50' })
    expect(result.limit).toBe(25)
    expect(result.offset).toBe(50)
  })

  it('caps limit at 500', () => {
    expect(parsePagination({ limit: '999' }).limit).toBe(500)
  })

  it('falls back to default for zero/negative limit (JS || treats 0 as falsy)', () => {
    expect(parsePagination({ limit: '0' }).limit).toBe(100) // 0 || 100 = 100
    expect(parsePagination({ limit: '-5' }).limit).toBe(1)  // -5 || 100 = -5, then Math.max(-5, 1) = 1
  })

  it('enforces minimum offset of 0', () => {
    expect(parsePagination({ offset: '-10' }).offset).toBe(0)
  })

  it('accepts custom default limit', () => {
    expect(parsePagination({}, 50).limit).toBe(50)
  })
})

describe('VALID_COST_TYPES', () => {
  it('has 4 cost types', () => {
    expect(VALID_COST_TYPES).toHaveLength(4)
    expect(VALID_COST_TYPES).toContain('subscription')
    expect(VALID_COST_TYPES).toContain('usage')
    expect(VALID_COST_TYPES).toContain('overage')
    expect(VALID_COST_TYPES).toContain('one_time')
  })
})
