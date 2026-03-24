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
}

const { data, status, refresh } = await useFetch<StatusResponse>('/api/status')
const { data: projectsData } = await useFetch<{ projects: Project[] }>('/api/projects')

const refreshing = ref(false)
async function doRefresh() {
  refreshing.value = true
  try { await refresh() }
  finally { refreshing.value = false }
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

      <!-- Projects section -->
      <div v-if="projectsData?.projects?.length">
        <h2 class="font-display text-lg font-bold mb-3">Projects</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UCard v-for="project in activeProjects" :key="project.id" class="transition-shadow hover:shadow-md">
            <div class="space-y-3">
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="font-display font-bold">{{ project.name }}</h3>
                  <p v-if="project.description" class="text-xs text-[var(--ui-text-muted)] line-clamp-1">{{ project.description }}</p>
                </div>
                <UBadge :color="(PROJECT_STATUS_COLORS[project.status] as any)" variant="subtle" size="xs">
                  {{ project.status }}
                </UBadge>
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
              <div class="flex gap-2">
                <a v-if="project.productionUrl" :href="project.productionUrl" target="_blank" rel="noopener" class="text-xs text-[var(--ui-primary)] hover:underline flex items-center gap-1">
                  <UIcon name="i-lucide-external-link" class="size-3" /> Live
                </a>
                <a v-if="project.repoUrl" :href="project.repoUrl" target="_blank" rel="noopener" class="text-xs text-[var(--ui-text-muted)] hover:underline flex items-center gap-1">
                  <UIcon name="i-lucide-github" class="size-3" /> Repo
                </a>
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
