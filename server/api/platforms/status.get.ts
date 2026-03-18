/**
 * Live API reachability check for all tracked platforms.
 * Fires parallel HEAD/GET probes with 5s timeout.
 * Cached for 5 minutes via Nitro defineCachedEventHandler.
 */

/** Platform API probe URLs — lightweight endpoints that confirm reachability */
const PLATFORM_PROBES: Record<string, { url: string; method?: string; headers?: Record<string, string> }> = {
  render: { url: 'https://api.render.com/v1/owners?limit=1' },
  railway: { url: 'https://backboard.railway.app/graphql/v2', method: 'POST' },
  anthropic: { url: 'https://api.anthropic.com/v1/models', headers: { 'x-api-key': 'probe', 'anthropic-version': '2023-06-01' } },
  neon: { url: 'https://console.neon.tech/api/v2/users/me' },
  turso: { url: 'https://api.turso.tech/v1/organizations' },
  resend: { url: 'https://api.resend.com/domains' },
  uptimerobot: { url: 'https://api.uptimerobot.com/v2/getAccountDetails', method: 'POST' },
  gcp: { url: 'https://cloud.google.com/compute/' },
  websupport: { url: 'https://rest.websupport.sk/v1/user/self' },
}

interface ProbeResult {
  slug: string
  reachable: boolean
  statusCode: number | null
  latencyMs: number | null
  error: string | null
}

async function probeApi(slug: string): Promise<ProbeResult> {
  const probe = PLATFORM_PROBES[slug]
  if (!probe) return { slug, reachable: false, statusCode: null, latencyMs: null, error: 'no probe configured' }

  const start = Date.now()
  try {
    const response = await fetch(probe.url, {
      method: probe.method || 'GET',
      headers: probe.headers,
      signal: AbortSignal.timeout(5_000),
      // For POST probes, send minimal body
      ...(probe.method === 'POST' ? { body: '{}', headers: { ...probe.headers, 'Content-Type': 'application/json' } } : {}),
    })
    const latencyMs = Date.now() - start

    // Any response (even 401/403) means the API is reachable
    return {
      slug,
      reachable: response.status < 500,
      statusCode: response.status,
      latencyMs,
      error: null,
    }
  }
  catch (err) {
    return {
      slug,
      reachable: false,
      statusCode: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export default defineCachedEventHandler(async () => {
  const slugs = Object.keys(PLATFORM_PROBES)
  const results = await Promise.all(slugs.map(probeApi))

  const reachableCount = results.filter(r => r.reachable).length

  return {
    total: results.length,
    reachable: reachableCount,
    unreachable: results.length - reachableCount,
    allReachable: reachableCount === results.length,
    platforms: Object.fromEntries(results.map(r => [r.slug, r])),
    checkedAt: new Date().toISOString(),
  }
}, {
  maxAge: 300, // Cache for 5 minutes
  name: 'platform-status',
})
