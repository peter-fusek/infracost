/**
 * GitHub auto-discovery service.
 * Scans repos across configured GitHub accounts, detects deployment indicators
 * and tech stacks, then compares against the project registry to flag untracked repos.
 */

const GITHUB_ACCOUNTS = [
  { owner: 'peter-fusek', type: 'user' as const },
  { owner: 'instarea-sk', type: 'org' as const },
]

function githubHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

// Repos to skip — external/client projects not managed by us
const IGNORED_REPOS = new Set([
  'autoniq', 'osa', 'marketlocator', 'smartbill', 'servicehub',
  '.github', // org profile repo
])

// Files that indicate a deployable service
const DEPLOYMENT_INDICATORS = [
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'render.yaml',
  'railway.toml',
  'railway.json',
  'vercel.json',
  'fly.toml',
  'app.yaml',        // GCP App Engine
  'serverless.yml',
  'netlify.toml',
  'Procfile',         // Heroku / generic
] as const

// Map GitHub language stats to our tech stack labels
const LANGUAGE_MAP: Record<string, string> = {
  TypeScript: 'typescript',
  JavaScript: 'javascript',
  Python: 'python',
  Vue: 'vue',
  Ruby: 'ruby',
  Go: 'go',
  Rust: 'rust',
  Java: 'java',
  Shell: 'shell',
  HTML: 'html',
  CSS: 'css',
}

interface GitHubRepo {
  name: string
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  archived: boolean
  fork: boolean
  private: boolean
  pushed_at: string | null
  updated_at: string | null
  topics: string[]
  default_branch: string
  size: number // KB
}

export interface DiscoveredRepo {
  name: string
  fullName: string
  url: string
  description: string | null
  owner: string
  isPrivate: boolean
  isArchived: boolean
  primaryLanguage: string | null
  techStack: string[]
  deploymentIndicators: string[]
  hasDeployment: boolean
  lastPushed: string | null
  topics: string[]
  sizeKb: number
}

export interface DiscoveryResult {
  tracked: DiscoveredRepo[]
  untracked: DiscoveredRepo[]
  archived: DiscoveredRepo[]
  errors: string[]
  scannedAt: string
  totalRepos: number
}

async function fetchGitHubRepos(owner: string, type: 'user' | 'org', token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = []
  let page = 1
  const perPage = 100

  while (page <= 10) { // Cap at 1000 repos
    const endpoint = type === 'org'
      ? `https://api.github.com/orgs/${owner}/repos`
      : `https://api.github.com/users/${owner}/repos`

    const url = `${endpoint}?per_page=${perPage}&page=${page}&sort=pushed&direction=desc`
    const response = await fetch(url, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${response.statusText} for ${owner}`)
    }

    const data = await response.json() as GitHubRepo[]
    repos.push(...data)

    if (data.length < perPage) break
    page++
  }

  return repos
}

async function checkDeploymentIndicators(fullName: string, defaultBranch: string, token: string): Promise<string[]> {
  // Check root tree for deployment files in a single API call
  const url = `https://api.github.com/repos/${fullName}/git/trees/${defaultBranch}`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) return []

  const tree = await response.json() as { tree: Array<{ path: string; type: string }> }
  const rootFiles = new Set(tree.tree.filter(t => t.type === 'blob').map(t => t.path))

  return DEPLOYMENT_INDICATORS.filter(indicator => rootFiles.has(indicator))
}

async function detectTechStack(fullName: string, token: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${fullName}/languages`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) return []

  const languages = await response.json() as Record<string, number>
  const total = Object.values(languages).reduce((a, b) => a + b, 0)

  return Object.entries(languages)
    .filter(([lang, bytes]) => bytes / total > 0.05 && lang in LANGUAGE_MAP)
    .map(([lang]) => LANGUAGE_MAP[lang]!)
}

function normalizeRepoUrl(url: string): string {
  // Normalize to lowercase, strip trailing slashes and .git
  return url.toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '')
}

export async function discoverGitHubRepos(token: string, registeredRepoUrls: string[]): Promise<DiscoveryResult> {
  const errors: string[] = []
  const allRepos: DiscoveredRepo[] = []

  // Normalize registered URLs for matching
  const registeredSet = new Set(registeredRepoUrls.map(normalizeRepoUrl))

  // Fetch repos from all accounts
  for (const account of GITHUB_ACCOUNTS) {
    try {
      const repos = await fetchGitHubRepos(account.owner, account.type, token)

      for (const repo of repos) {
        // Skip ignored repos
        if (IGNORED_REPOS.has(repo.name.toLowerCase())) continue
        if (repo.fork) continue // Skip forks

        // Check deployment indicators (parallel-safe, one API call each)
        let deploymentIndicators: string[] = []
        let techStack: string[] = []

        try {
          // Only check non-archived, non-tiny repos for deployment/tech
          if (!repo.archived && repo.size > 0) {
            ;[deploymentIndicators, techStack] = await Promise.all([
              checkDeploymentIndicators(repo.full_name, repo.default_branch, token),
              detectTechStack(repo.full_name, token),
            ])
          }
        }
        catch (err) {
          errors.push(`Failed to inspect ${repo.full_name}: ${err instanceof Error ? err.message : String(err)}`)
        }

        allRepos.push({
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          description: repo.description,
          owner: account.owner,
          isPrivate: repo.private,
          isArchived: repo.archived,
          primaryLanguage: repo.language,
          techStack,
          deploymentIndicators,
          hasDeployment: deploymentIndicators.length > 0,
          lastPushed: repo.pushed_at,
          topics: repo.topics || [],
          sizeKb: repo.size,
        })
      }
    }
    catch (err) {
      errors.push(`Failed to fetch repos for ${account.owner}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Classify repos
  const tracked: DiscoveredRepo[] = []
  const untracked: DiscoveredRepo[] = []
  const archived: DiscoveredRepo[] = []

  for (const repo of allRepos) {
    if (repo.isArchived) {
      archived.push(repo)
      continue
    }

    const repoUrlNorm = normalizeRepoUrl(repo.url)
    if (registeredSet.has(repoUrlNorm)) {
      tracked.push(repo)
    }
    else {
      untracked.push(repo)
    }
  }

  // Sort untracked: repos with deployment indicators first, then by last push date
  untracked.sort((a, b) => {
    if (a.hasDeployment !== b.hasDeployment) return a.hasDeployment ? -1 : 1
    const dateA = a.lastPushed ? new Date(a.lastPushed).getTime() : 0
    const dateB = b.lastPushed ? new Date(b.lastPushed).getTime() : 0
    return dateB - dateA
  })

  return {
    tracked,
    untracked,
    archived,
    errors,
    scannedAt: new Date().toISOString(),
    totalRepos: allRepos.length,
  }
}
