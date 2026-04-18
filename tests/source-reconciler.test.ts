import { describe, it, expect } from 'vitest'
import { buildAlertType } from '../server/services/source-reconciler'

describe('buildAlertType', () => {
  it('composes expected format', () => {
    expect(buildAlertType('ga4', { kind: 'missing', slug: 'homegrif.com', upstreamId: '123', details: '' }))
      .toBe('source_drift_ga4_missing_homegrif.com')
  })

  it('truncates to alerts.alertType varchar(50)', () => {
    const longSlug = 'very-long-slug-that-would-overflow-the-alert-type-column'
    const out = buildAlertType('gsc', { kind: 'unknown', slug: longSlug, upstreamId: null, details: '' })
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.startsWith('source_drift_gsc_unknown_')).toBe(true)
  })

  it('differentiates missing vs unknown for same slug (so dedup does not collapse them)', () => {
    const missing = buildAlertType('ga4', { kind: 'missing', slug: 'foo', upstreamId: '1', details: '' })
    const unknown = buildAlertType('ga4', { kind: 'unknown', slug: 'foo', upstreamId: '1', details: '' })
    expect(missing).not.toBe(unknown)
  })
})
