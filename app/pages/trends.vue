<script setup lang="ts">
interface PlatformTotal {
  platformSlug: string
  platformName: string
  totalUsd: number
  totalEur: number
  recordCount: number
}

interface MonthData {
  month: string
  label: string
  totalUsd: number
  totalEur: number
  momChange: number | null
  byPlatform: PlatformTotal[]
}

interface TrendsResponse {
  months: MonthData[]
  eurUsdRate: number
}

const { data, status } = await useFetch<TrendsResponse>('/api/costs/trends?months=6')

const maxTotal = computed(() => {
  if (!data.value) return 1
  return Math.max(...data.value.months.map(m => m.totalUsd), 1)
})

// Get all unique platforms across all months
const allPlatforms = computed(() => {
  if (!data.value) return []
  const map = new Map<string, string>()
  for (const m of data.value.months) {
    for (const p of m.byPlatform) {
      map.set(p.platformSlug, p.platformName)
    }
  }
  return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }))
})

const platformColors: Record<string, string> = {
  'claude-max': 'var(--ui-warning)',
  'render': 'var(--ui-primary)',
  'anthropic': 'var(--ui-error)',
  'railway': 'var(--ui-success)',
  'websupport': 'var(--ui-info)',
  'neon': 'var(--ui-secondary)',
  'turso': '#8b5cf6',
  'resend': '#f97316',
  'gcp': '#06b6d4',
}

function getPlatformAmount(month: MonthData, slug: string): number {
  return month.byPlatform.find(p => p.platformSlug === slug)?.totalUsd ?? 0
}

function barHeight(usd: number): string {
  return `${Math.max((usd / maxTotal.value) * 100, 1)}%`
}

function fmt(n: number) {
  return n.toFixed(2)
}

// CSV export
const { downloadCsv } = useCsvExport()

// Per-platform MoM change
function platformMomChange(monthIdx: number, slug: string): number | null {
  if (!data.value || monthIdx === 0) return null
  const curr = getPlatformAmount(data.value.months[monthIdx]!, slug)
  const prev = getPlatformAmount(data.value.months[monthIdx - 1]!, slug)
  if (prev === 0) return curr > 0 ? 100 : null
  return Math.round(((curr - prev) / prev) * 100)
}

function exportTrendsCsv() {
  if (!data.value) return
  const platforms = allPlatforms.value
  const headers = ['Month', 'Total USD', 'Total EUR', 'MoM %', ...platforms.map(p => p.name + ' (USD)')]
  const rows = data.value.months.map(m => [
    m.label,
    m.totalUsd,
    m.totalEur,
    m.momChange ?? '',
    ...platforms.map(p => getPlatformAmount(m, p.slug) || ''),
  ])
  downloadCsv('infracost-trends.csv', headers, rows as (string | number | null)[][])
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Cost Trends</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Month-over-month spending &middot; 1 USD = {{ data?.eurUsdRate ?? 0.87 }} EUR
        </p>
      </div>
      <UButton v-if="data" icon="i-lucide-download" label="CSV" size="sm" variant="outline" @click="exportTrendsCsv" />
    </div>

    <SkeletonLoader v-if="status === 'pending'" variant="chart" />

    <template v-else-if="data">
      <!-- Bar chart -->
      <UCard>
        <template #header>
          <h3 class="font-display font-bold">Monthly Total Cost</h3>
        </template>

        <div class="flex items-end gap-4 h-64">
          <div
            v-for="month in data.months"
            :key="month.month"
            class="flex-1 flex flex-col items-center gap-1"
          >
            <!-- Stacked bar -->
            <div class="w-full flex flex-col-reverse items-stretch h-48 relative">
              <template v-for="platform in allPlatforms" :key="platform.slug">
                <div
                  v-if="getPlatformAmount(month, platform.slug) > 0"
                  :style="{
                    height: barHeight(getPlatformAmount(month, platform.slug)),
                    backgroundColor: platformColors[platform.slug] || 'var(--ui-text-muted)',
                    opacity: 0.85,
                  }"
                  class="w-full rounded-sm transition-all min-h-[2px]"
                  :title="`${platform.name}: $${fmt(getPlatformAmount(month, platform.slug))}`"
                />
              </template>
            </div>

            <!-- Amount label -->
            <p class="text-xs font-mono font-medium">${{ fmt(month.totalUsd) }}</p>

            <!-- MoM change -->
            <p
              v-if="month.momChange !== null"
              class="text-[10px] font-mono"
              :class="{
                'text-[var(--ui-error)]': month.momChange > 0,
                'text-[var(--ui-success)]': month.momChange < 0,
                'text-[var(--ui-text-muted)]': month.momChange === 0,
              }"
            >
              {{ month.momChange > 0 ? '+' : '' }}{{ month.momChange }}%
            </p>

            <!-- Month label -->
            <p class="text-xs text-[var(--ui-text-muted)]">{{ month.label }}</p>
          </div>
        </div>

        <!-- Legend -->
        <div class="mt-4 flex flex-wrap gap-3 border-t border-[var(--ui-border)] pt-3">
          <div v-for="platform in allPlatforms" :key="platform.slug" class="flex items-center gap-1.5">
            <div
              class="size-2.5 rounded-sm"
              :style="{ backgroundColor: platformColors[platform.slug] || 'var(--ui-text-muted)' }"
            />
            <span class="text-xs text-[var(--ui-text-muted)]">{{ platform.name }}</span>
          </div>
        </div>
      </UCard>

      <!-- Monthly detail table -->
      <UCard>
        <template #header>
          <h3 class="font-display font-bold">Monthly Breakdown</h3>
        </template>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[var(--ui-text-muted)]">
                <th class="pb-3 font-medium">Month</th>
                <th class="pb-3 text-right font-medium">Total (USD)</th>
                <th class="pb-3 text-right font-medium">Total (EUR)</th>
                <th class="pb-3 text-right font-medium">MoM</th>
                <th v-for="platform in allPlatforms" :key="platform.slug" class="pb-3 text-right font-medium">
                  {{ platform.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="month in data.months" :key="month.month" class="border-t border-[var(--ui-border)]">
                <td class="py-2.5 font-medium">{{ month.label }}</td>
                <td class="py-2.5 text-right font-mono">${{ fmt(month.totalUsd) }}</td>
                <td class="py-2.5 text-right font-mono text-[var(--ui-text-muted)]">€{{ fmt(month.totalEur) }}</td>
                <td class="py-2.5 text-right font-mono" :class="{
                  'text-[var(--ui-error)]': (month.momChange ?? 0) > 0,
                  'text-[var(--ui-success)]': (month.momChange ?? 0) < 0,
                  'text-[var(--ui-text-dimmed)]': month.momChange === null || month.momChange === 0,
                }">
                  <template v-if="month.momChange !== null">
                    {{ month.momChange > 0 ? '+' : '' }}{{ month.momChange }}%
                  </template>
                  <template v-else>—</template>
                </td>
                <td v-for="(platform, pIdx) in allPlatforms" :key="platform.slug" class="py-2.5 text-right font-mono">
                  <template v-if="getPlatformAmount(month, platform.slug) > 0">
                    <div>${{ fmt(getPlatformAmount(month, platform.slug)) }}</div>
                    <div
                      v-if="platformMomChange(data.months.indexOf(month), platform.slug) !== null"
                      class="text-[10px]"
                      :class="{
                        'text-[var(--ui-error)]': (platformMomChange(data.months.indexOf(month), platform.slug) ?? 0) > 0,
                        'text-[var(--ui-success)]': (platformMomChange(data.months.indexOf(month), platform.slug) ?? 0) < 0,
                        'text-[var(--ui-text-dimmed)]': platformMomChange(data.months.indexOf(month), platform.slug) === 0,
                      }"
                    >
                      {{ (platformMomChange(data.months.indexOf(month), platform.slug) ?? 0) > 0 ? '+' : '' }}{{ platformMomChange(data.months.indexOf(month), platform.slug) }}%
                    </div>
                  </template>
                  <span v-else class="text-[var(--ui-text-dimmed)]">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
