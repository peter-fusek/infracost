/**
 * Google Search Console API service — fetches search performance data.
 * Uses the Search Console API v3: searchconsole.googleapis.com
 *
 * Returns daily clicks, impressions, CTR, position + top queries and pages.
 */

import { getAccessToken } from '../utils/google-auth'

const GSC_API = 'https://searchconsole.googleapis.com/webmasters/v3'

export interface DailySearchPerformance {
  date: string // YYYY-MM-DD
  clicks: number
  impressions: number
  ctr: number // 0-1
  position: number // average position
}

export interface TopQuery {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface TopPage {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCResult {
  siteUrl: string
  daily: DailySearchPerformance[]
  topQueries: TopQuery[]
  topPages: TopPage[]
  totals: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  seoScore: number // 0-100 computed score
  tips: string[]
  period: { start: string; end: string }
  errors: string[]
}

export async function fetchGSCPerformance(siteUrl: string, days: number = 30): Promise<GSCResult> {
  const errors: string[] = []
  const daily: DailySearchPerformance[] = []
  let topQueries: TopQuery[] = []
  let topPages: TopPage[] = []

  const token = await getAccessToken()
  if (!token) {
    return { siteUrl, daily, topQueries, topPages, totals: emptyTotals(), seoScore: 0, tips: [], period: { start: '', end: '' }, errors: ['No GCP service account configured'] }
  }

  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * 86400000)
  const start = startDate.toISOString().slice(0, 10)
  const end = endDate.toISOString().slice(0, 10)

  const encodedSite = encodeURIComponent(siteUrl)

  try {
    // Daily performance
    const dailyResponse = await fetch(`${GSC_API}/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        dimensions: ['date'],
        rowLimit: 100,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!dailyResponse.ok) {
      const body = await dailyResponse.text().catch(() => '')
      errors.push(`GSC API error ${dailyResponse.status}: ${body.slice(0, 200)}`)
      return { siteUrl, daily, topQueries, topPages, totals: emptyTotals(), seoScore: 0, tips: [], period: { start, end }, errors }
    }

    const dailyData = await dailyResponse.json() as GSCResponse
    for (const row of dailyData.rows || []) {
      daily.push({
        date: row.keys?.[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 10000,
        position: Math.round(row.position * 10) / 10,
      })
    }

    // Top queries (parallel with top pages)
    const [queriesRes, pagesRes] = await Promise.all([
      fetch(`${GSC_API}/sites/${encodedSite}/searchAnalytics/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 20 }),
        signal: AbortSignal.timeout(15_000),
      }),
      fetch(`${GSC_API}/sites/${encodedSite}/searchAnalytics/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 20 }),
        signal: AbortSignal.timeout(15_000),
      }),
    ])

    if (queriesRes.ok) {
      const data = await queriesRes.json() as GSCResponse
      topQueries = (data.rows || []).map(r => ({
        query: r.keys?.[0] ?? '',
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 10000) / 10000,
        position: Math.round(r.position * 10) / 10,
      }))
    }

    if (pagesRes.ok) {
      const data = await pagesRes.json() as GSCResponse
      topPages = (data.rows || []).map(r => ({
        page: r.keys?.[0] ?? '',
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 10000) / 10000,
        position: Math.round(r.position * 10) / 10,
      }))
    }
  }
  catch (err) {
    errors.push(`GSC fetch error: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Compute totals
  const totals = daily.reduce((acc, d) => ({
    clicks: acc.clicks + d.clicks,
    impressions: acc.impressions + d.impressions,
    ctr: 0,
    position: 0,
  }), emptyTotals())

  if (totals.impressions > 0) {
    totals.ctr = Math.round((totals.clicks / totals.impressions) * 10000) / 10000
  }
  if (daily.length > 0) {
    totals.position = Math.round(daily.reduce((s, d) => s + d.position, 0) / daily.length * 10) / 10
  }

  // Compute SEO score (0-100) based on key metrics
  const seoScore = computeSeoScore(totals, daily)

  // Generate improvement tips
  const tips = generateTips(totals, daily, topQueries, topPages)

  return { siteUrl, daily, topQueries, topPages, totals, seoScore, tips, period: { start, end }, errors }
}

function computeSeoScore(totals: GSCResult['totals'], daily: DailySearchPerformance[]): number {
  let score = 50 // base

  // CTR scoring (good CTR > 3%)
  if (totals.ctr >= 0.05) score += 15
  else if (totals.ctr >= 0.03) score += 10
  else if (totals.ctr >= 0.01) score += 5

  // Position scoring (lower is better)
  if (totals.position <= 10) score += 15
  else if (totals.position <= 20) score += 10
  else if (totals.position <= 30) score += 5

  // Impression volume
  if (totals.impressions >= 1000) score += 10
  else if (totals.impressions >= 100) score += 5

  // Click volume
  if (totals.clicks >= 100) score += 10
  else if (totals.clicks >= 10) score += 5

  // Trend bonus: improving clicks over last 7 days vs prior 7 days
  if (daily.length >= 14) {
    const recent = daily.slice(-7).reduce((s, d) => s + d.clicks, 0)
    const prior = daily.slice(-14, -7).reduce((s, d) => s + d.clicks, 0)
    if (prior > 0 && recent > prior * 1.1) score += 5 // growing
    if (prior > 0 && recent < prior * 0.7) score -= 5 // declining
  }

  return Math.max(0, Math.min(100, score))
}

function generateTips(totals: GSCResult['totals'], daily: DailySearchPerformance[], queries: TopQuery[], pages: TopPage[]): string[] {
  const tips: string[] = []

  if (totals.ctr < 0.02 && totals.impressions > 50) {
    tips.push('Low CTR — improve title tags and meta descriptions for your top queries to increase click-through rate.')
  }

  if (totals.position > 20) {
    tips.push('Average position is low — focus on building quality backlinks and improving on-page SEO for target keywords.')
  }

  if (totals.impressions < 50 && daily.length >= 14) {
    tips.push('Low impressions — consider expanding content targeting long-tail keywords and publishing more frequently.')
  }

  // Check for high-impression low-CTR queries (quick wins)
  const quickWins = queries.filter(q => q.impressions > 20 && q.ctr < 0.02 && q.position <= 20)
  if (quickWins.length > 0) {
    tips.push(`Quick wins: ${quickWins.length} queries have good position but low CTR — optimize snippets for: "${quickWins[0]?.query}"${quickWins.length > 1 ? ` and ${quickWins.length - 1} more` : ''}.`)
  }

  // Check for position 11-20 queries (push to page 1)
  const almostPage1 = queries.filter(q => q.position > 10 && q.position <= 20 && q.impressions > 10)
  if (almostPage1.length > 0) {
    tips.push(`Page 1 opportunities: ${almostPage1.length} queries rank on page 2 — strengthen content for: "${almostPage1[0]?.query}".`)
  }

  // LLMEO tips
  tips.push('LLMEO: Ensure structured data (JSON-LD) is present on key pages for AI citation visibility.')
  if (pages.length > 0 && !pages.some(p => p.page.includes('/blog') || p.page.includes('/docs'))) {
    tips.push('LLMEO: Add a /blog or /docs section — LLM crawlers favor well-structured informational content.')
  }

  return tips.slice(0, 6) // max 6 tips
}

interface GSCResponse {
  rows?: Array<{
    keys: string[]
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
}

function emptyTotals() {
  return { clicks: 0, impressions: 0, ctr: 0, position: 0 }
}
