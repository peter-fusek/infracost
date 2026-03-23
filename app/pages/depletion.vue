<script setup lang="ts">
interface DepletionPlatform {
  slug: string
  name: string
  creditBalance: number
  creditBalanceEur: number
  dailyBurnRate: number
  dailyBurnRateEur: number
  daysRemaining: number | null
  depletionDate: string | null
  mtd: number
  eomEstimate: number
  riskLevel: 'ok' | 'warning' | 'critical' | 'depleted'
}

interface DepletionResponse {
  platforms: DepletionPlatform[]
  eurUsdRate: number
  checkedAt: string
}

const { data, status, refresh } = await useFetch<DepletionResponse>('/api/depletion')
const { loggedIn } = useUserSession()
const toast = useToast()
const collecting = ref(false)

async function triggerCollection() {
  collecting.value = true
  try {
    await $fetch('/api/collect/trigger', { method: 'POST' })
    toast.add({ title: 'Collection started', description: 'Data will refresh shortly', color: 'success' })
    setTimeout(() => refresh(), 5000)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to trigger collection', color: 'error' })
  } finally {
    collecting.value = false
  }
}

function riskColor(level: string) {
  if (level === 'depleted') return 'error'
  if (level === 'critical') return 'error'
  if (level === 'warning') return 'warning'
  return 'success'
}

function riskIcon(level: string) {
  if (level === 'depleted') return 'i-lucide-x-circle'
  if (level === 'critical') return 'i-lucide-alert-triangle'
  if (level === 'warning') return 'i-lucide-alert-circle'
  return 'i-lucide-check-circle'
}

function fmt(n: number) { return n.toFixed(2) }

function progressPct(p: DepletionPlatform) {
  if (!p.daysRemaining) return 100
  // Show as % of 30 days runway
  return Math.min(100, Math.max(0, Math.round((p.daysRemaining / 30) * 100)))
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Credit Depletion Tracker</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Prepaid platform balances &middot; burn rate &middot; days until empty
        </p>
      </div>
      <UButton
        v-if="loggedIn"
        icon="i-lucide-refresh-cw"
        label="Refresh"
        :loading="collecting"
        @click="triggerCollection"
      />
    </div>

    <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
    </div>

    <template v-else-if="data">
      <div class="space-y-4">
        <UCard v-for="p in data.platforms" :key="p.slug">
          <div class="space-y-4">
            <!-- Header -->
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <UIcon
                  :name="riskIcon(p.riskLevel)"
                  class="size-6"
                  :class="{
                    'text-[var(--ui-success)]': p.riskLevel === 'ok',
                    'text-[var(--ui-warning)]': p.riskLevel === 'warning',
                    'text-[var(--ui-error)]': p.riskLevel === 'critical' || p.riskLevel === 'depleted',
                  }"
                />
                <div>
                  <h3 class="font-display text-lg font-bold">{{ p.name }}</h3>
                  <UBadge :color="(riskColor(p.riskLevel) as any)" variant="subtle" size="xs">
                    {{ p.riskLevel === 'ok' ? 'Healthy' : p.riskLevel }}
                  </UBadge>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold" :class="{
                  'text-[var(--ui-success)]': p.riskLevel === 'ok',
                  'text-[var(--ui-warning)]': p.riskLevel === 'warning',
                  'text-[var(--ui-error)]': p.riskLevel === 'critical' || p.riskLevel === 'depleted',
                }">
                  {{ p.daysRemaining !== null ? `${p.daysRemaining} days` : 'N/A' }}
                </p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">until depleted</p>
              </div>
            </div>

            <!-- Progress bar -->
            <div>
              <div class="flex justify-between text-xs text-[var(--ui-text-muted)] mb-1">
                <span>Balance: ${{ fmt(p.creditBalance) }} (€{{ fmt(p.creditBalanceEur) }})</span>
                <span v-if="p.depletionDate">Empty by {{ p.depletionDate }}</span>
              </div>
              <div class="h-3 w-full rounded-full bg-[var(--ui-bg-elevated)]">
                <div
                  class="h-3 rounded-full transition-all"
                  :class="{
                    'bg-[var(--ui-success)]': p.riskLevel === 'ok',
                    'bg-[var(--ui-warning)]': p.riskLevel === 'warning',
                    'bg-[var(--ui-error)]': p.riskLevel === 'critical' || p.riskLevel === 'depleted',
                  }"
                  :style="{ width: `${progressPct(p)}%` }"
                />
              </div>
            </div>

            <!-- Metrics -->
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
              <div>
                <p class="text-[var(--ui-text-muted)]">Daily Burn</p>
                <p class="font-mono font-medium">${{ fmt(p.dailyBurnRate) }}/day</p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">€{{ fmt(p.dailyBurnRateEur) }}/day</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">MTD Spend</p>
                <p class="font-mono font-medium">${{ fmt(p.mtd) }}</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">EOM Estimate</p>
                <p class="font-mono font-medium">${{ fmt(p.eomEstimate) }}</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">Monthly Rate</p>
                <p class="font-mono font-medium">${{ fmt(p.dailyBurnRate * 30) }}/mo</p>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <p class="text-xs text-[var(--ui-text-dimmed)] text-right">
        Last checked: {{ new Date(data.checkedAt).toLocaleString() }}
      </p>
    </template>
  </div>
</template>
