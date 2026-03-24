import { describe, it, expect } from 'vitest'
import { computeExpiryStatuses, FREE_TIER_EXPIRY } from '../server/utils/free-tier-expiry'

describe('FREE_TIER_EXPIRY', () => {
  it('has entries with required fields', () => {
    for (const item of FREE_TIER_EXPIRY) {
      expect(item.platform).toBeTruthy()
      expect(item.service).toBeTruthy()
      expect(item.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(item.description).toBeTruthy()
      expect(item.impact).toBeTruthy()
    }
  })
})

describe('computeExpiryStatuses', () => {
  it('marks past dates as expired', () => {
    const now = new Date('2026-07-01')
    const statuses = computeExpiryStatuses(now)

    // All current entries should be expired by July 2026
    for (const s of statuses) {
      expect(s.daysUntil).toBeLessThanOrEqual(0)
      expect(s.risk).toBe('expired')
    }
  })

  it('marks items expiring within 7 days as critical', () => {
    // Find an entry and test with a date 5 days before expiry
    const item = FREE_TIER_EXPIRY[0]
    const expiryDate = new Date(item.expiresAt)
    const fiveDaysBefore = new Date(expiryDate.getTime() - 5 * 86400000)

    const statuses = computeExpiryStatuses(fiveDaysBefore)
    const match = statuses.find(s => s.service === item.service)!

    expect(match.daysUntil).toBeGreaterThan(0)
    expect(match.daysUntil).toBeLessThanOrEqual(7)
    expect(match.risk).toBe('critical')
  })

  it('marks items expiring within 30 days as warning', () => {
    const item = FREE_TIER_EXPIRY[0]
    const expiryDate = new Date(item.expiresAt)
    const twentyDaysBefore = new Date(expiryDate.getTime() - 20 * 86400000)

    const statuses = computeExpiryStatuses(twentyDaysBefore)
    const match = statuses.find(s => s.service === item.service)!

    expect(match.daysUntil).toBeGreaterThan(7)
    expect(match.daysUntil).toBeLessThanOrEqual(30)
    expect(match.risk).toBe('warning')
  })

  it('marks items expiring in >30 days as ok', () => {
    const item = FREE_TIER_EXPIRY[0]
    const expiryDate = new Date(item.expiresAt)
    const sixtyDaysBefore = new Date(expiryDate.getTime() - 60 * 86400000)

    const statuses = computeExpiryStatuses(sixtyDaysBefore)
    const match = statuses.find(s => s.service === item.service)!

    expect(match.daysUntil).toBeGreaterThan(30)
    expect(match.risk).toBe('ok')
  })

  it('sorts by urgency (most urgent first)', () => {
    const statuses = computeExpiryStatuses()

    for (let i = 1; i < statuses.length; i++) {
      expect(statuses[i].daysUntil).toBeGreaterThanOrEqual(statuses[i - 1].daysUntil)
    }
  })
})
