<script setup lang="ts">
interface Alert {
  id: number
  severity: string
  status: string
  alertType: string
  message: string
  budgetName: string | null
  createdAt: string
  resolvedAt: string | null
}

const { loggedIn } = useUserSession()
const toast = useToast()

// Filters
const statusFilter = ref('all')
const severityFilter = ref('')
const typeFilter = ref('')
const monthsFilter = ref('1')

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Resolved', value: 'resolved' },
]

const SEVERITY_OPTIONS = [
  { label: 'All Severities', value: '' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
]

const TYPE_OPTIONS = [
  { label: 'All Types', value: '' },
  { label: 'Budget', value: 'budget' },
  { label: 'Anomaly', value: 'anomaly' },
  { label: 'Drift', value: 'drift' },
  { label: 'Plan Limit', value: 'plan_limit' },
]

const MONTHS_OPTIONS = [
  { label: 'This Month', value: '1' },
  { label: 'Last 3 Months', value: '3' },
  { label: 'Last 6 Months', value: '6' },
  { label: 'All Time', value: 'all' },
]

const queryParams = computed(() => ({
  status: statusFilter.value,
  severity: severityFilter.value || undefined,
  type: typeFilter.value || undefined,
  months: monthsFilter.value,
  limit: 100,
}))

const { data, status, refresh } = await useFetch<{ alerts: Alert[]; total: number }>('/api/alerts', {
  query: queryParams,
  watch: [queryParams],
})

const alerts = computed(() => data.value?.alerts ?? [])
const totalCount = computed(() => data.value?.total ?? 0)

const pendingCount = computed(() => alerts.value.filter(a => a.status === 'pending').length)

// Selection state
const selectedIds = ref<Set<number>>(new Set())
const bulkUpdating = ref(false)

const allSelected = computed(() => {
  const unresolvedIds = alerts.value.filter(a => a.status !== 'resolved').map(a => a.id)
  return unresolvedIds.length > 0 && unresolvedIds.every(id => selectedIds.value.has(id))
})

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(alerts.value.filter(a => a.status !== 'resolved').map(a => a.id))
  }
}

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

// Clear selection when filters change
watch(queryParams, () => { selectedIds.value = new Set() })

async function bulkUpdate(newStatus: 'acknowledged' | 'resolved') {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  bulkUpdating.value = true
  try {
    const result = await $fetch('/api/alerts/bulk', { method: 'PATCH', body: { ids, status: newStatus } })
    selectedIds.value = new Set()
    await refresh()
    toast.add({ title: `${result.updated} alert${result.updated !== 1 ? 's' : ''} ${newStatus}`, color: 'success' })
  }
  catch {
    toast.add({ title: 'Bulk update failed', color: 'error' })
  }
  finally {
    bulkUpdating.value = false
  }
}

async function updateAlert(id: number, newStatus: 'acknowledged' | 'resolved') {
  try {
    await $fetch(`/api/alerts/${id}`, { method: 'PATCH', body: { status: newStatus } })
    await refresh()
    toast.add({ title: `Alert ${newStatus}`, color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to update alert', color: 'error' })
  }
}

const SEVERITY_ICONS: Record<string, string> = {
  critical: 'i-lucide-alert-triangle',
  warning: 'i-lucide-alert-circle',
  info: 'i-lucide-info',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  sent: 'info',
  acknowledged: 'neutral',
  resolved: 'success',
}

function typeLabel(alertType: string): string {
  if (alertType.startsWith('budget')) return 'Budget'
  if (alertType.startsWith('anomaly')) return 'Anomaly'
  if (alertType.startsWith('drift')) return 'Drift'
  if (alertType.startsWith('plan_limit')) return 'Plan Limit'
  return alertType
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Alerts</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Budget, anomaly, drift &amp; plan limit alerts
        </p>
      </div>
      <UBadge v-if="pendingCount > 0" color="warning" variant="solid" size="lg">
        {{ pendingCount }} pending
      </UBadge>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <USelectMenu
        v-model="statusFilter"
        :items="STATUS_OPTIONS"
        value-key="value"
        class="w-36"
        size="sm"
      />
      <USelectMenu
        v-model="severityFilter"
        :items="SEVERITY_OPTIONS"
        value-key="value"
        class="w-36"
        size="sm"
      />
      <USelectMenu
        v-model="typeFilter"
        :items="TYPE_OPTIONS"
        value-key="value"
        class="w-36"
        size="sm"
      />
      <USelectMenu
        v-model="monthsFilter"
        :items="MONTHS_OPTIONS"
        value-key="value"
        class="w-36"
        size="sm"
      />
      <span class="ml-auto text-xs text-[var(--ui-text-dimmed)]">
        {{ totalCount }} alert{{ totalCount !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Bulk action toolbar -->
    <div v-if="loggedIn && selectedIds.size > 0" class="flex items-center gap-3 rounded-lg border border-[var(--ui-primary)] bg-[var(--ui-primary)]/5 px-4 py-2">
      <span class="text-sm font-medium">{{ selectedIds.size }} selected</span>
      <UButton
        icon="i-lucide-eye"
        label="Acknowledge"
        size="xs"
        variant="soft"
        :loading="bulkUpdating"
        @click="bulkUpdate('acknowledged')"
      />
      <UButton
        icon="i-lucide-check-check"
        label="Resolve All"
        size="xs"
        variant="solid"
        :loading="bulkUpdating"
        @click="bulkUpdate('resolved')"
      />
      <UButton
        icon="i-lucide-x"
        label="Clear"
        size="xs"
        variant="ghost"
        @click="selectedIds = new Set()"
      />
    </div>

    <!-- Loading -->
    <SkeletonLoader v-if="status === 'pending'" variant="list" :rows="5" />

    <!-- Empty state -->
    <div v-else-if="!alerts.length" class="py-12 text-center">
      <UIcon name="i-lucide-bell-off" class="mx-auto size-8 text-[var(--ui-text-dimmed)]" />
      <p class="mt-3 font-medium text-[var(--ui-text-muted)]">No alerts found</p>
      <p class="mt-1 text-sm text-[var(--ui-text-dimmed)]">
        Adjust filters or check back after the next collection run.
      </p>
    </div>

    <!-- Alert list -->
    <div v-else class="space-y-3">
      <!-- Select all -->
      <div v-if="loggedIn" class="flex items-center gap-2 px-1">
        <input
          type="checkbox"
          :checked="allSelected"
          class="size-4 rounded border-[var(--ui-border)] accent-emerald-500"
          @change="toggleSelectAll"
        >
        <span class="text-xs text-[var(--ui-text-dimmed)]">Select all unresolved</span>
      </div>

      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
        :class="{
          'border-[var(--ui-error)] bg-[var(--ui-error)]/5': alert.severity === 'critical' && alert.status !== 'resolved',
          'border-[var(--ui-warning)] bg-[var(--ui-warning)]/5': alert.severity === 'warning' && alert.status !== 'resolved',
          'border-[var(--ui-border)] bg-[var(--ui-bg)]': alert.severity === 'info' || alert.status === 'resolved',
          'ring-2 ring-[var(--ui-primary)]': selectedIds.has(alert.id),
        }"
      >
        <div class="flex items-center gap-3 min-w-0">
          <input
            v-if="loggedIn && alert.status !== 'resolved'"
            type="checkbox"
            :checked="selectedIds.has(alert.id)"
            class="size-4 shrink-0 rounded border-[var(--ui-border)] accent-emerald-500"
            @change="toggleSelect(alert.id)"
          >
          <UIcon
            :name="SEVERITY_ICONS[alert.severity] || 'i-lucide-info'"
            class="size-5 shrink-0"
            :class="{
              'text-[var(--ui-error)]': alert.severity === 'critical',
              'text-[var(--ui-warning)]': alert.severity === 'warning',
              'text-[var(--ui-text-dimmed)]': alert.severity === 'info' || alert.status === 'resolved',
            }"
          />
          <div class="min-w-0">
            <p class="text-sm" :class="{ 'text-[var(--ui-text-dimmed)] line-through': alert.status === 'resolved' }">
              {{ alert.message }}
            </p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs text-[var(--ui-text-dimmed)]">{{ timeAgo(alert.createdAt) }}</span>
              <UBadge color="neutral" variant="outline" size="xs">{{ typeLabel(alert.alertType) }}</UBadge>
              <UBadge v-if="alert.budgetName" color="neutral" variant="subtle" size="xs">{{ alert.budgetName }}</UBadge>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UBadge :color="(STATUS_COLORS[alert.status] as any) || 'neutral'" variant="subtle" size="xs">
            {{ alert.status }}
          </UBadge>
          <template v-if="loggedIn && alert.status !== 'resolved'">
            <UButton
              v-if="alert.status === 'pending'"
              icon="i-lucide-eye"
              size="xs"
              variant="ghost"
              title="Acknowledge"
              @click="updateAlert(alert.id, 'acknowledged')"
            />
            <UButton
              icon="i-lucide-check"
              size="xs"
              variant="ghost"
              title="Resolve"
              @click="updateAlert(alert.id, 'resolved')"
            />
          </template>
          <span v-if="alert.resolvedAt" class="text-[10px] text-[var(--ui-text-dimmed)]">
            Resolved {{ timeAgo(alert.resolvedAt) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
