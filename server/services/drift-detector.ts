import { eq, isNull, and } from 'drizzle-orm'
import { services, platforms } from '../db/schema'

/**
 * Infrastructure drift detector.
 * Compares live API service lists against DB inventory.
 * Reports: new services, removed services, status changes.
 */

interface DriftItem {
  type: 'new' | 'removed' | 'changed'
  platform: string
  name: string
  detail: string
}

export async function detectDrift(db: ReturnType<typeof import('../utils/db').useDB>, config: Record<string, string>): Promise<DriftItem[]> {
  const drifts: DriftItem[] = []

  // Check Render services
  if (config.renderApiKey) {
    try {
      const response = await fetch('https://api.render.com/v1/services?limit=50', {
        headers: { Authorization: `Bearer ${config.renderApiKey}` },
      })
      if (response.ok) {
        const data = await response.json() as Array<{ service: { name: string; type: string; suspended?: string; serviceDetails?: { plan?: string } } }>
        const liveNames = new Set(data.map(d => d.service.name))

        // Get DB services for Render
        const renderPlatform = await db.select().from(platforms).where(eq(platforms.slug, 'render')).limit(1)
        if (renderPlatform.length > 0) {
          const dbServices = await db.select().from(services).where(
            and(eq(services.platformId, renderPlatform[0].id), eq(services.isActive, true), isNull(services.deletedAt)),
          )
          const dbNames = new Set(dbServices.filter(s => s.serviceType !== 'subscription' && s.serviceType !== 'ci_cd').map(s => s.name))

          // New services (in API but not in DB)
          for (const name of liveNames) {
            if (!dbNames.has(name)) {
              const svc = data.find(d => d.service.name === name)?.service
              drifts.push({
                type: 'new',
                platform: 'Render',
                name,
                detail: `${svc?.type || 'unknown'}, plan: ${svc?.serviceDetails?.plan || '?'}`,
              })
            }
          }

          // Removed services (in DB but not in API)
          for (const name of dbNames) {
            if (!liveNames.has(name) && !name.includes('Pipeline') && !name.includes('Professional')) {
              drifts.push({ type: 'removed', platform: 'Render', name, detail: 'Not found in API' })
            }
          }

          // Suspended services
          for (const d of data) {
            if (d.service.suspended === 'suspended') {
              drifts.push({
                type: 'changed',
                platform: 'Render',
                name: d.service.name,
                detail: 'Service is SUSPENDED',
              })
            }
          }
        }
      }
    }
    catch (err) {
      console.error('[drift-detector] Render check failed:', err instanceof Error ? err.message : err)
    }
  }

  // Check Railway projects
  if (config.railwayApiToken) {
    try {
      const response = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.railwayApiToken}`,
        },
        body: JSON.stringify({ query: '{ projects { edges { node { id name services { edges { node { id name } } } } } } }' }),
      })
      if (response.ok) {
        const data = await response.json() as {
          data: { projects: { edges: Array<{ node: { name: string; services: { edges: Array<{ node: { name: string } }> } } }> } }
        }

        const railwayPlatform = await db.select().from(platforms).where(eq(platforms.slug, 'railway')).limit(1)
        if (railwayPlatform.length > 0) {
          const dbServices = await db.select().from(services).where(
            and(eq(services.platformId, railwayPlatform[0].id), eq(services.isActive, true), isNull(services.deletedAt)),
          )
          const dbNames = new Set(dbServices.map(s => s.name))

          for (const project of data.data.projects.edges) {
            for (const svc of project.node.services.edges) {
              if (!dbNames.has(svc.node.name)) {
                drifts.push({
                  type: 'new',
                  platform: 'Railway',
                  name: svc.node.name,
                  detail: `In project "${project.node.name}"`,
                })
              }
            }
          }
        }
      }
    }
    catch (err) {
      console.error('[drift-detector] Railway check failed:', err instanceof Error ? err.message : err)
    }
  }

  return drifts
}
