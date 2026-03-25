const REPO = 'peter-fusek/infra-cost-optimizer'

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  return $fetch<T>(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
}

export default defineCachedEventHandler(async () => {
  const config = useRuntimeConfig()
  const token = config.githubToken as string
  const errors: string[] = []

  if (!token) {
    return { errors: ['GITHUB_TOKEN not configured'] }
  }

  const headers = githubHeaders(token)

  // Parallel fetch: repo metadata, branches, clones, views
  const [repoResult, branchesResult, clonesResult, viewsResult] = await Promise.allSettled([
    fetchJson<any>(`https://api.github.com/repos/${REPO}`, headers),
    fetchJson<any[]>(`https://api.github.com/repos/${REPO}/branches?per_page=100`, headers),
    fetchJson<any>(`https://api.github.com/repos/${REPO}/traffic/clones`, headers),
    fetchJson<any>(`https://api.github.com/repos/${REPO}/traffic/views`, headers),
  ])

  const repo = repoResult.status === 'fulfilled' ? repoResult.value : null
  if (repoResult.status === 'rejected') errors.push(`Repo: ${repoResult.reason?.message || 'failed'}`)

  const branches = branchesResult.status === 'fulfilled' ? branchesResult.value : []
  if (branchesResult.status === 'rejected') errors.push(`Branches: ${branchesResult.reason?.message || 'failed'}`)

  const clones = clonesResult.status === 'fulfilled' ? clonesResult.value : null
  if (clonesResult.status === 'rejected') errors.push(`Clones: ${clonesResult.reason?.message || 'failed'}`)

  const views = viewsResult.status === 'fulfilled' ? viewsResult.value : null
  if (viewsResult.status === 'rejected') errors.push(`Views: ${viewsResult.reason?.message || 'failed'}`)

  return {
    stars: repo?.stargazers_count ?? 0,
    forks: repo?.forks_count ?? 0,
    watchers: repo?.subscribers_count ?? 0,
    openIssues: repo?.open_issues_count ?? 0,
    defaultBranch: repo?.default_branch ?? 'main',
    sizeKb: repo?.size ?? 0,
    language: repo?.language ?? null,
    pushedAt: repo?.pushed_at ?? null,
    branchCount: branches.length,
    clones14d: clones?.count ?? 0,
    clonesUnique14d: clones?.uniques ?? 0,
    views14d: views?.count ?? 0,
    viewsUnique14d: views?.uniques ?? 0,
    errors,
    fetchedAt: new Date().toISOString(),
  }
}, { maxAge: 300 })
