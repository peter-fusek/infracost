/** Live status of all monitored services from UptimeRobot */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  if (!config.uptimeRobotApiKey) {
    return { error: 'UPTIMEROBOT_API_KEY not configured', monitors: [] }
  }

  const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.uptimeRobotApiKey,
      format: 'json',
      all_time_uptime_ratio: '1',
      response_times: '1',
      response_times_limit: '1',
    }),
  })

  if (!response.ok) {
    return { error: `UptimeRobot API ${response.status}`, monitors: [] }
  }

  const data = await response.json() as {
    stat: string
    monitors: Array<{
      id: number
      friendly_name: string
      url: string
      status: number
      interval: number
      all_time_uptime_ratio: string
      response_times?: Array<{ value: number }>
    }>
  }

  if (data.stat !== 'ok') {
    return { error: 'UptimeRobot API error', monitors: [] }
  }

  const statusMap: Record<number, string> = {
    0: 'paused', 1: 'not_checked', 2: 'up', 8: 'seems_down', 9: 'down',
  }

  const monitors = (data.monitors || []).map(m => ({
    id: m.id,
    name: m.friendly_name,
    url: m.url,
    status: statusMap[m.status] || 'unknown',
    isUp: m.status === 2,
    uptimeRatio: parseFloat(m.all_time_uptime_ratio || '0'),
    responseTime: m.response_times?.[0]?.value ?? null,
    checkInterval: m.interval,
  }))

  const upCount = monitors.filter(m => m.isUp).length

  return {
    totalMonitors: monitors.length,
    upCount,
    downCount: monitors.length - upCount,
    allUp: upCount === monitors.length,
    monitors,
  }
})
