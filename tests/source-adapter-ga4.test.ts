import { describe, it, expect } from 'vitest'
import { diffGA4 } from '../server/services/source-adapters/ga4-adapter'
import type { UpstreamProperty } from '../server/services/source-adapters/ga4-adapter'

const upstream = (overrides: Partial<UpstreamProperty> & { id: string }): UpstreamProperty => ({
  displayName: overrides.id,
  accountId: '319689036',
  accountName: 'instarea',
  ...overrides,
})

describe('diffGA4', () => {
  it('flags config entry pointing at a deleted property as missing', () => {
    const config = [
      { slug: 'ghost', ga4PropertyId: '999', gscSiteUrl: null },
    ]
    const drifts = diffGA4(config, [upstream({ id: '111' })])
    const missing = drifts.filter(d => d.kind === 'missing')
    expect(missing).toHaveLength(1)
    expect(missing[0]?.slug).toBe('ghost')
    expect(missing[0]?.upstreamId).toBe('999')
  })

  it('flags upstream property with no config entry as unknown', () => {
    const config = [
      { slug: 'known', ga4PropertyId: '111', gscSiteUrl: null },
    ]
    const drifts = diffGA4(config, [
      upstream({ id: '111' }),
      upstream({ id: '222', displayName: 'orphan' }),
    ])
    const unknown = drifts.filter(d => d.kind === 'unknown')
    expect(unknown).toHaveLength(1)
    expect(unknown[0]?.upstreamId).toBe('222')
  })

  it('emits no drift when every config entry matches upstream', () => {
    const config = [
      { slug: 'a', ga4PropertyId: '1', gscSiteUrl: null },
      { slug: 'b', ga4PropertyId: '2', gscSiteUrl: null },
    ]
    const drifts = diffGA4(config, [upstream({ id: '1' }), upstream({ id: '2' })])
    expect(drifts).toHaveLength(0)
  })

  it('treats a shared property as matched (not unknown) when any config entry points at it', () => {
    const config = [
      { slug: 'instarea.com', ga4PropertyId: '530091886', gscSiteUrl: null },
      { slug: 'instarea.sk', ga4PropertyId: '530091886', gscSiteUrl: null },
    ]
    const drifts = diffGA4(config, [upstream({ id: '530091886', displayName: 'instarea.sk' })])
    // Sharing is a separate concern (covered by analytics-shared-detection); reconciler should
    // only emit 'unknown' when NO config entry references the upstream id.
    expect(drifts.filter(d => d.kind === 'unknown')).toHaveLength(0)
  })

  it('ignores config entries with null ga4PropertyId', () => {
    const config = [
      { slug: 'manual-only', ga4PropertyId: null, gscSiteUrl: 'https://x' },
    ]
    const drifts = diffGA4(config, [])
    expect(drifts).toHaveLength(0)
  })
})
