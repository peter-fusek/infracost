import { getSavingMode } from '../../utils/app-settings'

export default defineEventHandler(async () => {
  return { on: await getSavingMode() }
})
