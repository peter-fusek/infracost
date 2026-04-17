import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * Anthropic Claude API cost collector.
 *
 * Uses the Admin API cost_report endpoint to pull actual billing data.
 * Endpoint: GET /v1/organizations/cost_report
 * Requires an Admin API key (sk-ant-admin-...).
 *
 * API contract (verified against docs 2026-04-17):
 * - `starting_at` / `ending_at` as RFC 3339 UTC timestamps (NOT YYYY-MM-DD)
 * - `group_by[]` accepts `workspace_id` and `description` (NOT `workspace`)
 * - Response: `{ data: [{ results: [{ amount: cents-string, currency, ... }] }], has_more, next_page }`
 * - Prepaid credit balance is NOT exposed by any Admin API endpoint — must be tracked manually
 */

interface CostResultItem {
  amount: string // string cents, e.g. "12345" = $123.45
  currency: string
  cost_type?: string
  description?: string
  model?: string
  service_tier?: string
  token_type?: string
  context_window?: string
  workspace_id?: string | null
}

interface CostBucket {
  starting_at: string
  ending_at: string
  results: CostResultItem[]
}

interface CostReportResponse {
  data: CostBucket[]
  has_more: boolean
  next_page: string | null
}

interface UsageReportBucket {
  starting_at: string
  ending_at: string
  results: Array<{
    uncached_input_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    output_tokens?: number
    server_tool_use?: Record<string, number>
  }>
}

interface UsageReportResponse {
  data: UsageReportBucket[]
  has_more: boolean
  next_page: string | null
}

export function createAnthropicCollector(
  apiKey: string,
  platformId: number,
  serviceId?: number,
  workspaceServiceMap?: Map<string, number>,
): BaseCollector {
  return {
    platformSlug: 'anthropic',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []
      let accountIdentifier: string | undefined

      const startingAt = toRfc3339(periodStart)
      const endingAt = toRfc3339(periodEnd)

      const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }

      try {
        const buckets = await fetchAllPages<CostBucket>(
          'https://api.anthropic.com/v1/organizations/cost_report',
          { starting_at: startingAt, ending_at: endingAt, 'group_by[]': 'workspace_id' },
          headers,
          errors,
        )

        if (buckets === null) {
          // fetch-level failure already pushed to errors — bail out cleanly
          return { records, errors, accountIdentifier }
        }

        // Sum cents per workspace_id ('' = default/no workspace)
        const centsByWorkspace = new Map<string, number>()
        const workspaceIds = new Set<string>()
        for (const bucket of buckets) {
          for (const item of bucket.results) {
            const wsId = item.workspace_id ?? ''
            const cents = parseFloat(item.amount || '0')
            centsByWorkspace.set(wsId, (centsByWorkspace.get(wsId) ?? 0) + cents)
            if (item.workspace_id) workspaceIds.add(item.workspace_id)
          }
        }

        // Emit one record per workspace — linked to a per-workspace service row
        // via services.externalId, or fall back to default serviceId (Unallocated).
        // This is the attribution hook: as each project adds workspace_id tagging
        // and we seed a matching service row, that slice moves out of Unallocated.
        let totalCents = 0
        for (const [wsId, cents] of centsByWorkspace) {
          totalCents += cents
          const resolvedServiceId = workspaceServiceMap?.get(wsId) ?? serviceId
          records.push({
            platformId,
            serviceId: resolvedServiceId,
            recordDate: new Date(),
            periodStart,
            periodEnd,
            amount: (cents / 100).toFixed(4),
            currency: 'USD',
            costType: 'usage',
            collectionMethod: 'api',
            rawData: {
              source: 'cost_report',
              workspaceId: wsId || null,
              cents,
            },
          })
        }

        // If there were no buckets at all, emit a $0 placeholder so the run
        // registers as success and stale data gets cleared by dedup.
        if (records.length === 0) {
          records.push({
            platformId,
            serviceId,
            recordDate: new Date(),
            periodStart,
            periodEnd,
            amount: '0.0000',
            currency: 'USD',
            costType: 'usage',
            collectionMethod: 'api',
            rawData: { source: 'cost_report', empty: true },
          })
        }

        accountIdentifier = workspaceIds.size > 0 ? [...workspaceIds].join(', ') : undefined

        // Attach aggregate totals to the first record for audit purposes
        const firstRaw = records[0]!.rawData as Record<string, unknown>
        firstRaw.totalCents = totalCents
        firstRaw.workspaceIds = [...workspaceIds]

        // Enrich with token counts from usage_report (optional — don't fail the record if this fails)
        try {
          const usageBuckets = await fetchAllPages<UsageReportBucket>(
            'https://api.anthropic.com/v1/organizations/usage_report/messages',
            { starting_at: startingAt, ending_at: endingAt, bucket_width: '1d' },
            headers,
            errors,
          )
          if (usageBuckets && usageBuckets.length > 0) {
            let input = 0, output = 0, cacheRead = 0, cacheWrite = 0
            for (const b of usageBuckets) {
              for (const r of b.results) {
                input += (r.uncached_input_tokens ?? 0)
                output += (r.output_tokens ?? 0)
                cacheRead += (r.cache_read_input_tokens ?? 0)
                cacheWrite += (r.cache_creation_input_tokens ?? 0)
              }
            }
            const rawData = records[0]!.rawData as Record<string, unknown>
            rawData.tokens = { input, output, cacheRead, cacheWrite, total: input + output }
          }
        }
        catch (err) {
          errors.push(`Anthropic usage report failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      catch (err) {
        errors.push(`Anthropic collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors, accountIdentifier }
    },
  }
}

function toRfc3339(d: Date): string {
  // Anthropic requires minute/hour/day-aligned UTC — we use day alignment (00:00:00Z)
  const iso = d.toISOString()
  return iso.slice(0, 10) + 'T00:00:00Z'
}

async function fetchAllPages<T>(
  baseUrl: string,
  params: Record<string, string>,
  headers: Record<string, string>,
  errors: string[],
): Promise<T[] | null> {
  const all: T[] = []
  let pageToken: string | null = null
  let pages = 0
  const MAX_PAGES = 30

  do {
    const qs = new URLSearchParams(params)
    if (pageToken) qs.set('page', pageToken)
    const url = `${baseUrl}?${qs.toString()}`

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 401 || res.status === 403) {
        errors.push(`Anthropic Admin API: auth failed (${res.status}). Ensure ANTHROPIC_ADMIN_API_KEY is an Admin key (sk-ant-admin-...).`)
      }
      else if (res.status === 404) {
        errors.push(`Anthropic Admin API: endpoint not found (${res.status}). May need newer anthropic-version header.`)
      }
      else {
        errors.push(`Anthropic Admin API error ${res.status}: ${body.slice(0, 200)}`)
      }
      return null
    }

    const json = await res.json() as { data: T[]; has_more: boolean; next_page: string | null }
    if (Array.isArray(json.data)) all.push(...json.data)
    pageToken = json.has_more ? json.next_page : null
    pages++
  }
  while (pageToken && pages < MAX_PAGES)

  if (pageToken) {
    errors.push(`Anthropic Admin API: pagination cap hit (${MAX_PAGES} pages) — data may be truncated.`)
  }

  return all
}
