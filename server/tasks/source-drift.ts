import { runReconciliation } from '../services/source-reconciler'
import { createGA4Adapter } from '../services/source-adapters/ga4-adapter'
import { createGSCAdapter } from '../services/source-adapters/gsc-adapter'

export default defineTask({
  meta: {
    name: 'source-drift',
    description: 'Diff ANALYTICS_CONFIG against live GA4 / GSC, persist drift alerts (#94)',
  },
  async run() {
    const db = useDB()
    const summary = await runReconciliation(db, [createGA4Adapter(), createGSCAdapter()])
    return { result: summary }
  },
})
