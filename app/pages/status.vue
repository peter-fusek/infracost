<script setup lang="ts">
interface Monitor {
  id: number
  name: string
  url: string
  status: string
  isUp: boolean
  uptimeRatio: number
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

const { data, status, refresh } = await useFetch<StatusResponse>('/api/status')

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
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">Service Status</h2>
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

    <div v-if="status === 'pending'" class="flex justify-center py-8">
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

      <!-- Monitor cards -->
      <div class="space-y-3">
        <UCard v-for="monitor in data.monitors" :key="monitor.id">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UIcon
                :name="statusIcon(monitor.status)"
                class="size-5"
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
              <UBadge :color="(statusColor(monitor.status) as any)" variant="subtle" size="sm">
                {{ monitor.status.replace('_', ' ') }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>
    </template>

    <div v-else class="py-8 text-center text-[var(--ui-text-muted)]">
      <p>{{ data?.error || 'Unable to load status data' }}</p>
      <p class="mt-1 text-sm">Configure UPTIMEROBOT_API_KEY to enable monitoring.</p>
    </div>
  </div>
</template>
