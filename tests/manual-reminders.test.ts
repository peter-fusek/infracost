import { describe, it, expect } from 'vitest'
import { MANUAL_PLATFORM_CONFIG } from '../server/utils/manual-platforms'

function computeDaysSince(lastDate: string | null, now: Date): number | null {
  if (!lastDate) return null
  return Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
}

interface Reminder {
  slug: string
  currentMonthRecorded: boolean
  daysSinceLastRecord: number | null
}

function sortReminders(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((a, b) => {
    if (a.currentMonthRecorded !== b.currentMonthRecorded) return a.currentMonthRecorded ? 1 : -1
    return (b.daysSinceLastRecord ?? 999) - (a.daysSinceLastRecord ?? 999)
  })
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

describe('MANUAL_PLATFORM_CONFIG', () => {
  it('has 3 manual platforms', () => {
    expect(Object.keys(MANUAL_PLATFORM_CONFIG)).toHaveLength(3)
  })

  it('has expected config for claude-max', () => {
    const config = MANUAL_PLATFORM_CONFIG['claude-max']
    expect(config.expectedAmount).toBe(467)
    expect(config.costType).toBe('subscription')
    expect(config.serviceName).toBe('Max Subscription (€180) + Extra Usage (~€250)')
  })

  it('returns undefined for unknown platform', () => {
    expect(MANUAL_PLATFORM_CONFIG['unknown']).toBeUndefined()
  })

  it('uses fallback for missing config', () => {
    const config = MANUAL_PLATFORM_CONFIG['nonexistent']
    expect(config?.expectedAmount ?? null).toBeNull()
    expect(config?.costType ?? 'subscription').toBe('subscription')
  })
})

describe('computeDaysSince', () => {
  it('returns 0 for same day', () => {
    const now = new Date('2026-03-27T12:00:00Z')
    expect(computeDaysSince('2026-03-27T00:00:00Z', now)).toBe(0)
  })

  it('returns 1 for yesterday', () => {
    const now = new Date('2026-03-27T12:00:00Z')
    expect(computeDaysSince('2026-03-26T12:00:00Z', now)).toBe(1)
  })

  it('returns 30 for a month ago', () => {
    const now = new Date('2026-03-30T12:00:00Z')
    expect(computeDaysSince('2026-02-28T12:00:00Z', now)).toBe(30)
  })

  it('returns null when no last date', () => {
    expect(computeDaysSince(null, new Date())).toBeNull()
  })

  it('floors fractional days', () => {
    const now = new Date('2026-03-27T23:00:00Z')
    expect(computeDaysSince('2026-03-26T01:00:00Z', now)).toBe(1) // 22 hours = 0.916 days → floors to 0? No, 46 hrs = 1.91 → 1
  })
})

describe('sortReminders', () => {
  it('puts unrecorded platforms first', () => {
    const reminders: Reminder[] = [
      { slug: 'a', currentMonthRecorded: true, daysSinceLastRecord: 10 },
      { slug: 'b', currentMonthRecorded: false, daysSinceLastRecord: 5 },
    ]
    const sorted = sortReminders(reminders)
    expect(sorted[0].slug).toBe('b')
    expect(sorted[1].slug).toBe('a')
  })

  it('sorts by daysSinceLastRecord descending within group', () => {
    const reminders: Reminder[] = [
      { slug: 'a', currentMonthRecorded: false, daysSinceLastRecord: 5 },
      { slug: 'b', currentMonthRecorded: false, daysSinceLastRecord: 30 },
      { slug: 'c', currentMonthRecorded: false, daysSinceLastRecord: 10 },
    ]
    const sorted = sortReminders(reminders)
    expect(sorted.map(r => r.slug)).toEqual(['b', 'c', 'a'])
  })

  it('treats null daysSinceLastRecord as 999 (most overdue)', () => {
    const reminders: Reminder[] = [
      { slug: 'a', currentMonthRecorded: false, daysSinceLastRecord: 30 },
      { slug: 'b', currentMonthRecorded: false, daysSinceLastRecord: null },
    ]
    const sorted = sortReminders(reminders)
    expect(sorted[0].slug).toBe('b') // null treated as 999 → most overdue
  })

  it('handles all recorded (sorted by days descending)', () => {
    const reminders: Reminder[] = [
      { slug: 'a', currentMonthRecorded: true, daysSinceLastRecord: 1 },
      { slug: 'b', currentMonthRecorded: true, daysSinceLastRecord: 20 },
    ]
    const sorted = sortReminders(reminders)
    expect(sorted[0].slug).toBe('b')
  })
})

describe('formatMonth', () => {
  it('formats as YYYY-MM', () => {
    expect(formatMonth(new Date(2026, 2, 27))).toBe('2026-03')
  })

  it('pads single-digit months', () => {
    expect(formatMonth(new Date(2026, 0, 1))).toBe('2026-01')
  })

  it('handles December', () => {
    expect(formatMonth(new Date(2026, 11, 31))).toBe('2026-12')
  })
})
