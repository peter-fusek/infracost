<script setup lang="ts">
interface ServiceBreakdown {
  serviceId: number
  name: string
  project: string | null
  platformName: string
  platformSlug: string
  platformType: string
  serviceType: string
  estimateUsd: number
  estimateEur: number
  actualMtdUsd: number
  actualMtdEur: number
  eomUsd: number
  eomEur: number
  costType: string
  collectionMethod: string
  recordCount: number
  variance: number
}

interface GroupBreakdown {
  key: string
  label: string
  type: string
  totalEstimateUsd: number
  totalEstimateEur: number
  totalActualMtdUsd: number
  totalActualMtdEur: number
  totalEomUsd: number
  totalEomEur: number
  lastCollectedAt: string | null
  lastRunStatus: string | null
  services: ServiceBreakdown[]
}

interface BreakdownResponse {
  groupBy: string
  monthProgress: number
  eurUsdRate: number
  grandTotal: {
    estimateUsd: number
    estimateEur: number
    mtdUsd: number
    mtdEur: number
    eomUsd: number
    eomEur: number
  }
  groups: GroupBreakdown[]
  projects: string[]
  lastUpdatedAt: string | null
  nextUpdateAt: string
}

const route = useRoute()
const groupBy = ref<'platform' | 'project'>((route.query.groupBy as 'platform' | 'project') || 'platform')
const highlightPlatform = ref<string | null>((route.query.platform as string) || null)

const { data, status, refresh } = await useFetch<BreakdownResponse>('/api/costs/breakdown', {
  query: { groupBy },
  watch: [groupBy],
})

const { loggedIn } = useUserSession()
const { collecting, triggerCollection } = useCollectionTrigger(() => refresh())

const expanded = ref<Set<string>>(new Set(highlightPlatform.value ? [highlightPlatform.value] : []))

function toggle(key: string) {
  if (expanded.value.has(key)) {
    expanded.value.delete(key)
  } else {
    expanded.value.add(key)
  }
}

function fmt(n: number) {
  return n.toFixed(2)
}

function varianceClass(v: number) {
  if (v > 5) return 'text-[var(--ui-error)]'
  if (v < -5) return 'text-[var(--ui-success)]'
  return 'text-[var(--ui-text-muted)]'
}

function groupIcon(type: string) {
  if (type === 'project') return 'i-lucide-folder'
  if (type === 'ai') return 'i-lucide-brain'
  if (type === 'hosting') return 'i-lucide-server'
  if (type === 'database') return 'i-lucide-database'
  return 'i-lucide-box'
}

// Auto-scroll to highlighted platform on mount
onMounted(() => {
  if (highlightPlatform.value) {
    nextTick(() => {
      const el = document.getElementById(`breakdown-${highlightPlatform.value}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Clear highlight after scroll animation
      setTimeout(() => { highlightPlatform.value = null }, 2000)
    })
  }
})

const platformTooltips: Record<string, string> = {
  'anthropic': 'Anthropic Claude API — programmatic access for agents, MCP servers, and automations. Pay-per-token from prepaid credits.',
  'claude-max': 'Claude Max — subscription for claude.ai web/app. Includes Extra Usage Credits for heavy use months.',
}

// CSV export
const { downloadCsv } = useCsvExport()

function exportBreakdownCsv() {
  if (!data.value) return
  const headers = ['Group', 'Service', 'Platform', 'Project', 'Type', 'Estimate USD', 'MTD USD', 'EOM USD', 'Variance USD', 'Source']
  const rows: (string | number | null)[][] = []
  for (const group of filteredGroups.value) {
    for (const svc of group.services) {
      rows.push([group.label, svc.name, svc.platformName, svc.project, svc.serviceType, svc.estimateUsd, svc.actualMtdUsd, svc.eomUsd, svc.variance, svc.collectionMethod])
    }
  }
  const month = new Date().toISOString().slice(0, 7)
  downloadCsv(`infracost-breakdown-${month}.csv`, headers, rows)
}

// Sorting
type SortKey = 'name' | 'cost' | 'variance'
const sortBy = ref<SortKey>('cost')

const SORT_OPTIONS = [
  { label: 'Name A-Z', value: 'name' as const },
  { label: 'Cost (highest)', value: 'cost' as const },
  { label: 'Variance (highest)', value: 'variance' as const },
]

// Filtering
const filterProject = ref<string>('')
const searchQuery = ref('')

// Available projects for filter dropdown
const projectOptions = computed(() => {
  if (!data.value) return []
  return ['', ...data.value.projects].map(p => ({ label: p || 'All projects', value: p }))
})

// Sorted + filtered groups
const filteredGroups = computed(() => {
  if (!data.value) return []
  let groups = [...data.value.groups]

  // Filter by project (when grouping by platform, show only groups that have services for that project)
  if (filterProject.value) {
    groups = groups.map(g => ({
      ...g,
      services: g.services.filter(s => s.project === filterProject.value),
    })).filter(g => g.services.length > 0)
  }

  // Filter by search query (across service names)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    groups = groups.map(g => ({
      ...g,
      services: g.services.filter(s =>
        s.name.toLowerCase().includes(q)
        || s.platformName.toLowerCase().includes(q)
        || (s.project?.toLowerCase().includes(q) ?? false),
      ),
    })).filter(g => g.services.length > 0 || g.label.toLowerCase().includes(q))
  }

  // Sort groups
  if (sortBy.value === 'cost') {
    groups.sort((a, b) => b.totalEomUsd - a.totalEomUsd)
  }
  else if (sortBy.value === 'variance') {
    const totalVariance = (g: GroupBreakdown) => g.services.reduce((sum, s) => sum + Math.abs(s.variance), 0)
    groups.sort((a, b) => totalVariance(b) - totalVariance(a))
  }
  else {
    groups.sort((a, b) => a.label.localeCompare(b.label))
  }

  return groups
})

// Service sort within expanded groups
type ServiceSortKey = 'name' | 'estimate' | 'mtd' | 'eom' | 'variance'
const serviceSortBy = ref<ServiceSortKey>('eom')
const serviceSortAsc = ref(false)

function toggleServiceSort(key: ServiceSortKey) {
  if (serviceSortBy.value === key) {
    serviceSortAsc.value = !serviceSortAsc.value
  }
  else {
    serviceSortBy.value = key
    serviceSortAsc.value = key === 'name' // default asc for name, desc for numbers
  }
}

function sortedServices(services: ServiceBreakdown[]): ServiceBreakdown[] {
  const sorted = [...services]
  const dir = serviceSortAsc.value ? 1 : -1
  sorted.sort((a, b) => {
    switch (serviceSortBy.value) {
      case 'name': return dir * a.name.localeCompare(b.name)
      case 'estimate': return dir * (a.estimateUsd - b.estimateUsd)
      case 'mtd': return dir * (a.actualMtdUsd - b.actualMtdUsd)
      case 'eom': return dir * (a.eomUsd - b.eomUsd)
      case 'variance': return dir * (a.variance - b.variance)
      default: return 0
    }
  })
  return sorted
}

function sortIndicator(key: ServiceSortKey): string {
  if (serviceSortBy.value !== key) return ''
  return serviceSortAsc.value ? ' ↑' : ' ↓'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Cost Breakdown</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Per-service detail &middot; {{ data?.monthProgress ?? 0 }}% through month &middot; 1 USD = {{ data?.eurUsdRate ?? 0.92 }} EUR
        </p>
        <p v-if="data?.lastUpdatedAt" class="text-xs text-[var(--ui-text-dimmed)]">
          Updated {{ timeAgo(data.lastUpdatedAt) }} &middot; Next update {{ new Date(data.nextUpdateAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="loggedIn"
          icon="i-lucide-refresh-cw"
          label="Refresh"
          size="xs"
          variant="ghost"
          :loading="collecting"
          @click.stop="triggerCollection"
        />
        <div class="flex items-center gap-1 rounded-lg border border-[var(--ui-border)] p-0.5">
          <UButton
            size="xs"
            :variant="groupBy === 'platform' ? 'solid' : 'ghost'"
            icon="i-lucide-server"
            label="By Platform"
            @click="groupBy = 'platform'"
          />
          <UButton
            size="xs"
            :variant="groupBy === 'project' ? 'solid' : 'ghost'"
            icon="i-lucide-folder"
            label="By Project"
            @click="groupBy = 'project'"
          />
        </div>
      </div>
    </div>

    <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
    </div>

    <template v-else-if="data">
      <StaleDataBanner :last-collected-at="data.lastUpdatedAt" />

      <!-- Toolbar: sort, filter, search -->
      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          v-model="sortBy"
          :items="SORT_OPTIONS"
          value-key="value"
          class="w-40"
          size="sm"
          placeholder="Sort by..."
        />
        <USelectMenu
          v-if="data.projects.length > 1"
          v-model="filterProject"
          :items="projectOptions"
          value-key="value"
          class="w-44"
          size="sm"
          placeholder="Filter project..."
        />
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search services..."
          size="sm"
          class="w-48"
          :ui="{ trailing: searchQuery ? 'pr-8' : undefined }"
        />
        <span v-if="searchQuery || filterProject" class="text-xs text-[var(--ui-text-muted)]">
          {{ filteredGroups.length }} group{{ filteredGroups.length !== 1 ? 's' : '' }}
        </span>
        <div class="ml-auto">
          <UButton icon="i-lucide-download" label="CSV" size="sm" variant="outline" @click="exportBreakdownCsv" />
        </div>
      </div>

      <!-- Grand totals -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UCard class="metric-card-mtd">
          <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Monthly Estimate</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">${{ fmt(data.grandTotal.estimateUsd) }}</p>
          <p class="mt-0.5 text-sm tabular-nums text-[var(--ui-text-dimmed)]">€{{ fmt(data.grandTotal.estimateEur) }}</p>
        </UCard>
        <UCard class="metric-card-eom">
          <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">MTD Actual</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">${{ fmt(data.grandTotal.mtdUsd) }}</p>
          <p class="mt-0.5 text-sm tabular-nums text-[var(--ui-text-dimmed)]">€{{ fmt(data.grandTotal.mtdEur) }}</p>
        </UCard>
        <UCard class="metric-card-budget">
          <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">EOM Projected</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">${{ fmt(data.grandTotal.eomUsd) }}</p>
          <p class="mt-0.5 text-sm tabular-nums text-[var(--ui-text-dimmed)]">€{{ fmt(data.grandTotal.eomEur) }}</p>
        </UCard>
      </div>

      <!-- Group accordions -->
      <div class="space-y-3">
        <UCard
          v-for="group in filteredGroups"
          :id="`breakdown-${group.key}`"
          :key="group.key"
          class="cursor-pointer transition-shadow hover:shadow-md"
          :class="{ 'ring-2 ring-[var(--ui-primary)] ring-opacity-50': highlightPlatform === group.key }"
          @click="toggle(group.key)"
        >
          <!-- Group header row -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UIcon
                :name="expanded.has(group.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-[var(--ui-text-muted)]"
              />
              <div class="flex items-center gap-2">
                <UIcon :name="groupIcon(group.type)" class="size-4 text-[var(--ui-text-muted)]" />
                <span class="font-semibold">{{ group.label }}</span>
                <UIcon
                  v-if="platformTooltips[group.key]"
                  name="i-lucide-info"
                  class="size-3.5 text-[var(--ui-text-dimmed)] cursor-help"
                  :title="platformTooltips[group.key]"
                />
                <UBadge
                  :color="group.type === 'ai' ? 'warning' : group.type === 'hosting' ? 'primary' : group.type === 'project' ? 'info' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ group.type === 'project' ? `${group.services.length} services` : group.type }}
                </UBadge>
                <span v-if="group.lastCollectedAt" class="text-xs text-[var(--ui-text-dimmed)]">
                  {{ timeAgo(group.lastCollectedAt) }}
                </span>
              </div>
            </div>
            <div class="flex gap-6 text-right text-sm">
              <div>
                <p class="text-[var(--ui-text-muted)]">Estimate</p>
                <p class="font-medium">${{ fmt(group.totalEstimateUsd) }}</p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">€{{ fmt(group.totalEstimateEur) }}</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">MTD</p>
                <p class="font-medium">${{ fmt(group.totalActualMtdUsd) }}</p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">€{{ fmt(group.totalActualMtdEur) }}</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">EOM</p>
                <p class="font-medium">${{ fmt(group.totalEomUsd) }}</p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">€{{ fmt(group.totalEomEur) }}</p>
              </div>
            </div>
          </div>

          <!-- Expanded service detail -->
          <div v-if="expanded.has(group.key)" class="mt-4 border-t border-[var(--ui-border)] pt-4 overflow-x-auto" @click.stop>
            <table class="w-full text-sm min-w-[700px]">
              <thead>
                <tr class="text-left text-[var(--ui-text-muted)]">
                  <th class="pb-2 font-medium cursor-pointer hover:text-[var(--ui-text)] select-none" @click="toggleServiceSort('name')">Service{{ sortIndicator('name') }}</th>
                  <th v-if="groupBy === 'project'" class="pb-2 font-medium">Platform</th>
                  <th v-else class="pb-2 font-medium">Project</th>
                  <th class="pb-2 font-medium">Type</th>
                  <th class="pb-2 text-right font-medium cursor-pointer hover:text-[var(--ui-text)] select-none" @click="toggleServiceSort('estimate')">Est. USD{{ sortIndicator('estimate') }}</th>
                  <th class="pb-2 text-right font-medium cursor-pointer hover:text-[var(--ui-text)] select-none" @click="toggleServiceSort('mtd')">MTD USD{{ sortIndicator('mtd') }}</th>
                  <th class="pb-2 text-right font-medium cursor-pointer hover:text-[var(--ui-text)] select-none" @click="toggleServiceSort('eom')">EOM USD{{ sortIndicator('eom') }}</th>
                  <th class="pb-2 text-right font-medium cursor-pointer hover:text-[var(--ui-text)] select-none" @click="toggleServiceSort('variance')">Variance{{ sortIndicator('variance') }}</th>
                  <th class="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="svc in sortedServices(group.services)" :key="svc.serviceId" class="border-t border-[var(--ui-border-muted)]">
                  <td class="py-2">
                    <div class="flex items-center gap-1.5">
                      <UIcon :name="typeIcons[svc.serviceType] ?? 'i-lucide-box'" class="size-3.5 text-[var(--ui-text-muted)]" />
                      <span>{{ svc.name }}</span>
                    </div>
                  </td>
                  <td v-if="groupBy === 'project'" class="py-2 text-[var(--ui-text-muted)]">{{ svc.platformName }}</td>
                  <td v-else class="py-2 text-[var(--ui-text-muted)]">{{ svc.project || '—' }}</td>
                  <td class="py-2">
                    <UBadge variant="subtle" size="xs" color="neutral">{{ svc.serviceType }}</UBadge>
                  </td>
                  <td class="py-2 text-right font-mono">${{ fmt(svc.estimateUsd) }}</td>
                  <td class="py-2 text-right font-mono">
                    <template v-if="svc.recordCount > 0">${{ fmt(svc.actualMtdUsd) }}</template>
                    <span v-else class="text-[var(--ui-text-dimmed)]">—</span>
                  </td>
                  <td class="py-2 text-right font-mono">${{ fmt(svc.eomUsd) }}</td>
                  <td class="py-2 text-right font-mono" :class="varianceClass(svc.variance)">
                    <template v-if="svc.variance !== 0">
                      {{ svc.variance > 0 ? '+' : '' }}${{ fmt(svc.variance) }}
                    </template>
                    <span v-else class="text-[var(--ui-text-dimmed)]">—</span>
                  </td>
                  <td class="py-2">
                    <UBadge
                      :color="svc.collectionMethod === 'api' ? 'success' : svc.collectionMethod === 'hybrid' ? 'warning' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ svc.collectionMethod }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
