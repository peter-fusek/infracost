import { describe, it, expect } from 'vitest'
import { diffGSC } from '../server/services/source-adapters/gsc-adapter'
import type { UpstreamGSCSite } from '../server/services/source-adapters/gsc-adapter'

const upstream = (siteUrl: string, permissionLevel = 'siteOwner'): UpstreamGSCSite => ({ siteUrl, permissionLevel })

describe('diffGSC', () => {
  it('flags config entry whose site is not returned by sites.list', () => {
    const config = [
      { slug: 'infracost', ga4PropertyId: null, gscSiteUrl: 'https://infracost.eu' },
    ]
    const drifts = diffGSC(config, [upstream('https://other.example')])
    const missing = drifts.filter(d => d.kind === 'missing')
    expect(missing).toHaveLength(1)
    expect(missing[0]?.upstreamId).toBe('https://infracost.eu')
    expect(missing[0]?.slug).toBe('infracost')
  })

  it('flags site in sites.list that no config entry references', () => {
    const config = [
      { slug: 'infracost', ga4PropertyId: null, gscSiteUrl: 'https://infracost.eu' },
    ]
    const drifts = diffGSC(config, [
      upstream('https://infracost.eu'),
      upstream('sc-domain:unknown.example', 'siteFullUser'),
    ])
    const unknown = drifts.filter(d => d.kind === 'unknown')
    expect(unknown).toHaveLength(1)
    expect(unknown[0]?.slug).toBe('sc-domain:unknown.example')
  })

  it('emits no drift when every site matches', () => {
    const config = [
      { slug: 'a', ga4PropertyId: null, gscSiteUrl: 'sc-domain:a' },
      { slug: 'b', ga4PropertyId: null, gscSiteUrl: 'sc-domain:b' },
    ]
    const drifts = diffGSC(config, [upstream('sc-domain:a'), upstream('sc-domain:b')])
    expect(drifts).toHaveLength(0)
  })

  it('ignores config entries with null gscSiteUrl', () => {
    const config = [
      { slug: 'no-search-console', ga4PropertyId: '1', gscSiteUrl: null },
    ]
    const drifts = diffGSC(config, [])
    expect(drifts).toHaveLength(0)
  })
})
