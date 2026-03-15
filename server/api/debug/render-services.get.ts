/** Debug: show raw Render API response to verify service plan fields */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  if (!config.renderApiKey) return { error: 'No Render API key' }

  const response = await fetch('https://api.render.com/v1/services?limit=50', {
    headers: { Authorization: `Bearer ${config.renderApiKey}` },
  })

  if (!response.ok) return { error: `API ${response.status}` }

  const data = await response.json() as Array<{ service: Record<string, unknown> }>
  return data.map(({ service }) => ({
    name: service.name,
    type: service.type,
    plan: service.plan,
    serviceDetails: service.serviceDetails,
    suspended: service.suspended,
  }))
})
