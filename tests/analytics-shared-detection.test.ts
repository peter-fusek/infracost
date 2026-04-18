import { describe, it, expect } from 'vitest'

// Mirrors the grouping logic in server/api/analytics/summary.get.ts
// Kept as a pure function so we can assert the shared-detection invariant
// without standing up a full Nitro + DB test harness.
function detectShared(projects: Array<{ slug: string; ga4PropertyId: string | null; gscSiteUrl: string | null }>) {
  const ga4Groups = new Map<string, string[]>()
  const gscGroups = new Map<string, string[]>()
  for (const p of projects) {
    if (p.ga4PropertyId) {
      const list = ga4Groups.get(p.ga4PropertyId) ?? []
      list.push(p.slug)
      ga4Groups.set(p.ga4PropertyId, list)
    }
    if (p.gscSiteUrl) {
      const list = gscGroups.get(p.gscSiteUrl) ?? []
      list.push(p.slug)
      gscGroups.set(p.gscSiteUrl, list)
    }
  }
  return projects.map(p => ({
    slug: p.slug,
    sharedGa4With: p.ga4PropertyId ? (ga4Groups.get(p.ga4PropertyId) ?? []).filter(s => s !== p.slug) : [],
    sharedGscWith: p.gscSiteUrl ? (gscGroups.get(p.gscSiteUrl) ?? []).filter(s => s !== p.slug) : [],
  }))
}

describe('analytics shared-property detection', () => {
  it('flags two slugs sharing the same GA4 property', () => {
    const result = detectShared([
      { slug: 'instarea.com', ga4PropertyId: '530091886', gscSiteUrl: 'sc-domain:instarea.com' },
      { slug: 'instarea.sk', ga4PropertyId: '530091886', gscSiteUrl: 'sc-domain:instarea.sk' },
    ])
    expect(result[0]?.sharedGa4With).toEqual(['instarea.sk'])
    expect(result[1]?.sharedGa4With).toEqual(['instarea.com'])
    expect(result[0]?.sharedGscWith).toEqual([])
    expect(result[1]?.sharedGscWith).toEqual([])
  })

  it('returns empty arrays when every property is unique', () => {
    const result = detectShared([
      { slug: 'a', ga4PropertyId: '111', gscSiteUrl: 'https://a' },
      { slug: 'b', ga4PropertyId: '222', gscSiteUrl: 'https://b' },
    ])
    expect(result[0]?.sharedGa4With).toEqual([])
    expect(result[1]?.sharedGa4With).toEqual([])
  })

  it('ignores null property IDs', () => {
    const result = detectShared([
      { slug: 'a', ga4PropertyId: null, gscSiteUrl: null },
      { slug: 'b', ga4PropertyId: null, gscSiteUrl: null },
    ])
    expect(result[0]?.sharedGa4With).toEqual([])
    expect(result[1]?.sharedGscWith).toEqual([])
  })

  it('flags shared GSC site even when GA4 is distinct', () => {
    const result = detectShared([
      { slug: 'main', ga4PropertyId: '1', gscSiteUrl: 'sc-domain:shared' },
      { slug: 'mirror', ga4PropertyId: '2', gscSiteUrl: 'sc-domain:shared' },
    ])
    expect(result[0]?.sharedGscWith).toEqual(['mirror'])
    expect(result[1]?.sharedGscWith).toEqual(['main'])
    expect(result[0]?.sharedGa4With).toEqual([])
  })

  it('handles three-way sharing (all siblings surfaced)', () => {
    const result = detectShared([
      { slug: 'a', ga4PropertyId: 'X', gscSiteUrl: null },
      { slug: 'b', ga4PropertyId: 'X', gscSiteUrl: null },
      { slug: 'c', ga4PropertyId: 'X', gscSiteUrl: null },
    ])
    expect(result[0]?.sharedGa4With.sort()).toEqual(['b', 'c'])
    expect(result[1]?.sharedGa4With.sort()).toEqual(['a', 'c'])
    expect(result[2]?.sharedGa4With.sort()).toEqual(['a', 'b'])
  })
})
