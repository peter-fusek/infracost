import { describe, it, expect } from 'vitest'
import { splitCostByWeights, splitCostByServiceCount } from '../server/utils/attribution'

describe('splitCostByWeights', () => {
  it('splits proportionally', () => {
    const weights = new Map([['a', 0.5], ['b', 0.3], ['c', 0.2]])
    const result = splitCostByWeights(100, weights)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ projectSlug: 'a', amount: 50 })
    expect(result[1]).toEqual({ projectSlug: 'b', amount: 30 })
    expect(result[2]).toEqual({ projectSlug: 'c', amount: 20 })
  })

  it('preserves total exactly when weights sum to 1', () => {
    const weights = new Map([['a', 0.5], ['b', 0.5]])
    const result = splitCostByWeights(100, weights)
    const total = result.reduce((s, r) => s + r.amount, 0)
    expect(total).toBe(100)
  })

  it('absorbs rounding remainder into last entry', () => {
    const weights = new Map([['a', 1 / 3], ['b', 1 / 3], ['c', 1 / 3]])
    const result = splitCostByWeights(100, weights)
    const total = result.reduce((s, r) => s + r.amount, 0)
    expect(Math.round(total * 10000) / 10000).toBe(100)
  })

  it('normalises weights that do not sum to 1', () => {
    const weights = new Map([['a', 2], ['b', 3]])
    const result = splitCostByWeights(100, weights)
    expect(result[0]!.amount).toBeCloseTo(40, 4)
    expect(result[1]!.amount).toBeCloseTo(60, 4)
  })

  it('returns empty when weights is empty', () => {
    expect(splitCostByWeights(100, new Map())).toEqual([])
  })

  it('returns empty when weights sum to 0', () => {
    const weights = new Map([['a', 0], ['b', 0]])
    expect(splitCostByWeights(100, weights)).toEqual([])
  })

  it('handles zero total cleanly', () => {
    const weights = new Map([['a', 0.5], ['b', 0.5]])
    const result = splitCostByWeights(0, weights)
    expect(result.every(r => r.amount === 0)).toBe(true)
  })

  it('handles single-project case', () => {
    const weights = new Map([['solo', 1]])
    const result = splitCostByWeights(42.5, weights)
    expect(result).toEqual([{ projectSlug: 'solo', amount: 42.5 }])
  })
})

describe('splitCostByServiceCount', () => {
  it('splits by service count', () => {
    const services = [
      { project: 'a' }, { project: 'a' }, { project: 'a' },
      { project: 'b' },
    ]
    const result = splitCostByServiceCount(100, services)
    expect(result).toHaveLength(2)
    const a = result.find(r => r.projectSlug === 'a')
    const b = result.find(r => r.projectSlug === 'b')
    expect(a!.amount).toBeCloseTo(75, 4)
    expect(b!.amount).toBeCloseTo(25, 4)
  })

  it('excludes null-project services', () => {
    const services = [
      { project: 'a' }, { project: null }, { project: null },
    ]
    const result = splitCostByServiceCount(100, services)
    expect(result).toEqual([{ projectSlug: 'a', amount: 100 }])
  })

  it('returns empty when no projected services', () => {
    expect(splitCostByServiceCount(100, [{ project: null }])).toEqual([])
    expect(splitCostByServiceCount(100, [])).toEqual([])
  })

  it('preserves total on even split', () => {
    const services = [{ project: 'a' }, { project: 'b' }, { project: 'c' }, { project: 'd' }]
    const result = splitCostByServiceCount(100, services)
    const total = result.reduce((s, r) => s + r.amount, 0)
    expect(Math.round(total * 10000) / 10000).toBe(100)
  })
})
