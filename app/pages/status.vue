<script setup lang="ts">
interface Monitor {
  id: number
  name: string
  url: string
  status: string
  isUp: boolean
  uptimeRatio: number
  uptime7d: number | null
  uptime30d: number | null
  uptime90d: number | null
  responseTime: number | null
  checkInterval: number
}

interface StatusResponse {
  totalMonitors: number
  upCount: number
  downCount: number
  allUp: boolean
  monitors: Monitor[]
  error?: string
}

interface Project {
  id: number
  slug: string
  name: string
  description: string | null
  repoUrl: string | null
  productionUrl: string | null
  techStack: string[] | null
  status: 'active' | 'paused' | 'archived'
  serviceCount: number
  mtdUsd: number
  estimateUsd: number
  recentChanges: number
}

interface ChangeEvent {
  id: number
  action: string
  platform: string
  service: string
  detail: string
  createdAt: string
}

interface DiscoveredRepo {
  name: string
  fullName: string
  url: string
  description: string | null
  owner: string
  isPrivate: boolean
  isArchived: boolean
  primaryLanguage: string | null
  techStack: string[]
  deploymentIndicators: string[]
  hasDeployment: boolean
  lastPushed: string | null
  topics: string[]
  sizeKb: number
}

interface DiscoveryResult {
  tracked: DiscoveredRepo[]
  untracked: DiscoveredRepo[]
  archived: DiscoveredRepo[]
  errors: string[]
  scannedAt: string
  totalRepos: number
}

interface DriftItem {
  type: 'new' | 'removed' | 'changed'
  platform: string
  name: string
  detail: string
}

interface DriftResponse {
  drifts: DriftItem[]
  count: number
  checkedAt: string
}

const { data, status, refresh } = await useFetch<StatusResponse>('/api/status')
const { data: projectsData } = await useFetch<{ projects: Project[] }>('/api/projects')
const { data: driftData } = await useFetch<DriftResponse>('/api/drift')
const { loggedIn } = useUserSession()

const refreshing = ref(false)
async function doRefresh() {
  refreshing.value = true
  try { await refresh() }
  finally { refreshing.value = false }
}

// GitHub discovery
const toast = useToast()
const scanning = ref(false)
const discovery = ref<DiscoveryResult | null>(null)

async function scanRepos() {
  scanning.value = true
  try {
    discovery.value = await $fetch<DiscoveryResult>('/api/projects/discover', { method: 'POST' })
    if (discovery.value.errors.length) {
      toast.add({ title: 'Scan completed with warnings', description: `${discovery.value.errors.length} error(s)`, color: 'warning' })
    }
  }
  catch (err: any) {
    toast.add({ title: 'Scan failed', description: err?.data?.message || 'GitHub API error', color: 'error' })
  }
  finally {
    scanning.value = false
  }
}

function timeAgoShort(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function statusColor(s: string) {
  if (s === 'up') return 'success'
  if (s === 'down' || s === 'seems_down') return 'error'
  if (s === 'paused') return 'warning'
  return 'neutral'
}

function statusIcon(s: string) {
  if (s === 'up') return 'i-lucide-check-circle'
  if (s === 'down' || s === 'seems_down') return 'i-lucide-alert-circle'
  if (s === 'paused') return 'i-lucide-pause-circle'
  return 'i-lucide-help-circle'
}

const TECH_COLORS: Record<string, string> = {
  nuxt: 'success', vue: 'success', typescript: 'primary', tailwind: 'info',
  postgres: 'primary', python: 'warning', fastapi: 'success',
  render: 'neutral', railway: 'neutral', gcp: 'primary',
  drizzle: 'neutral', turso: 'success', neon: 'success',
  claude: 'warning', 'github-actions': 'neutral', 'three.js': 'neutral',
  javascript: 'warning',
}

function techColor(tech: string): string { return TECH_COLORS[tech] ?? 'neutral' }

const PROJECT_STATUS_COLORS: Record<string, string> = { active: 'success', paused: 'warning', archived: 'neutral' }

function fmt(n: number) { return n > 0 ? `$${n.toFixed(0)}` : '$0' }

const expanded = ref<Set<number>>(new Set())

function toggle(id: number) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}

// Project card expansion + lazy-loaded change history
const expandedProjects = ref<Set<string>>(new Set())
const projectChanges = ref<Record<string, ChangeEvent[]>>({})
const loadingChanges = ref<Set<string>>(new Set())

async function toggleProject(slug: string) {
  if (expandedProjects.value.has(slug)) {
    expandedProjects.value.delete(slug)
    return
  }
  expandedProjects.value.add(slug)

  // Lazy-load change history if not cached
  if (!projectChanges.value[slug] && !loadingChanges.value.has(slug)) {
    loadingChanges.value.add(slug)
    try {
      const data = await $fetch<{ changes: ChangeEvent[] }>(`/api/projects/${slug}/changes`)
      projectChanges.value[slug] = data.changes
    }
    catch {
      projectChanges.value[slug] = []
    }
    finally {
      loadingChanges.value.delete(slug)
    }
  }
}

const DRIFT_ACTION_LABELS: Record<string, string> = {
  drift_new: 'Added',
  drift_removed: 'Removed',
  drift_changed: 'Changed',
}

const DRIFT_ACTION_COLORS: Record<string, string> = {
  drift_new: 'text-[var(--ui-success)]',
  drift_removed: 'text-[var(--ui-error)]',
  drift_changed: 'text-[var(--ui-warning)]',
}

const activeProjects = computed(() => projectsData.value?.projects?.filter(p => p.status === 'active') ?? [])
const pausedProjects = computed(() => projectsData.value?.projects?.filter(p => p.status !== 'active') ?? [])
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Service Status</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Live monitoring via UptimeRobot &middot; 5min checks
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        label="Refresh"
        :loading="refreshing"
        @click="doRefresh"
      />
    </div>

    <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
    </div>

    <template v-else-if="data && !data.error">
      <!-- Overall status banner -->
      <div
        class="rounded-lg border px-6 py-4"
        :class="data.allUp
          ? 'border-[var(--ui-success)] bg-[var(--ui-success)]/5'
          : 'border-[var(--ui-error)] bg-[var(--ui-error)]/5'"
      >
        <div class="flex items-center gap-3">
          <UIcon
            :name="data.allUp ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'"
            class="size-8"
            :class="data.allUp ? 'text-[var(--ui-success)]' : 'text-[var(--ui-error)]'"
          />
          <div>
            <p class="text-lg font-semibold">
              {{ data.allUp ? 'All Systems Operational' : `${data.downCount} Service(s) Down` }}
            </p>
            <p class="text-sm text-[var(--ui-text-muted)]">
              {{ data.upCount }}/{{ data.totalMonitors }} services up
            </p>
          </div>
        </div>
      </div>

      <!-- Drift alerts -->
      <div v-if="driftData?.count">
        <div class="flex items-center gap-2 mb-3">
          <h2 class="font-display text-lg font-bold">Infrastructure Drift</h2>
          <UBadge color="warning" variant="solid" size="xs">{{ driftData.count }}</UBadge>
        </div>
        <div class="space-y-2">
          <div
            v-for="(drift, i) in driftData.drifts"
            :key="i"
            class="flex items-center gap-3 rounded-lg border px-4 py-2"
            :class="{
              'border-[var(--ui-success)] bg-[var(--ui-success)]/5': drift.type === 'new',
              'border-[var(--ui-error)] bg-[var(--ui-error)]/5': drift.type === 'removed',
              'border-[var(--ui-warning)] bg-[var(--ui-warning)]/5': drift.type === 'changed',
            }"
          >
            <UIcon
              :name="drift.type === 'new' ? 'i-lucide-plus-circle' : drift.type === 'removed' ? 'i-lucide-minus-circle' : 'i-lucide-alert-circle'"
              class="size-5 shrink-0"
              :class="{
                'text-[var(--ui-success)]': drift.type === 'new',
                'text-[var(--ui-error)]': drift.type === 'removed',
                'text-[var(--ui-warning)]': drift.type === 'changed',
              }"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                <span class="text-[var(--ui-text-muted)]">{{ drift.platform }}:</span> {{ drift.name }}
              </p>
              <p class="text-xs text-[var(--ui-text-muted)]">{{ drift.detail }}</p>
            </div>
            <UBadge
              :color="drift.type === 'new' ? 'success' : drift.type === 'removed' ? 'error' : ('warning' as any)"
              variant="subtle"
              size="xs"
            >
              {{ drift.type }}
            </UBadge>
          </div>
        </div>
        <p class="text-xs text-[var(--ui-text-dimmed)] text-right mt-1">
          Checked: {{ new Date(driftData.checkedAt).toLocaleString() }}
        </p>
      </div>

      <!-- Projects section -->
      <div v-if="projectsData?.projects?.length">
        <h2 class="font-display text-lg font-bold mb-3">Projects</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UCard
            v-for="project in activeProjects"
            :key="project.id"
            class="cursor-pointer transition-shadow hover:shadow-md"
            :class="{ 'ring-2 ring-[var(--ui-warning)]/40': project.recentChanges > 0 }"
            @click="toggleProject(project.slug)"
          >
            <div class="space-y-3">
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="expandedProjects.has(project.slug) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-4 text-[var(--ui-text-muted)] shrink-0"
                  />
                  <div>
                    <h3 class="font-display font-bold">{{ project.name }}</h3>
                    <p v-if="project.description" class="text-xs text-[var(--ui-text-muted)] line-clamp-1">{{ project.description }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <UBadge v-if="project.recentChanges > 0" color="warning" variant="subtle" size="xs">
                    {{ project.recentChanges }} change{{ project.recentChanges !== 1 ? 's' : '' }}
                  </UBadge>
                  <UBadge :color="(PROJECT_STATUS_COLORS[project.status] as any)" variant="subtle" size="xs">
                    {{ project.status }}
                  </UBadge>
                </div>
              </div>

              <!-- Tech stack badges -->
              <div v-if="project.techStack?.length" class="flex flex-wrap gap-1">
                <UBadge
                  v-for="tech in project.techStack"
                  :key="tech"
                  :color="(techColor(tech) as any)"
                  variant="subtle"
                  size="xs"
                >
                  {{ tech }}
                </UBadge>
              </div>

              <!-- Stats -->
              <div class="flex items-center gap-4 text-xs text-[var(--ui-text-muted)]">
                <span>{{ project.serviceCount }} services</span>
                <span v-if="project.estimateUsd > 0">{{ fmt(project.estimateUsd) }}/mo</span>
                <span v-else class="text-[var(--ui-success)]">$0</span>
              </div>

              <!-- Links -->
              <div class="flex gap-2" @click.stop>
                <a v-if="project.productionUrl" :href="project.productionUrl" target="_blank" rel="noopener" class="text-xs text-[var(--ui-primary)] hover:underline flex items-center gap-1">
                  <UIcon name="i-lucide-external-link" class="size-3" /> Live
                </a>
                <a v-if="project.repoUrl" :href="project.repoUrl" target="_blank" rel="noopener" class="text-xs text-[var(--ui-text-muted)] hover:underline flex items-center gap-1">
                  <UIcon name="i-lucide-github" class="size-3" /> Repo
                </a>
              </div>

              <!-- Expanded: Change History Timeline -->
              <div v-if="expandedProjects.has(project.slug)" class="border-t border-[var(--ui-border)] pt-3" @click.stop>
                <p class="text-xs font-medium text-[var(--ui-text-muted)] mb-2">Change History</p>

                <div v-if="loadingChanges.has(project.slug)" class="flex items-center gap-2 text-xs text-[var(--ui-text-dimmed)]">
                  <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" /> Loading...
                </div>

                <div v-else-if="projectChanges[project.slug]?.length" class="space-y-1.5">
                  <div v-for="change in projectChanges[project.slug]" :key="change.id" class="flex items-start gap-2 text-xs">
                    <div class="mt-0.5 size-1.5 rounded-full shrink-0" :class="{
                      'bg-[var(--ui-success)]': change.action === 'drift_new',
                      'bg-[var(--ui-error)]': change.action === 'drift_removed',
                      'bg-[var(--ui-warning)]': change.action === 'drift_changed',
                    }" />
                    <div class="min-w-0 flex-1">
                      <span :class="DRIFT_ACTION_COLORS[change.action] ?? ''">
                        {{ DRIFT_ACTION_LABELS[change.action] ?? change.action }}
                      </span>
                      <span class="text-[var(--ui-text-muted)]">{{ change.service }}</span>
                      <span class="text-[var(--ui-text-dimmed)]">&mdash; {{ change.detail }}</span>
                    </div>
                    <span class="text-[var(--ui-text-dimmed)] shrink-0">{{ timeAgoShort(change.createdAt) }}</span>
                  </div>
                </div>

                <p v-else class="text-xs text-[var(--ui-text-dimmed)]">No recorded changes</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Paused/archived projects -->
        <div v-if="pausedProjects.length" class="mt-3">
          <p class="text-xs text-[var(--ui-text-dimmed)] mb-2">Paused / Archived</p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="project in pausedProjects"
              :key="project.id"
              color="neutral"
              variant="outline"
              size="sm"
            >
              {{ project.name }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- GitHub Discovery -->
      <div v-if="loggedIn">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-display text-lg font-bold">GitHub Discovery</h2>
            <UBadge v-if="discovery?.untracked.length" color="warning" variant="subtle" size="xs">
              {{ discovery.untracked.length }} untracked
            </UBadge>
          </div>
          <UButton
            icon="i-lucide-scan-search"
            label="Scan Repos"
            variant="outline"
            size="sm"
            :loading="scanning"
            @click="scanRepos"
          />
        </div>

        <div v-if="!discovery && !scanning" class="rounded-lg border border-dashed border-[var(--ui-border)] px-6 py-4 text-center text-sm text-[var(--ui-text-muted)]">
          Scan GitHub repos to discover untracked projects
        </div>

        <div v-if="discovery">
          <!-- Summary -->
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
            <div class="rounded-lg border border-[var(--ui-border)] px-4 py-2 text-center">
              <p class="text-lg font-bold">{{ discovery.totalRepos }}</p>
              <p class="text-[10px] text-[var(--ui-text-dimmed)]">total repos</p>
            </div>
            <div class="rounded-lg border border-[var(--ui-success)] px-4 py-2 text-center">
              <p class="text-lg font-bold text-[var(--ui-success)]">{{ discovery.tracked.length }}</p>
              <p class="text-[10px] text-[var(--ui-text-dimmed)]">tracked</p>
            </div>
            <div class="rounded-lg border px-4 py-2 text-center" :class="discovery.untracked.length ? 'border-[var(--ui-warning)]' : 'border-[var(--ui-border)]'">
              <p class="text-lg font-bold" :class="discovery.untracked.length ? 'text-[var(--ui-warning)]' : ''">{{ discovery.untracked.length }}</p>
              <p class="text-[10px] text-[var(--ui-text-dimmed)]">untracked</p>
            </div>
            <div class="rounded-lg border border-[var(--ui-border)] px-4 py-2 text-center">
              <p class="text-lg font-bold text-[var(--ui-text-muted)]">{{ discovery.archived.length }}</p>
              <p class="text-[10px] text-[var(--ui-text-dimmed)]">archived</p>
            </div>
          </div>

          <!-- Untracked repos -->
          <div v-if="discovery.untracked.length" class="space-y-2">
            <p class="text-xs font-medium text-[var(--ui-warning)]">Untracked Repositories</p>
            <UCard v-for="repo in discovery.untracked" :key="repo.fullName" class="transition-shadow hover:shadow-md">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <a :href="repo.url" target="_blank" rel="noopener" class="font-medium text-[var(--ui-primary)] hover:underline truncate">
                      {{ repo.fullName }}
                    </a>
                    <UBadge v-if="repo.isPrivate" color="neutral" variant="outline" size="xs">private</UBadge>
                    <UBadge v-if="repo.hasDeployment" color="warning" variant="subtle" size="xs">
                      <UIcon name="i-lucide-cloud" class="size-3 mr-0.5" /> deployed
                    </UBadge>
                  </div>
                  <p v-if="repo.description" class="text-xs text-[var(--ui-text-muted)] line-clamp-1 mt-0.5">{{ repo.description }}</p>
                  <div class="flex flex-wrap items-center gap-2 mt-1.5">
                    <UBadge v-for="tech in repo.techStack" :key="tech" :color="(techColor(tech) as any)" variant="subtle" size="xs">
                      {{ tech }}
                    </UBadge>
                    <UBadge v-for="ind in repo.deploymentIndicators" :key="ind" color="warning" variant="outline" size="xs">
                      {{ ind }}
                    </UBadge>
                  </div>
                </div>
                <div class="text-right text-xs text-[var(--ui-text-muted)] shrink-0">
                  <p>{{ timeAgoShort(repo.lastPushed) }}</p>
                  <p class="text-[var(--ui-text-dimmed)]">{{ repo.owner }}</p>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Errors -->
          <div v-if="discovery.errors.length" class="mt-3 rounded-lg border border-[var(--ui-error)] bg-[var(--ui-error)]/5 px-4 py-2">
            <p class="text-xs font-medium text-[var(--ui-error)] mb-1">Scan Errors</p>
            <p v-for="(err, i) in discovery.errors" :key="i" class="text-xs text-[var(--ui-text-muted)]">{{ err }}</p>
          </div>

          <p class="text-xs text-[var(--ui-text-dimmed)] text-right mt-2">
            Scanned: {{ new Date(discovery.scannedAt).toLocaleString() }}
          </p>
        </div>
      </div>

      <!-- Monitor cards -->
      <div>
        <h2 class="font-display text-lg font-bold mb-3">Monitors</h2>
        <div class="space-y-3">
          <UCard
            v-for="monitor in data.monitors"
            :key="monitor.id"
            class="cursor-pointer transition-shadow hover:shadow-md"
            @click="toggle(monitor.id)"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <UIcon
                  :name="expanded.has(monitor.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-4 text-[var(--ui-text-muted)] shrink-0"
                />
                <UIcon
                  :name="statusIcon(monitor.status)"
                  class="size-5 shrink-0"
                  :class="{
                    'text-[var(--ui-success)]': monitor.status === 'up',
                    'text-[var(--ui-error)]': monitor.status === 'down' || monitor.status === 'seems_down',
                    'text-[var(--ui-warning)]': monitor.status === 'paused',
                    'text-[var(--ui-text-muted)]': monitor.status === 'not_checked',
                  }"
                />
                <div>
                  <p class="font-medium">{{ monitor.name }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ monitor.url }}</p>
                </div>
              </div>

              <div class="flex items-center gap-4 text-right">
                <div v-if="monitor.responseTime !== null">
                  <p class="text-sm font-mono">{{ monitor.responseTime }}ms</p>
                  <p class="text-[10px] text-[var(--ui-text-dimmed)]">response</p>
                </div>
                <div>
                  <p class="text-sm font-mono">{{ monitor.uptimeRatio }}%</p>
                  <p class="text-[10px] text-[var(--ui-text-dimmed)]">uptime</p>
                </div>
                <div>
                  <p class="text-sm font-mono">{{ Math.round(monitor.checkInterval / 60) }}m</p>
                  <p class="text-[10px] text-[var(--ui-text-dimmed)]">interval</p>
                </div>
                <UBadge :color="(statusColor(monitor.status) as any)" variant="subtle" size="sm">
                  {{ monitor.status.replace('_', ' ') }}
                </UBadge>
              </div>
            </div>

            <!-- Expanded detail -->
            <div v-if="expanded.has(monitor.id)" class="border-t border-[var(--ui-border)] pt-3 mt-3" @click.stop>
              <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">Endpoint</p>
                  <a :href="monitor.url" target="_blank" rel="noopener" class="text-[var(--ui-primary)] hover:underline break-all">
                    {{ monitor.url }}
                  </a>
                </div>
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">Check Interval</p>
                  <p>Every {{ Math.round(monitor.checkInterval / 60) }} minutes</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">Monitor ID</p>
                  <p class="font-mono text-[var(--ui-text-muted)]">{{ monitor.id }}</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">Status</p>
                  <p :class="{
                    'text-[var(--ui-success)]': monitor.status === 'up',
                    'text-[var(--ui-error)]': monitor.status === 'down' || monitor.status === 'seems_down',
                  }">
                    {{ monitor.status.replace('_', ' ') }}
                  </p>
                </div>
              </div>
              <!-- Uptime breakdown -->
              <div v-if="monitor.uptime7d !== null" class="mt-3 flex gap-6 text-sm">
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">7-day uptime</p>
                  <p class="font-mono">{{ monitor.uptime7d }}%</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">30-day uptime</p>
                  <p class="font-mono">{{ monitor.uptime30d }}%</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">90-day uptime</p>
                  <p class="font-mono">{{ monitor.uptime90d }}%</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--ui-text-muted)]">All-time uptime</p>
                  <p class="font-mono">{{ monitor.uptimeRatio }}%</p>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <p class="text-xs text-[var(--ui-text-dimmed)] text-right">
        Checked: {{ new Date().toLocaleString() }} &middot; Live from UptimeRobot API
      </p>
    </template>

    <div v-else class="py-8 text-center text-[var(--ui-text-muted)]">
      <p>{{ data?.error || 'Unable to load status data' }}</p>
      <p class="mt-1 text-sm">Configure UPTIMEROBOT_API_KEY to enable monitoring.</p>
    </div>
  </div>
</template>
