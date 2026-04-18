import { describe, it, expect } from 'vitest'
import { ANALYTICS_CONFIG } from '../server/utils/analytics-config'

/**
 * Invariants for the analytics config shipped alongside #94.
 *
 * These tests exist so that the kind of silent-dedup bug spotted on 2026-04-17
 * (instarea.com and instarea.sk render identical GA4 stats because both point
 * at property 530091886) cannot regress without either:
 *   1. the duplicate being intentional and annotated (SHARED_GA4_PROPERTIES
 *      allow-list), or
 *   2. a failing CI run.
 *
 * The /analytics page shows a "shares GA4 with …" badge for entries in the
 * allow-list; anything outside the allow-list is a bug.
 */

// propertyId -> reason why duplication is intentional (same app serves multiple domains, etc.)
const SHARED_GA4_PROPERTIES: Record<string, string> = {
  '530091886': 'Same Railway app serves instarea.com + instarea.sk under one GA4 property',
}

const SHARED_GSC_SITES: Record<string, string> = {
  // intentionally empty — we don't currently expect any shared GSC sites
}

describe('ANALYTICS_CONFIG invariants', () => {
  it('has unique slugs (each config row represents one logical project)', () => {
    const slugs = ANALYTICS_CONFIG.map(c => c.slug)
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i)
    expect(dupes, `duplicate slugs: ${dupes.join(', ')}`).toEqual([])
  })

  it('has no unintended duplicate ga4PropertyId (silent-dedup would render identical stats)', () => {
    const seen = new Map<string, string[]>()
    for (const c of ANALYTICS_CONFIG) {
      if (!c.ga4PropertyId) continue
      const list = seen.get(c.ga4PropertyId) ?? []
      list.push(c.slug)
      seen.set(c.ga4PropertyId, list)
    }
    const unlistedDupes: string[] = []
    for (const [propId, slugs] of seen) {
      if (slugs.length <= 1) continue
      if (!SHARED_GA4_PROPERTIES[propId]) {
        unlistedDupes.push(`${propId} shared by ${slugs.join(', ')}`)
      }
    }
    expect(
      unlistedDupes,
      `duplicate ga4PropertyId without allow-list entry — add to SHARED_GA4_PROPERTIES if intentional:\n  ${unlistedDupes.join('\n  ')}`,
    ).toEqual([])
  })

  it('has no unintended duplicate gscSiteUrl', () => {
    const seen = new Map<string, string[]>()
    for (const c of ANALYTICS_CONFIG) {
      if (!c.gscSiteUrl) continue
      const list = seen.get(c.gscSiteUrl) ?? []
      list.push(c.slug)
      seen.set(c.gscSiteUrl, list)
    }
    const unlistedDupes: string[] = []
    for (const [url, slugs] of seen) {
      if (slugs.length <= 1) continue
      if (!SHARED_GSC_SITES[url]) {
        unlistedDupes.push(`${url} shared by ${slugs.join(', ')}`)
      }
    }
    expect(unlistedDupes).toEqual([])
  })

  it('every SHARED_GA4_PROPERTIES allow-list entry is actually shared in the config (stale entries get flagged)', () => {
    const propCounts = new Map<string, number>()
    for (const c of ANALYTICS_CONFIG) {
      if (!c.ga4PropertyId) continue
      propCounts.set(c.ga4PropertyId, (propCounts.get(c.ga4PropertyId) ?? 0) + 1)
    }
    const stale: string[] = []
    for (const [propId, reason] of Object.entries(SHARED_GA4_PROPERTIES)) {
      if ((propCounts.get(propId) ?? 0) < 2) {
        stale.push(`${propId} (${reason})`)
      }
    }
    expect(stale, `SHARED_GA4_PROPERTIES contains entries no longer shared — remove:\n  ${stale.join('\n  ')}`).toEqual([])
  })
})
