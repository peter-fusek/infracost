import { setSavingMode } from '../../utils/app-settings'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody<{ on?: unknown }>(event) ?? {}
  if (typeof body.on !== 'boolean') {
    throw createError({ statusCode: 400, message: 'Body must be { on: boolean }' })
  }
  await setSavingMode(body.on)
  return { on: body.on }
})
