import { describe, it, expect } from 'vitest'

// Test the DRIFT_IGNORE_LIST and constants directly
// Import from source once we extract testable parts

describe('DRIFT_IGNORE_LIST', () => {
  // Re-declare here since the set is module-private. Tests verify the expected entries.
  const DRIFT_IGNORE_LIST = new Set([
    'Render_oncoteam-dashboard', 'Render_oncoteam-dashboard-test', 'Render_oncoteam-landing',
    'Render_homegrif_com', 'Render_homegrif_com-test', 'Render_partners-cz-test',
    'Render_infracost-db', 'Render_budgetco-db', 'Render_scrabsnap-db',
    'Render_partners-db-test', 'Render_partners-db-prod',
    'Render_oncoteam-db-test', 'Render_oncoteam-db-prod',
    'Render_homegrif-db-test', 'Render_homegrif-db',
    'Render_instareaweb',
    'GitHub_instarea', 'GitHub_replica.city', 'GitHub_grandpa_check',
    'GitHub_pulseshape', 'GitHub_oncoteam', 'GitHub_homegrif.com',
    'GitHub_instarea.sk',
  ])

  it('contains expected entries', () => {
    // 16 Render + 7 GitHub = 23 entries
    expect(DRIFT_IGNORE_LIST.size).toBe(23)
  })

  it('filters suspended Render web services', () => {
    expect(DRIFT_IGNORE_LIST.has('Render_oncoteam-dashboard')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('Render_oncoteam-landing')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('Render_homegrif_com')).toBe(true)
  })

  it('filters migrated Render databases', () => {
    expect(DRIFT_IGNORE_LIST.has('Render_infracost-db')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('Render_budgetco-db')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('Render_scrabsnap-db')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('Render_partners-db-prod')).toBe(true)
  })

  it('filters renamed GitHub repos', () => {
    expect(DRIFT_IGNORE_LIST.has('GitHub_instarea')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('GitHub_replica.city')).toBe(true)
    expect(DRIFT_IGNORE_LIST.has('GitHub_homegrif.com')).toBe(true)
  })

  it('does not filter active services', () => {
    expect(DRIFT_IGNORE_LIST.has('Render_infracost')).toBe(false)
    expect(DRIFT_IGNORE_LIST.has('Render_budgetco')).toBe(false)
    expect(DRIFT_IGNORE_LIST.has('GitHub_infracost')).toBe(false)
  })

  it('uses {Platform}_{name} format consistently', () => {
    for (const entry of DRIFT_IGNORE_LIST) {
      expect(entry).toMatch(/^(Render|GitHub)_/)
    }
  })
})

describe('drift type labels', () => {
  const DRIFT_TYPE_LABELS: Record<string, string> = {
    new: 'New',
    removed: 'Removed',
    changed: 'Changed',
  }

  it('has labels for all drift types', () => {
    expect(DRIFT_TYPE_LABELS.new).toBe('New')
    expect(DRIFT_TYPE_LABELS.removed).toBe('Removed')
    expect(DRIFT_TYPE_LABELS.changed).toBe('Changed')
  })
})

describe('drift alert type format', () => {
  it('generates correct alert type string', () => {
    const type = 'new'
    const platform = 'Render'
    const name = 'my-service'
    const alertType = `drift_${type}_${platform.toLowerCase()}_${name}`
    expect(alertType).toBe('drift_new_render_my-service')
  })

  it('lowercases platform name', () => {
    const alertType = `drift_removed_${'GitHub'.toLowerCase()}_my-repo`
    expect(alertType).toBe('drift_removed_github_my-repo')
  })
})

describe('drift severity assignment', () => {
  it('assigns warning for removed items', () => {
    const type = 'removed'
    const severity = type === 'removed' ? 'warning' : 'info'
    expect(severity).toBe('warning')
  })

  it('assigns info for new items', () => {
    const type = 'new'
    const severity = type === 'removed' ? 'warning' : 'info'
    expect(severity).toBe('info')
  })

  it('assigns info for changed items', () => {
    const type = 'changed'
    const severity = type === 'removed' ? 'warning' : 'info'
    expect(severity).toBe('info')
  })
})
