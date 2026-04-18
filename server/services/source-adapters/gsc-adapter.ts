import type { AdapterResult, SourceAdapter, SourceDrift } from '../source-reconciler'
import { ANALYTICS_CONFIG } from '../../utils/analytics-config'
import { getAccessToken } from '../../utils/google-auth'
import { fetchWithRetry } from '../../utils/retry'

/**
 * GSC source adapter.
 * Lists all sites the service account is verified on via `webmasters.sites.list`,
 * then diffs against ANALYTICS_CONFIG `gscSiteUrl` values.
 *
 * Drift kinds emitted:
 *   missing — config has a gscSiteUrl that is not returned by sites.list
 *             (permission revoked, domain verification lost, or site no longer exists)
 *   unknown — sites.list returns a URL not referenced in any config entry
 *             (new site likely needs adding; unused stale permission candidate)
 */

const GSC_API = 'https://www.googleapis.com/webmasters/v3/sites'

interface GSCSiteEntry {
  siteUrl?: string
  permissionLevel?: string // siteOwner | siteFullUser | siteRestrictedUser | siteUnverifiedUser
}

interface GSCSitesResponse {
  siteEntry?: GSCSiteEntry[]
}

export interface UpstreamGSCSite {
  siteUrl: string
  permissionLevel: string
}

export async function fetchLiveGSCSites(): Promise<{ sites: UpstreamGSCSite[]; fatal: string | null; errors: string[] }> {
  const token = await getAccessToken()
  if (!token) {
    return { sites: [], fatal: 'No GCP service account configured (GCP_SERVICE_ACCOUNT_JSON missing)', errors: [] }
  }

  const response = await fetchWithRetry(GSC_API, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }, { label: 'gsc/sites.list' })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { sites: [], fatal: `GSC API ${response.status}: ${body.slice(0, 200)}`, errors: [] }
  }

  const data = await response.json() as GSCSitesResponse
  const errors: string[] = []
  const sites: UpstreamGSCSite[] = []

  for (const entry of data.siteEntry ?? []) {
    if (!entry.siteUrl) {
      errors.push(`malformed site entry: ${JSON.stringify(entry)}`)
      continue
    }
    sites.push({
      siteUrl: entry.siteUrl,
      permissionLevel: entry.permissionLevel ?? 'unknown',
    })
  }

  return { sites, fatal: null, errors }
}

/**
 * Normalise a GSC site URL for equality comparison.
 * GSC returns URL-prefix sites with a trailing slash (`https://infracost.eu/`)
 * while config often omits it (`https://infracost.eu`). Treat them as equal.
 * `sc-domain:` entries are left untouched.
 */
export function normaliseGscUrl(url: string): string {
  if (url.startsWith('sc-domain:')) return url
  return url.replace(/\/+$/, '')
}

export function diffGSC(
  config: typeof ANALYTICS_CONFIG,
  upstream: UpstreamGSCSite[],
): SourceDrift[] {
  const drifts: SourceDrift[] = []
  const upstreamByNormalised = new Map(upstream.map(s => [normaliseGscUrl(s.siteUrl), s]))
  const configNormalised = new Set<string>()
  for (const entry of config) {
    if (entry.gscSiteUrl) configNormalised.add(normaliseGscUrl(entry.gscSiteUrl))
  }

  for (const entry of config) {
    if (!entry.gscSiteUrl) continue
    if (!upstreamByNormalised.has(normaliseGscUrl(entry.gscSiteUrl))) {
      drifts.push({
        kind: 'missing',
        slug: entry.slug,
        upstreamId: entry.gscSiteUrl,
        details: `config slug '${entry.slug}' points at GSC site '${entry.gscSiteUrl}', which is not returned by sites.list (permission revoked, verification lost, or site missing)`,
      })
    }
  }

  for (const site of upstream) {
    if (!configNormalised.has(normaliseGscUrl(site.siteUrl))) {
      drifts.push({
        kind: 'unknown',
        slug: site.siteUrl,
        upstreamId: site.siteUrl,
        details: `GSC site '${site.siteUrl}' (${site.permissionLevel}) exists upstream but is not referenced by any ANALYTICS_CONFIG entry — add or remove access`,
      })
    }
  }

  return drifts
}

export function createGSCAdapter(): SourceAdapter {
  return {
    name: 'gsc',
    displayName: 'Search Console',
    async reconcile(): Promise<AdapterResult> {
      const { sites, fatal, errors } = await fetchLiveGSCSites()
      if (fatal) return { drifts: [], errors, fatal }
      const drifts = diffGSC(ANALYTICS_CONFIG, sites)
      return { drifts, errors, fatal: null }
    },
  }
}
