/** Live status of all monitored services from UptimeRobot — cached 2min to prevent API abuse */
export default defineCachedEventHandler(async () => {
  const config = useRuntimeConfig()
  if (!config.uptimeRobotApiKey) {
    throw createError({ statusCode: 503, message: 'UPTIMEROBOT_API_KEY not configured' })
  }

  const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.uptimeRobotApiKey,
      format: 'json',
      all_time_uptime_ratio: '1',
      custom_uptime_ratios: '7-30-90',
      response_times: '1',
      response_times_limit: '1',
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw createError({ statusCode: 502, message: `UptimeRobot API returned ${response.status}` })
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
      custom_uptime_ratio?: string
      response_times?: Array<{ value: number }>
    }>
  }

  if (data.stat !== 'ok') {
    throw createError({ statusCode: 502, message: 'UptimeRobot API returned an error' })
  }

  const statusMap: Record<number, string> = {
    0: 'paused', 1: 'not_checked', 2: 'up', 8: 'seems_down', 9: 'down',
  }

  const monitors = (data.monitors || []).map(m => {
    const customRatios = m.custom_uptime_ratio?.split('-').map(Number) ?? []
    return {
      id: m.id,
      name: m.friendly_name,
      url: m.url,
      status: statusMap[m.status] || 'unknown',
      isUp: m.status === 2,
      uptimeRatio: parseFloat(m.all_time_uptime_ratio || '0'),
      uptime7d: customRatios[0] ?? null,
      uptime30d: customRatios[1] ?? null,
      uptime90d: customRatios[2] ?? null,
      responseTime: m.response_times?.[0]?.value ?? null,
      checkInterval: m.interval,
    }
  })

  const upCount = monitors.filter(m => m.isUp).length

  return {
    totalMonitors: monitors.length,
    upCount,
    downCount: monitors.length - upCount,
    allUp: upCount === monitors.length,
    monitors,
  }
}, { maxAge: 120 }) // 2 minutes
