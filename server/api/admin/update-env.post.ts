export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { key, value } = body as { key: string; value: string }
  if (!key || !value) throw createError({ statusCode: 400, message: 'key and value required' })
  const config = useRuntimeConfig()
  if (!config.renderApiKey) throw createError({ statusCode: 500, message: 'No RENDER_API_KEY' })
  const response = await fetch(`https://api.render.com/v1/services/srv-d6qsslh4tr6s73foe81g/env-vars/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.renderApiKey}` },
    body: JSON.stringify({ value }),
  })
  if (!response.ok) throw createError({ statusCode: response.status, message: await response.text() })
  return { updated: key }
})
