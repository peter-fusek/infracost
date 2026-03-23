<script setup lang="ts">
interface LimitMetric {
  metric: string
  label: string
  used: number | null
  usedFormatted: string
  limit: number
  limitFormatted: string
  pct: number | null
  riskLevel: 'ok' | 'warning' | 'critical' | 'exceeded' | 'unknown'
}

interface PlatformLimits {
  slug: string
  name: string
  metrics: LimitMetric[]
  worstRisk: 'ok' | 'warning' | 'critical' | 'exceeded' | 'unknown'
}

interface LimitsResponse {
  platforms: PlatformLimits[]
  checkedAt: string
}

const { data, status, refresh } = await useFetch<LimitsResponse>('/api/limits')
const { loggedIn } = useUserSession()
const toast = useToast()
const collecting = ref(false)

async function triggerCollection() {
  collecting.value = true
  try {
    await $fetch('/api/collect/trigger', { method: 'POST' })
    toast.add({ title: 'Collection started', description: 'Limits will refresh shortly', color: 'success' })
    setTimeout(() => refresh(), 5000)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to trigger collection', color: 'error' })
  } finally {
    collecting.value = false
  }
}

function riskColor(level: string) {
  if (level === 'exceeded') return 'error'
  if (level === 'critical') return 'error'
  if (level === 'warning') return 'warning'
  if (level === 'ok') return 'success'
  return 'neutral'
}

function riskIcon(level: string) {
  if (level === 'exceeded') return 'i-lucide-x-circle'
  if (level === 'critical') return 'i-lucide-alert-triangle'
  if (level === 'warning') return 'i-lucide-alert-circle'
  if (level === 'ok') return 'i-lucide-check-circle'
  return 'i-lucide-circle-dashed'
}

function riskLabel(level: string) {
  if (level === 'exceeded') return 'Exceeded'
  if (level === 'critical') return 'Critical'
  if (level === 'warning') return 'Warning'
  if (level === 'ok') return 'OK'
  return 'Unknown'
}

function barColor(level: string) {
  if (level === 'exceeded' || level === 'critical') return 'bg-[var(--ui-error)]'
  if (level === 'warning') return 'bg-[var(--ui-warning)]'
  if (level === 'ok') return 'bg-[var(--ui-success)]'
  return 'bg-[var(--ui-text-dimmed)]'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Plan Limits</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Free tier usage across {{ data?.platforms?.length ?? 0 }} platforms
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
        <UCard v-for="platform in data.platforms" :key="platform.slug">
          <div class="space-y-4">
            <!-- Platform header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <UIcon
                  :name="riskIcon(platform.worstRisk)"
                  class="size-5"
                  :class="{
                    'text-[var(--ui-success)]': platform.worstRisk === 'ok',
                    'text-[var(--ui-warning)]': platform.worstRisk === 'warning',
                    'text-[var(--ui-error)]': platform.worstRisk === 'critical' || platform.worstRisk === 'exceeded',
                    'text-[var(--ui-text-dimmed)]': platform.worstRisk === 'unknown',
                  }"
                />
                <h3 class="font-display text-lg font-bold">{{ platform.name }}</h3>
              </div>
              <UBadge :color="(riskColor(platform.worstRisk) as any)" variant="subtle" size="sm">
                {{ riskLabel(platform.worstRisk) }}
              </UBadge>
            </div>

            <!-- Metrics -->
            <div class="space-y-3">
              <div v-for="m in platform.metrics" :key="m.metric" class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium">{{ m.label }}</span>
                  <span class="text-[var(--ui-text-muted)]">
                    <template v-if="m.pct !== null">
                      {{ m.usedFormatted }} / {{ m.limitFormatted }}
                      <span class="font-mono ml-1" :class="{
                        'text-[var(--ui-success)]': m.riskLevel === 'ok',
                        'text-[var(--ui-warning)]': m.riskLevel === 'warning',
                        'text-[var(--ui-error)]': m.riskLevel === 'critical' || m.riskLevel === 'exceeded',
                      }">
                        ({{ m.pct }}%)
                      </span>
                    </template>
                    <template v-else>
                      <span class="text-[var(--ui-text-dimmed)]">{{ m.limitFormatted }} limit — usage N/A</span>
                    </template>
                  </span>
                </div>
                <div class="h-2 w-full rounded-full bg-[var(--ui-bg-elevated)]">
                  <div
                    v-if="m.pct !== null"
                    class="h-2 rounded-full transition-all"
                    :class="barColor(m.riskLevel)"
                    :style="{ width: `${Math.min(m.pct, 100)}%` }"
                  />
                  <div
                    v-else
                    class="h-2 w-full rounded-full bg-[var(--ui-border)]"
                    style="background: repeating-linear-gradient(45deg, transparent, transparent 4px, var(--ui-border) 4px, var(--ui-border) 8px)"
                  />
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <p class="text-xs text-[var(--ui-text-dimmed)] text-right">
        Based on latest collection &middot; {{ new Date(data.checkedAt).toLocaleString() }}
      </p>
    </template>
  </div>
</template>
