import { describe, it, expect } from 'vitest'
import { getCurrentMonthRange, getMonthProgress } from '../server/collectors/base'

describe('getCurrentMonthRange', () => {
  it('returns start as 1st of current month', () => {
    const { start } = getCurrentMonthRange()
    expect(start.getDate()).toBe(1)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  it('returns end as last day of current month', () => {
    const { end } = getCurrentMonthRange()
    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    expect(end.getDate()).toBe(lastDay)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })

  it('start is before end', () => {
    const { start, end } = getCurrentMonthRange()
    expect(start.getTime()).toBeLessThan(end.getTime())
  })

  it('both are in the same month', () => {
    const { start, end } = getCurrentMonthRange()
    expect(start.getMonth()).toBe(end.getMonth())
    expect(start.getFullYear()).toBe(end.getFullYear())
  })
})

describe('getMonthProgress', () => {
  it('returns a value between 0 and 1', () => {
    const progress = getMonthProgress()
    expect(progress).toBeGreaterThan(0)
    expect(progress).toBeLessThanOrEqual(1)
  })

  it('equals currentDay / daysInMonth', () => {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const expected = now.getDate() / daysInMonth
    expect(getMonthProgress()).toBeCloseTo(expected, 5)
  })
})
