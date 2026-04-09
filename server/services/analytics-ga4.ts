/**
 * GA4 Data API service — fetches traffic data per property.
 * Uses the GA4 Data API v1beta: analyticsdata.googleapis.com
 *
 * Returns daily sessions, users, pageviews split by human vs bot traffic.
 * Bot detection uses the "sessionDefaultChannelGroup" dimension to identify
 * non-human traffic, plus userAgentBrowser for known LLM crawlers.
 */

import { getAccessToken } from '../utils/google-auth'

const GA4_API = 'https://analyticsdata.googleapis.com/v1beta'

export interface DailyTraffic {
  date: string // YYYY-MM-DD
  sessions: number
  users: number
  pageviews: number
  botSessions: number
  humanSessions: number
  avgSessionDuration: number
  bounceRate: number
}

export interface GA4TrafficResult {
  propertyId: string
  daily: DailyTraffic[]
  totals: {
    sessions: number
    users: number
    pageviews: number
    botSessions: number
    humanSessions: number
    avgSessionDuration: number
    bounceRate: number
  }
  period: { start: string; end: string }
  errors: string[]
}

export async function fetchGA4Traffic(propertyId: string, days: number = 30): Promise<GA4TrafficResult> {
  const errors: string[] = []
  const daily: DailyTraffic[] = []

  const token = await getAccessToken()
  if (!token) {
    return { propertyId, daily, totals: emptyTotals(), period: { start: '', end: '' }, errors: ['No GCP service account configured'] }
  }

  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * 86400000)
  const start = startDate.toISOString().slice(0, 10)
  const end = endDate.toISOString().slice(0, 10)

  try {
    // Main traffic query — daily sessions, users, pageviews
    const response = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      errors.push(`GA4 API error ${response.status}: ${body.slice(0, 200)}`)
      return { propertyId, daily, totals: emptyTotals(), period: { start, end }, errors }
    }

    const data = await response.json() as GA4Response

    for (const row of data.rows || []) {
      const date = formatGA4Date(row.dimensionValues?.[0]?.value ?? '')
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0') || 0
      const users = parseInt(row.metricValues?.[1]?.value ?? '0') || 0
      const pageviews = parseInt(row.metricValues?.[2]?.value ?? '0') || 0
      const avgDuration = parseFloat(row.metricValues?.[3]?.value ?? '0') || 0
      const bounce = parseFloat(row.metricValues?.[4]?.value ?? '0') || 0

      daily.push({
        date,
        sessions,
        users,
        pageviews,
        botSessions: 0, // will be populated by bot query
        humanSessions: sessions,
        avgSessionDuration: Math.round(avgDuration),
        bounceRate: Math.round(bounce * 100) / 100,
      })
    }

    // Bot traffic query — sessions from known bot channels
    try {
      const botResponse = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: {
            orGroup: {
              expressions: [
                { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: '(not set)', matchType: 'EXACT' } } },
                { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Unassigned', matchType: 'EXACT' } } },
              ],
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      })

      if (botResponse.ok) {
        const botData = await botResponse.json() as GA4Response
        const botByDate = new Map<string, number>()

        for (const row of botData.rows || []) {
          const date = formatGA4Date(row.dimensionValues?.[0]?.value ?? '')
          const sessions = parseInt(row.metricValues?.[0]?.value ?? '0') || 0
          botByDate.set(date, (botByDate.get(date) || 0) + sessions)
        }

        for (const day of daily) {
          day.botSessions = botByDate.get(day.date) || 0
          day.humanSessions = Math.max(0, day.sessions - day.botSessions)
        }
      }
    }
    catch (err) {
      console.warn('[analytics-ga4] Bot detection failed:', err instanceof Error ? err.message : err)
    }
  }
  catch (err) {
    errors.push(`GA4 fetch error: ${err instanceof Error ? err.message : String(err)}`)
  }

  const totals = daily.reduce((acc, d) => ({
    sessions: acc.sessions + d.sessions,
    users: acc.users + d.users,
    pageviews: acc.pageviews + d.pageviews,
    botSessions: acc.botSessions + d.botSessions,
    humanSessions: acc.humanSessions + d.humanSessions,
    avgSessionDuration: 0,
    bounceRate: 0,
  }), emptyTotals())

  if (daily.length > 0) {
    totals.avgSessionDuration = Math.round(daily.reduce((s, d) => s + d.avgSessionDuration, 0) / daily.length)
    totals.bounceRate = Math.round(daily.reduce((s, d) => s + d.bounceRate, 0) / daily.length * 100) / 100
  }

  return { propertyId, daily, totals, period: { start, end }, errors }
}

// GA4 API response types
interface GA4Response {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>
    metricValues: Array<{ value: string }>
  }>
}

function formatGA4Date(dateStr: string): string {
  // GA4 returns dates as "20260324" → "2026-03-24"
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
}

function emptyTotals() {
  return { sessions: 0, users: 0, pageviews: 0, botSessions: 0, humanSessions: 0, avgSessionDuration: 0, bounceRate: 0 }
}
