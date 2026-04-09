import { eq, isNull, and, gte } from 'drizzle-orm'
import { services, platforms, alerts, projects, auditLog } from '../db/schema'
import { sendAlertEmail, sendWhatsApp } from '../utils/notifications'
import { githubHeaders } from '../utils/github'

/**
 * Infrastructure drift detector.
 * Compares live API service lists against DB inventory.
 * Reports: new services, removed services, status changes.
 * Persists drift items as alerts for audit trail.
 */

export interface DriftItem {
  type: 'new' | 'removed' | 'changed'
  platform: string
  name: string
  detail: string
}

/** Known-expected drifts that should not generate alerts. Format: "{Platform}_{name}" */
const DRIFT_IGNORE_LIST = new Set([
  // Suspended Render services (expected state)
  'Render_oncoteam-dashboard', 'Render_oncoteam-dashboard-test', 'Render_oncoteam-landing',
  'Render_homegrif-test', // srv-d6fedqh4tr6s73bshfj0 — suspended, candidate for deletion
  // Removed Render services/DBs (old names from before rename + migrated/deleted)
  'Render_homegrif_com', 'Render_homegrif_com-test',
  'Render_partners-cz-prod', 'Render_partners-cz-test',
  'Render_infracost-db', 'Render_budgetco-db', 'Render_scrabsnap-db',
  'Render_partners-db-test', 'Render_partners-db-prod',
  'Render_oncoteam-db-test', 'Render_oncoteam-db-prod',
  'Render_homegrif-db-test',
  // Removed Render services (migrated to Railway)
  'Render_instareaweb',
  // GitHub repos renamed/moved (expected 404s)
  'GitHub_instarea', 'GitHub_replica.city', 'GitHub_grandpa_check',
  'GitHub_pulseshape', 'GitHub_oncoteam', 'GitHub_homegrif.com',
  'GitHub_instarea.sk',
])

const DRIFT_TYPE_LABELS: Record<DriftItem['type'], string> = {
  new: 'New',
  removed: 'Removed',
  changed: 'Changed',
}

type DB = ReturnType<typeof import('../utils/db').useDB>

export async function detectDrift(db: DB, config: Record<string, string>): Promise<DriftItem[]> {
  const drifts: DriftItem[] = []

  // Check Render services
  if (config.renderApiKey) {
    try {
      const response = await fetch('https://api.render.com/v1/services?limit=50', {
        headers: { Authorization: `Bearer ${config.renderApiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (response.ok) {
        const data = await response.json() as Array<{ service: { name: string; type: string; suspended?: string; serviceDetails?: { plan?: string } } }>
        const liveNames = new Set(data.map(d => d.service.name))

        const renderPlatform = await db.select().from(platforms).where(eq(platforms.slug, 'render')).limit(1)
        if (renderPlatform.length > 0) {
          const dbServices = await db.select().from(services).where(
            and(eq(services.platformId, renderPlatform[0]!.id), eq(services.isActive, true), isNull(services.deletedAt)),
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
        signal: AbortSignal.timeout(30_000),
      })
      if (response.ok) {
        const data = await response.json() as {
          data: { projects: { edges: Array<{ node: { name: string; services: { edges: Array<{ node: { name: string } }> } } }> } }
        }

        const railwayPlatform = await db.select().from(platforms).where(eq(platforms.slug, 'railway')).limit(1)
        if (railwayPlatform.length > 0) {
          const dbServices = await db.select().from(services).where(
            and(eq(services.platformId, railwayPlatform[0]!.id), eq(services.isActive, true), isNull(services.deletedAt)),
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

  // Check GitHub project registry — verify registered repos still exist
  if (config.githubToken) {
    try {
      const allProjects = await db
        .select({ slug: projects.slug, repoUrl: projects.repoUrl })
        .from(projects)
        .where(and(eq(projects.isActive, true), isNull(projects.deletedAt)))

      for (const project of allProjects) {
        if (!project.repoUrl) continue

        // Extract owner/repo from URL
        const match = project.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/)
        if (!match) continue

        const repoPath = match[1]
        try {
          const response = await fetch(`https://api.github.com/repos/${repoPath}`, {
            headers: githubHeaders(config.githubToken),
            signal: AbortSignal.timeout(15_000),
          })

          if (response.status === 404) {
            drifts.push({
              type: 'removed',
              platform: 'GitHub',
              name: project.slug,
              detail: `Repo ${repoPath} not found (deleted or renamed?)`,
            })
          }
          else if (response.ok) {
            const repo = await response.json() as { archived: boolean }
            if (repo.archived) {
              drifts.push({
                type: 'changed',
                platform: 'GitHub',
                name: project.slug,
                detail: `Repo ${repoPath} is archived`,
              })
            }
          }
        }
        catch (err) {
          console.warn('[drift-detector] Repo check failed for', repoPath + ':', err instanceof Error ? err.message : err)
        }
      }
    }
    catch (err) {
      console.error('[drift-detector] GitHub check failed:', err instanceof Error ? err.message : err)
    }
  }

  // Filter out known-expected drifts
  return drifts.filter(d => !DRIFT_IGNORE_LIST.has(`${d.platform}_${d.name}`))
}

/**
 * Persist drift items as alerts + audit log entries.
 * Deduplicates against existing recent alerts (24h window).
 * Sends notifications for removed services.
 * Audit log entries link to projects for change history timeline.
 */
export async function persistDriftAlerts(db: DB, drifts: DriftItem[], config: Record<string, string>): Promise<number> {
  if (drifts.length === 0) return 0

  // Load recent drift alerts for dedup (7-day window — prevents daily duplicates from cron)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentAlerts = await db
    .select({ alertType: alerts.alertType })
    .from(alerts)
    .where(gte(alerts.createdAt, since))
  const recentTypes = new Set(recentAlerts.map(a => a.alertType))

  // Build service→project lookup for linking events to projects
  const allServices = await db
    .select({ name: services.name, project: services.project })
    .from(services)
    .where(and(eq(services.isActive, true), isNull(services.deletedAt)))
  const serviceProjectMap = new Map(allServices.filter(s => s.project).map(s => [s.name, s.project!]))

  let created = 0

  for (const drift of drifts) {
    const alertType = `drift_${drift.type}_${drift.platform.toLowerCase()}_${drift.name}`

    if (recentTypes.has(alertType)) continue

    const severity = drift.type === 'removed' ? 'warning' as const : 'info' as const

    const message = `[${drift.platform}] ${DRIFT_TYPE_LABELS[drift.type]}: ${drift.name} — ${drift.detail}`

    // Resolve project slug — GitHub drifts use project slug directly, others via service name
    const projectSlug = drift.platform === 'GitHub'
      ? drift.name
      : serviceProjectMap.get(drift.name) ?? null

    await db.insert(alerts).values({
      severity,
      alertType,
      message,
    })

    // Record in audit log for change history timeline
    await db.insert(auditLog).values({
      action: `drift_${drift.type}`,
      entityType: 'service',
      actorType: 'system',
      details: {
        platform: drift.platform,
        service: drift.name,
        project: projectSlug,
        detail: drift.detail,
      },
    })
    created++

    // Send notifications for removed services (potential cost impact)
    if (drift.type === 'removed' && config.resendApiKey) {
      try {
        await sendAlertEmail(message, severity, `Drift: ${drift.platform} service removed`, config)
        await sendWhatsApp(message, config)
      }
      catch (err) {
        console.error(`[drift-detector] Notification failed for ${drift.name}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  if (created > 0) {
    console.log(`[drift-detector] Created ${created} drift alert(s)`)
  }

  return created
}
