/** Temporary admin endpoint: update env var via Render API using the configured RENDER_API_KEY */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { key, value } = body as { key: string; value: string }

  if (!key || !value) {
    throw createError({ statusCode: 400, message: 'key and value required' })
  }

  const config = useRuntimeConfig()
  if (!config.renderApiKey) {
    throw createError({ statusCode: 500, message: 'RENDER_API_KEY not configured' })
  }

  const serviceId = 'srv-d6qsslh4tr6s73foe81g'

  // Use Render API to update env var
  const response = await fetch(
    `https://api.render.com/v1/services/${serviceId}/env-vars/${key}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.renderApiKey}`,
      },
      body: JSON.stringify({ value }),
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw createError({ statusCode: response.status, message: `Render API: ${text}` })
  }

  return { updated: key, status: response.status }
})
