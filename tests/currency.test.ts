import { describe, it, expect } from 'vitest'
import { EUR_USD_RATE, toEur } from '../server/utils/currency'

describe('EUR_USD_RATE', () => {
  it('is a reasonable exchange rate', () => {
    expect(EUR_USD_RATE).toBeGreaterThan(0.5)
    expect(EUR_USD_RATE).toBeLessThan(1.5)
  })
})

describe('toEur', () => {
  it('converts USD to EUR', () => {
    expect(toEur(100)).toBe(Math.round(100 * EUR_USD_RATE * 100) / 100)
  })

  it('returns 0 for 0', () => {
    expect(toEur(0)).toBe(0)
  })

  it('handles small amounts without floating point errors', () => {
    const result = toEur(0.01)
    expect(result).toBe(Math.round(0.01 * EUR_USD_RATE * 100) / 100)
  })

  it('rounds to 2 decimal places', () => {
    const result = toEur(33.33)
    const str = result.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(2)
  })

  it('handles large amounts', () => {
    const result = toEur(10000)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(10000)
  })
})
