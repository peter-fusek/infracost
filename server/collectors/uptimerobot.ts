import type { BaseCollector, CollectorResult, CostRecord } from './base'

/**
 * UptimeRobot collector — fetches monitor status and tracks cost.
 * Free tier: 50 monitors, 5min interval, $0/mo.
 * Pro plan: $7/mo for 50 monitors, 1min interval.
 * API: https://uptimerobot.com/api/
 */

interface UptimeRobotMonitor {
  id: number
  friendly_name: string
  url: string
  type: number // 1=HTTP(s), 2=keyword, 3=ping, 4=port, 5=heartbeat
  status: number // 0=paused, 1=not checked, 2=up, 8=seems down, 9=down
  interval: number // check interval in seconds
  all_time_uptime_ratio?: string
}

const STATUS_MAP: Record<number, string> = {
  0: 'paused', 1: 'not_checked', 2: 'up', 8: 'seems_down', 9: 'down',
}

export function createUptimeRobotCollector(apiKey: string, platformId: number): BaseCollector {
  return {
    platformSlug: 'uptimerobot',

    async collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult> {
      const records: CostRecord[] = []
      const errors: string[] = []

      try {
        const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            format: 'json',
            all_time_uptime_ratio: '1',
          }),
        })

        if (!response.ok) {
          errors.push(`UptimeRobot API error ${response.status}`)
          return { records, errors }
        }

        const data = await response.json() as {
          stat: string
          monitors: UptimeRobotMonitor[]
          pagination: { total: number; limit: number }
        }

        if (data.stat !== 'ok') {
          errors.push(`UptimeRobot API error: ${JSON.stringify(data)}`)
          return { records, errors }
        }

        const monitors = data.monitors || []
        const upCount = monitors.filter(m => m.status === 2).length
        const downCount = monitors.filter(m => m.status === 9 || m.status === 8).length

        // UptimeRobot free tier = $0, Pro = $7/mo
        // Report $0 for free tier
        records.push({
          platformId,
          recordDate: new Date(),
          periodStart,
          periodEnd,
          amount: '0.00',
          currency: 'USD',
          costType: 'usage',
          collectionMethod: 'api',
          rawData: {
            totalMonitors: monitors.length,
            up: upCount,
            down: downCount,
            monitors: monitors.map(m => ({
              name: m.friendly_name,
              url: m.url,
              status: STATUS_MAP[m.status] || 'unknown',
              uptimeRatio: m.all_time_uptime_ratio,
              interval: m.interval,
            })),
          },
          notes: `UptimeRobot: ${monitors.length} monitors (${upCount} up, ${downCount} down), free tier`,
        })
      }
      catch (err) {
        errors.push(`UptimeRobot collector error: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { records, errors }
    },
  }
}
