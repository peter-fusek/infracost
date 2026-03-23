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
const toast = useToast()

const expanded = ref<Set<string>>(new Set(highlightPlatform.value ? [highlightPlatform.value] : []))
const collecting = ref(false)

async function triggerCollection() {
  collecting.value = true
  try {
    await $fetch('/api/collect/trigger', { method: 'POST' })
    toast.add({ title: 'Collection started', description: 'Data will refresh shortly', color: 'success' })
    // Refresh data after a short delay for the collection to complete
    setTimeout(() => refresh(), 5000)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to trigger collection', color: 'error' })
  } finally {
    collecting.value = false
  }
}

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const typeIcons: Record<string, string> = {
  web: 'i-lucide-globe',
  database: 'i-lucide-database',
  subscription: 'i-lucide-credit-card',
  cron: 'i-lucide-clock',
  ci_cd: 'i-lucide-git-branch',
  api_usage: 'i-lucide-zap',
  usage: 'i-lucide-activity',
  cloud_run: 'i-lucide-cloud',
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
          v-for="group in data.groups"
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
          <div v-if="expanded.has(group.key)" class="mt-4 border-t border-[var(--ui-border)] pt-4" @click.stop>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[var(--ui-text-muted)]">
                  <th class="pb-2 font-medium">Service</th>
                  <th v-if="groupBy === 'project'" class="pb-2 font-medium">Platform</th>
                  <th v-else class="pb-2 font-medium">Project</th>
                  <th class="pb-2 font-medium">Type</th>
                  <th class="pb-2 text-right font-medium">Est. USD</th>
                  <th class="pb-2 text-right font-medium">MTD USD</th>
                  <th class="pb-2 text-right font-medium">EOM USD</th>
                  <th class="pb-2 text-right font-medium">Variance</th>
                  <th class="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="svc in group.services" :key="svc.serviceId" class="border-t border-[var(--ui-border-muted)]">
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
