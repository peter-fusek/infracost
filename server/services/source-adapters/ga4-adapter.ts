import type { AdapterResult, SourceAdapter, SourceDrift } from '../source-reconciler'
import { ANALYTICS_CONFIG } from '../../utils/analytics-config'
import { getAccessToken } from '../../utils/google-auth'

/**
 * GA4 source adapter.
 * Lists all properties the service account has visibility into via
 * `analyticsadmin.accountSummaries.list`, then diffs against ANALYTICS_CONFIG.
 *
 * Drift kinds emitted:
 *   missing  — config has a ga4PropertyId that is not returned by accountSummaries
 *              (property deleted, moved to an account we can't see, or lost access)
 *   unknown  — accountSummaries returns a property id not referenced in any config entry
 *              (new property likely needs adding; older analytics cleanup candidate)
 */

const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries'

interface AccountSummary {
  name?: string
  account?: string
  displayName?: string
  propertySummaries?: Array<{
    property?: string       // "properties/530091886"
    displayName?: string    // "instarea.sk"
    propertyType?: string
    parent?: string         // "accounts/319689036"
  }>
}

interface AccountSummariesResponse {
  accountSummaries?: AccountSummary[]
  nextPageToken?: string
}

export interface UpstreamProperty {
  id: string            // numeric only, e.g. "530091886"
  displayName: string
  accountId: string     // numeric only, e.g. "319689036"
  accountName: string
}

export async function fetchLiveGA4Properties(): Promise<{ properties: UpstreamProperty[]; fatal: string | null; errors: string[] }> {
  const token = await getAccessToken()
  if (!token) {
    return { properties: [], fatal: 'No GCP service account configured (GCP_SERVICE_ACCOUNT_JSON missing)', errors: [] }
  }

  const properties: UpstreamProperty[] = []
  const errors: string[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(ADMIN_API)
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        properties: [],
        fatal: `GA4 Admin API ${response.status}: ${body.slice(0, 200)}`,
        errors,
      }
    }

    const data = await response.json() as AccountSummariesResponse

    for (const acct of data.accountSummaries ?? []) {
      const accountId = acct.account?.replace(/^accounts\//, '') ?? ''
      const accountName = acct.displayName ?? accountId
      for (const prop of acct.propertySummaries ?? []) {
        const id = prop.property?.replace(/^properties\//, '') ?? ''
        if (!id) {
          errors.push(`malformed property entry in account ${accountId}: ${JSON.stringify(prop)}`)
          continue
        }
        properties.push({
          id,
          displayName: prop.displayName ?? id,
          accountId,
          accountName,
        })
      }
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return { properties, fatal: null, errors }
}

export function diffGA4(
  config: typeof ANALYTICS_CONFIG,
  upstream: UpstreamProperty[],
): SourceDrift[] {
  const drifts: SourceDrift[] = []
  const upstreamById = new Map(upstream.map(p => [p.id, p]))
  const configByPropertyId = new Map<string, string[]>() // propertyId -> list of config slugs referencing it

  for (const entry of config) {
    if (!entry.ga4PropertyId) continue
    const list = configByPropertyId.get(entry.ga4PropertyId) ?? []
    list.push(entry.slug)
    configByPropertyId.set(entry.ga4PropertyId, list)
  }

  // missing: config references a propertyId that doesn't exist upstream
  for (const entry of config) {
    if (!entry.ga4PropertyId) continue
    if (!upstreamById.has(entry.ga4PropertyId)) {
      drifts.push({
        kind: 'missing',
        slug: entry.slug,
        upstreamId: entry.ga4PropertyId,
        details: `config slug '${entry.slug}' points at GA4 property ${entry.ga4PropertyId}, which is not returned by accountSummaries.list (deleted, moved, or no access)`,
      })
    }
  }

  // unknown: upstream property that no config entry references
  for (const prop of upstream) {
    if (!configByPropertyId.has(prop.id)) {
      drifts.push({
        kind: 'unknown',
        slug: prop.displayName || prop.id,
        upstreamId: prop.id,
        details: `GA4 property '${prop.displayName}' (${prop.id}, account ${prop.accountName}) exists upstream but is not referenced by any ANALYTICS_CONFIG entry — add or trash`,
      })
    }
  }

  return drifts
}

export function createGA4Adapter(): SourceAdapter {
  return {
    name: 'ga4',
    displayName: 'GA4',
    async reconcile(): Promise<AdapterResult> {
      const { properties, fatal, errors } = await fetchLiveGA4Properties()
      if (fatal) return { drifts: [], errors, fatal }
      const drifts = diffGA4(ANALYTICS_CONFIG, properties)
      return { drifts, errors, fatal: null }
    },
  }
}
