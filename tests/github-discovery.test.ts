import { describe, it, expect, vi, beforeEach } from 'vitest'
import { discoverGitHubRepos } from '../server/services/github-discovery'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-repo',
    full_name: 'peter-fusek/test-repo',
    html_url: 'https://github.com/peter-fusek/test-repo',
    description: 'A test repo',
    language: 'TypeScript',
    archived: false,
    fork: false,
    private: false,
    pushed_at: '2026-03-20T10:00:00Z',
    updated_at: '2026-03-20T10:00:00Z',
    topics: [],
    default_branch: 'main',
    size: 500,
    ...overrides,
  }
}

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(data),
  })
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('discoverGitHubRepos', () => {
  it('classifies tracked vs untracked repos', async () => {
    // Setup: peter-fusek returns 2 repos, instarea-sk returns 1
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([
          makeRepo({ name: 'infra-cost-optimizer', full_name: 'peter-fusek/infra-cost-optimizer', html_url: 'https://github.com/peter-fusek/infra-cost-optimizer' }),
          makeRepo({ name: 'new-project', full_name: 'peter-fusek/new-project', html_url: 'https://github.com/peter-fusek/new-project' }),
        ])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([
          makeRepo({ name: 'oncoteam', full_name: 'instarea-sk/oncoteam', html_url: 'https://github.com/instarea-sk/oncoteam' }),
        ])
      }
      // Tree/languages endpoints return empty
      if (url.includes('/git/trees/')) {
        return mockResponse({ tree: [] })
      }
      if (url.includes('/languages')) {
        return mockResponse({ TypeScript: 50000, JavaScript: 5000 })
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [
      'https://github.com/peter-fusek/infra-cost-optimizer',
      'https://github.com/instarea-sk/oncoteam',
    ])

    expect(result.tracked).toHaveLength(2)
    expect(result.untracked).toHaveLength(1)
    expect(result.untracked[0].name).toBe('new-project')
    expect(result.totalRepos).toBe(3)
  })

  it('detects deployment indicators', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([makeRepo()])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([])
      }
      if (url.includes('/git/trees/')) {
        return mockResponse({
          tree: [
            { path: 'Dockerfile', type: 'blob' },
            { path: 'render.yaml', type: 'blob' },
            { path: 'src', type: 'tree' },
          ],
        })
      }
      if (url.includes('/languages')) {
        return mockResponse({ TypeScript: 80000 })
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [])

    expect(result.untracked).toHaveLength(1)
    expect(result.untracked[0].deploymentIndicators).toContain('Dockerfile')
    expect(result.untracked[0].deploymentIndicators).toContain('render.yaml')
    expect(result.untracked[0].hasDeployment).toBe(true)
  })

  it('detects tech stack from language stats', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([makeRepo()])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([])
      }
      if (url.includes('/git/trees/')) {
        return mockResponse({ tree: [] })
      }
      if (url.includes('/languages')) {
        return mockResponse({ TypeScript: 80000, Python: 15000, Shell: 2000 })
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [])

    expect(result.untracked[0].techStack).toContain('typescript')
    expect(result.untracked[0].techStack).toContain('python')
    // Shell is <5% so should be excluded
    expect(result.untracked[0].techStack).not.toContain('shell')
  })

  it('skips forks and ignored repos', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([
          makeRepo({ name: 'my-fork', fork: true }),
          makeRepo({ name: 'autoniq' }),
          makeRepo({ name: '.github' }),
          makeRepo({ name: 'real-project' }),
        ])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([])
      }
      if (url.includes('/git/trees/') || url.includes('/languages')) {
        return mockResponse(url.includes('/trees/') ? { tree: [] } : {})
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [])

    // Only real-project should come through
    expect(result.totalRepos).toBe(1)
    expect(result.untracked[0].name).toBe('real-project')
  })

  it('separates archived repos', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([
          makeRepo({ name: 'old-project', archived: true }),
          makeRepo({ name: 'active-project' }),
        ])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([])
      }
      if (url.includes('/git/trees/') || url.includes('/languages')) {
        return mockResponse(url.includes('/trees/') ? { tree: [] } : {})
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [])

    expect(result.archived).toHaveLength(1)
    expect(result.archived[0].name).toBe('old-project')
    expect(result.untracked).toHaveLength(1)
    expect(result.untracked[0].name).toBe('active-project')
  })

  it('handles API errors gracefully', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse(null, false) // 500 error
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([])
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [])

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('peter-fusek')
  })

  it('sorts untracked: deployment repos first, then by recency', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([
          makeRepo({ name: 'old-no-deploy', full_name: 'peter-fusek/old-no-deploy', html_url: 'https://github.com/peter-fusek/old-no-deploy', pushed_at: '2025-01-01T00:00:00Z' }),
          makeRepo({ name: 'new-no-deploy', full_name: 'peter-fusek/new-no-deploy', html_url: 'https://github.com/peter-fusek/new-no-deploy', pushed_at: '2026-03-20T00:00:00Z' }),
        ])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([
          makeRepo({ name: 'has-deploy', full_name: 'instarea-sk/has-deploy', html_url: 'https://github.com/instarea-sk/has-deploy', pushed_at: '2025-06-01T00:00:00Z' }),
        ])
      }
      if (url.includes('instarea-sk/has-deploy/git/trees/')) {
        return mockResponse({ tree: [{ path: 'Dockerfile', type: 'blob' }] })
      }
      if (url.includes('/git/trees/')) {
        return mockResponse({ tree: [] })
      }
      if (url.includes('/languages')) {
        return mockResponse({})
      }
      return mockResponse({})
    })

    const result = await discoverGitHubRepos('fake-token', [])

    expect(result.untracked[0].name).toBe('has-deploy') // deployment comes first
    expect(result.untracked[1].name).toBe('new-no-deploy') // then by recency
    expect(result.untracked[2].name).toBe('old-no-deploy')
  })

  it('normalizes repo URLs for matching (case, trailing slash)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/users/peter-fusek/repos')) {
        return mockResponse([
          makeRepo({ name: 'MyRepo', full_name: 'peter-fusek/MyRepo', html_url: 'https://github.com/peter-fusek/MyRepo' }),
        ])
      }
      if (url.includes('/orgs/instarea-sk/repos')) {
        return mockResponse([])
      }
      if (url.includes('/git/trees/') || url.includes('/languages')) {
        return mockResponse(url.includes('/trees/') ? { tree: [] } : {})
      }
      return mockResponse({})
    })

    // Registered with different casing + trailing slash
    const result = await discoverGitHubRepos('fake-token', [
      'https://github.com/Peter-Fusek/myrepo/',
    ])

    expect(result.tracked).toHaveLength(1)
    expect(result.untracked).toHaveLength(0)
  })
})
