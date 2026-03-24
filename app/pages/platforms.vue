<script setup lang="ts">
interface Platform {
  id: number
  slug: string
  name: string
  type: string
  collectionMethod: string
  billingCycle: string
  accountIdentifier: string | null
  isActive: boolean
  serviceCount: number
  lastCollectedAt: string | null
  lastRunStatus: string | null
  lastRecordsCollected: number | null
  lastError: string | null
}

interface PlatformService {
  id: number
  name: string
  serviceType: string
  project: string | null
  monthlyCostEstimate: string | null
  metadata: Record<string, unknown> | null
  isActive: boolean
}

interface ProbeResult {
  slug: string
  reachable: boolean
  statusCode: number | null
  latencyMs: number | null
  error: string | null
}

interface StatusResponse {
  total: number
  reachable: number
  unreachable: number
  allReachable: boolean
  platforms: Record<string, ProbeResult>
  checkedAt: string
}

const { data: platformList, status } = await useFetch<Platform[]>('/api/platforms')
const { data: apiStatus, status: apiStatusLoading } = await useFetch<StatusResponse>('/api/platforms/status', { lazy: true })

// Expandable card state
const expanded = ref<Set<string>>(new Set())
const serviceCache = ref<Record<string, PlatformService[]>>({})
const loadingServices = ref<Set<string>>(new Set())

async function toggle(slug: string) {
  if (expanded.value.has(slug)) {
    expanded.value.delete(slug)
    return
  }
  expanded.value.add(slug)
  if (!serviceCache.value[slug]) {
    loadingServices.value.add(slug)
    try {
      const data = await $fetch<{ services: PlatformService[] }>(`/api/platforms/${slug}`)
      serviceCache.value[slug] = data.services
    } catch {
      serviceCache.value[slug] = []
    } finally {
      loadingServices.value.delete(slug)
    }
  }
}

function fmtCost(val: string | null): string {
  if (!val) return '—'
  const n = parseFloat(val)
  return n === 0 ? '$0' : `$${n.toFixed(2)}`
}

const typeColors: Record<string, string> = {
  hosting: 'primary',
  ai: 'warning',
  database: 'success',
  email: 'info',
  sms: 'info',
  cloud: 'secondary',
  ci_cd: 'neutral',
  domain: 'neutral',
  banking: 'neutral',
  monitoring: 'info',
}

function freshnessColor(dateStr: string | null, status: string | null): string {
  if (!dateStr) return 'neutral'
  if (status === 'failed') return 'error'
  const hoursOld = (Date.now() - new Date(dateStr).getTime()) / 3_600_000
  if (hoursOld < 25) return 'success'
  if (hoursOld < 49) return 'warning'
  return 'error'
}

function statusIcon(status: string | null): string {
  if (!status) return 'i-lucide-circle-dashed'
  if (status === 'success') return 'i-lucide-circle-check'
  if (status === 'partial') return 'i-lucide-circle-alert'
  if (status === 'failed') return 'i-lucide-circle-x'
  if (status === 'running') return 'i-lucide-loader-2'
  return 'i-lucide-circle-dashed'
}

function getProbe(slug: string): ProbeResult | null {
  return apiStatus.value?.platforms?.[slug] ?? null
}

// Collection run history (lazy-loaded)
interface CollectionRun {
  id: number
  trigger_type: string
  status: string
  records_collected: number
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

const runsCache = ref<Record<string, CollectionRun[]>>({})
const loadingRuns = ref<Set<string>>(new Set())
const showTab = ref<Record<string, 'services' | 'runs'>>({})

async function loadRuns(slug: string) {
  if (runsCache.value[slug] || loadingRuns.value.has(slug)) return
  loadingRuns.value.add(slug)
  try {
    const data = await $fetch<{ runs: CollectionRun[] }>(`/api/platforms/${slug}/runs`)
    runsCache.value[slug] = data.runs
  }
  catch {
    runsCache.value[slug] = []
  }
  finally {
    loadingRuns.value.delete(slug)
  }
}

function switchTab(slug: string, tab: 'services' | 'runs') {
  showTab.value[slug] = tab
  if (tab === 'runs') loadRuns(slug)
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function runStatusColor(status: string): string {
  if (status === 'success') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'failed') return 'error'
  if (status === 'running') return 'info'
  return 'neutral'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Platforms</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">All monitored infrastructure platforms &middot; {{ platformList?.length ?? 0 }} active</p>
      </div>
      <div v-if="apiStatus" class="flex items-center gap-2 text-sm">
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full" :class="apiStatus.allReachable ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-warning)]'" />
          {{ apiStatus.reachable }}/{{ apiStatus.total }} APIs reachable
        </span>
        <span class="text-xs text-[var(--ui-text-dimmed)]">{{ timeAgo(apiStatus.checkedAt) }}</span>
      </div>
      <UIcon v-else-if="apiStatusLoading === 'pending'" name="i-lucide-loader-2" class="size-4 animate-spin text-[var(--ui-text-dimmed)]" />
    </div>

    <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
    </div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UCard
        v-for="platform in platformList"
        :key="platform.id"
        class="cursor-pointer transition-shadow hover:shadow-md"
        :class="{ 'sm:col-span-2 lg:col-span-3': expanded.has(platform.slug) }"
        @click="toggle(platform.slug)"
      >
        <div class="space-y-3">
          <!-- Header with API status dot -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon
                :name="expanded.has(platform.slug) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-[var(--ui-text-muted)] shrink-0"
              />
              <span
                v-if="getProbe(platform.slug)"
                class="size-2.5 rounded-full shrink-0"
                :class="{
                  'bg-[var(--ui-success)]': getProbe(platform.slug)?.reachable,
                  'bg-[var(--ui-error)]': !getProbe(platform.slug)?.reachable,
                }"
                :title="getProbe(platform.slug)?.reachable
                  ? `API reachable (${getProbe(platform.slug)?.latencyMs}ms)`
                  : `API unreachable: ${getProbe(platform.slug)?.error || 'unknown'}`"
              />
              <span
                v-else-if="apiStatusLoading === 'pending'"
                class="size-2.5 rounded-full bg-[var(--ui-text-dimmed)] animate-pulse shrink-0"
              />
              <h3 class="font-display font-bold">{{ platform.name }}</h3>
            </div>
            <UBadge :color="(typeColors[platform.type] as any) || 'neutral'" variant="subtle" size="sm">
              {{ platform.type }}
            </UBadge>
          </div>

          <!-- Account identifier -->
          <p v-if="platform.accountIdentifier" class="text-xs text-[var(--ui-text-muted)] truncate" :title="platform.accountIdentifier">
            {{ platform.accountIdentifier }}
          </p>

          <!-- Stats row -->
          <div class="flex items-center gap-3 text-xs text-[var(--ui-text-muted)]">
            <span>{{ platform.collectionMethod }}</span>
            <span>&middot;</span>
            <span>{{ platform.billingCycle }}</span>
            <span>&middot;</span>
            <span>{{ platform.serviceCount }} service{{ platform.serviceCount !== 1 ? 's' : '' }}</span>
            <template v-if="getProbe(platform.slug)?.latencyMs">
              <span>&middot;</span>
              <span>{{ getProbe(platform.slug)?.latencyMs }}ms</span>
            </template>
          </div>

          <!-- Collection status -->
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
              <UIcon
                :name="statusIcon(platform.lastRunStatus)"
                class="size-3.5"
                :class="{
                  'text-[var(--ui-success)]': freshnessColor(platform.lastCollectedAt, platform.lastRunStatus) === 'success',
                  'text-[var(--ui-warning)]': freshnessColor(platform.lastCollectedAt, platform.lastRunStatus) === 'warning',
                  'text-[var(--ui-error)]': freshnessColor(platform.lastCollectedAt, platform.lastRunStatus) === 'error',
                  'text-[var(--ui-text-dimmed)]': freshnessColor(platform.lastCollectedAt, platform.lastRunStatus) === 'neutral',
                  'animate-spin': platform.lastRunStatus === 'running',
                }"
              />
              <span>{{ timeAgo(platform.lastCollectedAt) }}</span>
              <span v-if="platform.lastRecordsCollected" class="text-[var(--ui-text-dimmed)]">
                ({{ platform.lastRecordsCollected }} rec)
              </span>
            </div>
            <UBadge
              v-if="platform.lastRunStatus === 'partial' || platform.lastRunStatus === 'failed'"
              color="error"
              variant="subtle"
              size="xs"
              :title="platform.lastError || ''"
            >
              {{ platform.lastRunStatus }}
            </UBadge>
          </div>

          <!-- Expanded detail -->
          <div v-if="expanded.has(platform.slug)" class="border-t border-[var(--ui-border)] pt-3 mt-1" @click.stop>
            <!-- Tab switcher -->
            <div class="flex items-center gap-1 mb-3 rounded-lg border border-[var(--ui-border)] p-0.5 w-fit">
              <UButton
                size="xs"
                :variant="(showTab[platform.slug] ?? 'services') === 'services' ? 'solid' : 'ghost'"
                label="Services"
                @click="switchTab(platform.slug, 'services')"
              />
              <UButton
                size="xs"
                :variant="showTab[platform.slug] === 'runs' ? 'solid' : 'ghost'"
                label="Collection Runs"
                @click="switchTab(platform.slug, 'runs')"
              />
            </div>

            <!-- Services tab -->
            <template v-if="(showTab[platform.slug] ?? 'services') === 'services'">
              <div v-if="loadingServices.has(platform.slug)" class="flex justify-center py-4">
                <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-[var(--ui-text-muted)]" />
              </div>
              <div v-else-if="serviceCache[platform.slug]?.length" class="overflow-x-auto">
                <table class="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr class="text-left text-[var(--ui-text-muted)]">
                      <th class="pb-2 font-medium">Service</th>
                      <th class="pb-2 font-medium">Type</th>
                      <th class="pb-2 font-medium">Project</th>
                      <th class="pb-2 text-right font-medium">Est. Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="svc in serviceCache[platform.slug]" :key="svc.id" class="border-t border-[var(--ui-border-muted)]">
                      <td class="py-1.5">
                        <div class="flex items-center gap-1.5">
                          <UIcon :name="typeIcons[svc.serviceType] ?? 'i-lucide-box'" class="size-3.5 text-[var(--ui-text-muted)]" />
                          <span>{{ svc.name }}</span>
                        </div>
                      </td>
                      <td class="py-1.5">
                        <UBadge variant="subtle" size="xs" color="neutral">{{ svc.serviceType }}</UBadge>
                      </td>
                      <td class="py-1.5 text-[var(--ui-text-muted)]">{{ svc.project || '—' }}</td>
                      <td class="py-1.5 text-right font-mono">{{ fmtCost(svc.monthlyCostEstimate) }}</td>
                    </tr>
                  </tbody>
                </table>
                <div class="mt-3 flex justify-end">
                  <NuxtLink
                    :to="{ path: '/breakdown', query: { groupBy: 'platform', platform: platform.slug } }"
                    class="text-xs text-[var(--ui-primary)] hover:underline flex items-center gap-1"
                  >
                    <UIcon name="i-lucide-arrow-right" class="size-3" />
                    View in breakdown
                  </NuxtLink>
                </div>
              </div>
              <p v-else class="text-sm text-[var(--ui-text-muted)] py-2">No active services</p>
            </template>

            <!-- Collection Runs tab -->
            <template v-else>
              <div v-if="loadingRuns.has(platform.slug)" class="flex justify-center py-4">
                <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-[var(--ui-text-muted)]" />
              </div>
              <div v-else-if="runsCache[platform.slug]?.length" class="overflow-x-auto">
                <table class="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr class="text-left text-[var(--ui-text-muted)]">
                      <th class="pb-2 font-medium">Time</th>
                      <th class="pb-2 font-medium">Trigger</th>
                      <th class="pb-2 font-medium">Status</th>
                      <th class="pb-2 text-right font-medium">Records</th>
                      <th class="pb-2 text-right font-medium">Duration</th>
                      <th class="pb-2 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="run in runsCache[platform.slug]" :key="run.id" class="border-t border-[var(--ui-border-muted)]">
                      <td class="py-1.5 text-xs">{{ timeAgo(run.started_at) }}</td>
                      <td class="py-1.5">
                        <UBadge variant="outline" size="xs" color="neutral">{{ run.trigger_type }}</UBadge>
                      </td>
                      <td class="py-1.5">
                        <UBadge :color="(runStatusColor(run.status) as any)" variant="subtle" size="xs">{{ run.status }}</UBadge>
                      </td>
                      <td class="py-1.5 text-right font-mono">{{ run.records_collected }}</td>
                      <td class="py-1.5 text-right font-mono text-[var(--ui-text-muted)]">{{ fmtDuration(run.duration_ms) }}</td>
                      <td class="py-1.5 text-xs text-[var(--ui-error)] truncate max-w-[200px]" :title="run.error_message || ''">
                        {{ run.error_message || '—' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="text-sm text-[var(--ui-text-muted)] py-2">No collection runs recorded</p>
            </template>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
