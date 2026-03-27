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

interface ExpiryItem {
  platform: string
  service: string
  expiresAt: string
  description: string
  impact: string
  monthlyAfter: number | null
  daysUntil: number
  risk: 'expired' | 'critical' | 'warning' | 'ok'
  category?: 'free_tier' | 'domain' | 'hosting' | 'ssl'
}

// Unified item types
type CountdownItem =
  | { type: 'depletion'; urgency: number; data: DepletionPlatform }
  | { type: 'limit'; urgency: number; data: PlatformLimits }
  | { type: 'expiry'; urgency: number; data: ExpiryItem }

const { data: depletionData, status: depletionStatus } = await useFetch<{ platforms: DepletionPlatform[]; checkedAt: string }>('/api/depletion')
const { data: limitsData, status: limitsStatus } = await useFetch<{ platforms: PlatformLimits[]; checkedAt: string }>('/api/limits')
const { data: expiryData } = await useFetch<{ items: ExpiryItem[]; urgentCount: number }>('/api/expiry')
const { loggedIn } = useUserSession()
const toast = useToast()
const { collecting, triggerCollection } = useCollectionTrigger(async () => {
  await refreshNuxtData()
})

// Manual platform reminders (Claude Max, Google Services, Websupport)
interface ManualReminder {
  slug: string
  name: string
  lastRecordedDate: string | null
  daysSinceLastRecord: number | null
  currentMonthRecorded: boolean
  currentMonthAmount: number | null
  expectedAmount: number | null
  costType: string
  serviceName: string
}

const { data: remindersData, refresh: refreshReminders } = await useFetch<{
  reminders: ManualReminder[]
  month: string
}>('/api/costs/manual-reminders')

const recordingSlug = ref<string | null>(null)

async function recordManualCost(reminder: ManualReminder) {
  recordingSlug.value = reminder.slug
  try {
    const now = new Date()
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })
    await $fetch('/api/costs/manual', {
      method: 'POST',
      body: {
        platformSlug: reminder.slug,
        amount: reminder.expectedAmount,
        costType: reminder.costType,
        date: now.toISOString().split('T')[0],
        serviceName: reminder.serviceName,
        notes: `${reminder.name} — ${monthName}`,
      },
    })
    await refreshReminders()
    await refreshNuxtData()
  }
  catch (err: any) {
    toast.add({ title: `Failed to record ${reminder.name}`, description: err?.data?.message || 'Unknown error', color: 'error' })
  }
  finally {
    recordingSlug.value = null
  }
}

const loading = computed(() => depletionStatus.value === 'pending' || limitsStatus.value === 'pending')

// Risk to urgency score (lower = more urgent)
function riskToUrgency(risk: string): number {
  const scores: Record<string, number> = { depleted: 0, expired: 0, exceeded: 1, critical: 2, warning: 3, ok: 4, unknown: 5 }
  return scores[risk] ?? 5
}

// Combined + sorted items
const items = computed<CountdownItem[]>(() => {
  const result: CountdownItem[] = []

  if (depletionData.value) {
    for (const p of depletionData.value.platforms) {
      result.push({ type: 'depletion', urgency: riskToUrgency(p.riskLevel), data: p })
    }
  }

  if (limitsData.value) {
    for (const p of limitsData.value.platforms) {
      result.push({ type: 'limit', urgency: riskToUrgency(p.worstRisk), data: p })
    }
  }

  if (expiryData.value) {
    for (const e of expiryData.value.items) {
      result.push({ type: 'expiry', urgency: riskToUrgency(e.risk), data: e })
    }
  }

  result.sort((a, b) => a.urgency - b.urgency)
  return result
})

const criticalCount = computed(() => items.value.filter(i => i.urgency <= 2).length)
const warningCount = computed(() => items.value.filter(i => i.urgency === 3).length)
const healthyCount = computed(() => items.value.filter(i => i.urgency >= 4).length)

const lastChecked = computed(() => {
  const dates = [depletionData.value?.checkedAt, limitsData.value?.checkedAt].filter(Boolean)
  return dates.length ? new Date(Math.max(...dates.map(d => new Date(d!).getTime()))).toLocaleString() : null
})

const RISK_COLORS: Record<string, string> = {
  depleted: 'error', expired: 'error', exceeded: 'error', critical: 'error',
  warning: 'warning', ok: 'success',
}
function riskColor(level: string): string { return RISK_COLORS[level] ?? 'neutral' }

const RISK_ICONS: Record<string, string> = {
  depleted: 'i-lucide-x-circle', expired: 'i-lucide-x-circle', exceeded: 'i-lucide-x-circle',
  critical: 'i-lucide-alert-triangle', warning: 'i-lucide-alert-circle',
  ok: 'i-lucide-check-circle',
}
function riskIcon(level: string): string { return RISK_ICONS[level] ?? 'i-lucide-circle-dashed' }

const BAR_COLORS: Record<string, string> = {
  depleted: 'bg-[var(--ui-error)]', exceeded: 'bg-[var(--ui-error)]', critical: 'bg-[var(--ui-error)]',
  warning: 'bg-[var(--ui-warning)]', ok: 'bg-[var(--ui-success)]',
}
function barColor(level: string): string { return BAR_COLORS[level] ?? 'bg-[var(--ui-text-dimmed)]' }

const RISK_TEXT_CLASSES: Record<string, string> = {
  ok: 'text-[var(--ui-success)]', warning: 'text-[var(--ui-warning)]',
  critical: 'text-[var(--ui-error)]', depleted: 'text-[var(--ui-error)]',
  expired: 'text-[var(--ui-error)]', exceeded: 'text-[var(--ui-error)]',
  unknown: 'text-[var(--ui-text-dimmed)]',
}
function riskTextClass(level: string): string { return RISK_TEXT_CLASSES[level] ?? '' }

function fmt(n: number) { return n.toFixed(2) }

function depletionProgressPct(p: DepletionPlatform) {
  if (!p.daysRemaining) return 100
  return Math.min(100, Math.max(0, Math.round((p.daysRemaining / 90) * 100)))
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Countdown</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Credits, limits &amp; free tiers — sorted by urgency
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

    <!-- Summary badges -->
    <div v-if="!loading && items.length" class="flex flex-wrap gap-3">
      <UBadge v-if="criticalCount" color="error" variant="solid" size="lg">
        {{ criticalCount }} critical
      </UBadge>
      <UBadge v-if="warningCount" color="warning" variant="solid" size="lg">
        {{ warningCount }} warning
      </UBadge>
      <UBadge v-if="healthyCount" color="success" variant="subtle" size="lg">
        {{ healthyCount }} healthy
      </UBadge>
    </div>

    <!-- Monthly Manual Cost Reminders -->
    <div v-if="loggedIn && remindersData?.reminders?.length" class="space-y-3">
      <h2 class="font-display text-sm font-bold text-[var(--ui-text-muted)] uppercase tracking-wider">Monthly Tasks</h2>
      <UCard v-for="r in remindersData.reminders" :key="r.slug" class="metric-card-budget">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UIcon
              :name="r.currentMonthRecorded ? 'i-lucide-check-circle' : (r.daysSinceLastRecord !== null && r.daysSinceLastRecord > 35) ? 'i-lucide-alert-circle' : 'i-lucide-circle-dashed'"
              class="size-5"
              :class="r.currentMonthRecorded ? 'text-[var(--ui-success)]' : (r.daysSinceLastRecord !== null && r.daysSinceLastRecord > 35) ? 'text-[var(--ui-warning)]' : 'text-[var(--ui-text-dimmed)]'"
            />
            <div>
              <p class="font-display font-bold">{{ r.name }} — ${{ r.expectedAmount }}/mo</p>
              <p class="text-xs text-[var(--ui-text-muted)]">
                <template v-if="r.currentMonthRecorded">
                  Recorded for {{ remindersData.month }}
                </template>
                <template v-else-if="r.daysSinceLastRecord !== null && r.daysSinceLastRecord > 35">
                  Overdue — last recorded {{ r.daysSinceLastRecord }}d ago
                </template>
                <template v-else>
                  Not yet recorded for {{ remindersData.month }}
                </template>
              </p>
            </div>
          </div>
          <UButton
            v-if="!r.currentMonthRecorded && r.expectedAmount !== null"
            icon="i-lucide-plus"
            label="Record"
            size="sm"
            :loading="recordingSlug === r.slug"
            @click="recordManualCost(r)"
          />
          <UBadge v-else color="success" variant="subtle" size="sm">
            ${{ r.currentMonthAmount?.toFixed(2) }} recorded
          </UBadge>
        </div>
      </UCard>
    </div>

    <!-- Loading -->
    <SkeletonLoader v-if="loading" variant="countdown" :rows="4" />

    <!-- Countdown items -->
    <div v-else class="space-y-4">
      <template v-for="item in items" :key="`${item.type}-${'slug' in item.data ? item.data.slug : item.data.platform}`">

        <!-- Credit Depletion Card -->
        <UCard v-if="item.type === 'depletion'" class="metric-card-budget">
          <div class="space-y-4">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <UIcon
                  :name="riskIcon(item.data.riskLevel)"
                  class="size-6"
                  :class="riskTextClass(item.data.riskLevel)"
                />
                <div>
                  <h3 class="font-display text-lg font-bold">{{ item.data.name }}</h3>
                  <div class="flex items-center gap-2 mt-0.5">
                    <UBadge :color="(riskColor(item.data.riskLevel) as any)" variant="subtle" size="xs">
                      {{ item.data.riskLevel === 'ok' ? 'Healthy' : item.data.riskLevel }}
                    </UBadge>
                    <UBadge variant="outline" size="xs" color="neutral">credits</UBadge>
                  </div>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold tabular-nums" :class="riskTextClass(item.data.riskLevel)">
                  {{ item.data.daysRemaining !== null ? `${item.data.daysRemaining} days` : 'N/A' }}
                </p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">until depleted</p>
              </div>
            </div>

            <!-- Progress bar -->
            <div>
              <div class="flex justify-between text-xs text-[var(--ui-text-muted)] mb-1">
                <span>Balance: ${{ fmt(item.data.creditBalance) }} ({{ '\u20AC' }}{{ fmt(item.data.creditBalanceEur) }})</span>
                <span v-if="item.data.depletionDate">Empty by {{ item.data.depletionDate }}</span>
              </div>
              <div class="h-3 w-full rounded-full bg-[var(--ui-bg-elevated)]">
                <div
                  class="h-3 rounded-full transition-all"
                  :class="barColor(item.data.riskLevel)"
                  :style="{ width: `${depletionProgressPct(item.data)}%` }"
                />
              </div>
            </div>

            <!-- Metrics -->
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
              <div>
                <p class="text-[var(--ui-text-muted)]">Daily Burn</p>
                <p class="font-mono font-medium">${{ fmt(item.data.dailyBurnRate) }}/day</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">MTD Spend</p>
                <p class="font-mono font-medium">${{ fmt(item.data.mtd) }}</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">EOM Estimate</p>
                <p class="font-mono font-medium">${{ fmt(item.data.eomEstimate) }}</p>
              </div>
              <div>
                <p class="text-[var(--ui-text-muted)]">Monthly Rate</p>
                <p class="font-mono font-medium">${{ fmt(item.data.dailyBurnRate * 30) }}/mo</p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Free Tier Expiry Card -->
        <UCard v-else-if="item.type === 'expiry'" class="metric-card-budget">
          <div class="space-y-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <UIcon
                  :name="riskIcon(item.data.risk)"
                  class="size-6"
                  :class="riskTextClass(item.data.risk)"
                />
                <div>
                  <h3 class="font-display text-lg font-bold">{{ item.data.service }}</h3>
                  <div class="flex items-center gap-2 mt-0.5">
                    <UBadge :color="(riskColor(item.data.risk) as any)" variant="subtle" size="xs">
                      {{ item.data.risk === 'ok' ? 'Healthy' : item.data.risk }}
                    </UBadge>
                    <UBadge variant="outline" size="xs" color="neutral">{{ ({ domain: 'domain renewal', hosting: 'hosting renewal', ssl: 'SSL renewal', free_tier: 'free tier expiry' } as Record<string, string>)[item.data.category || 'free_tier'] }}</UBadge>
                    <UBadge variant="subtle" size="xs" color="neutral">{{ item.data.platform }}</UBadge>
                  </div>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold tabular-nums" :class="riskTextClass(item.data.risk)">
                  {{ item.data.daysUntil <= 0 ? 'Expired' : `${item.data.daysUntil}d` }}
                </p>
                <p class="text-xs text-[var(--ui-text-dimmed)]">
                  {{ item.data.daysUntil <= 0 ? 'action needed' : 'until expiry' }}
                </p>
              </div>
            </div>

            <p class="text-sm text-[var(--ui-text-muted)]">{{ item.data.description }}</p>

            <div class="rounded border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] px-3 py-2">
              <p class="text-xs text-[var(--ui-text-muted)]">
                <span class="font-medium">Impact:</span> {{ item.data.impact }}
              </p>
              <p v-if="item.data.monthlyAfter" class="text-xs text-[var(--ui-text-muted)] mt-1">
                <span class="font-medium">Cost after:</span> ${{ item.data.monthlyAfter.toFixed(2) }}/mo
              </p>
            </div>

            <p class="text-xs text-[var(--ui-text-dimmed)]">
              Expires: {{ new Date(item.data.expiresAt).toLocaleDateString() }}
            </p>
          </div>
        </UCard>

        <!-- Plan Limits Card -->
        <UCard v-else class="metric-card-budget">
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <UIcon
                  :name="riskIcon(item.data.worstRisk)"
                  class="size-5"
                  :class="riskTextClass(item.data.worstRisk)"
                />
                <div>
                  <h3 class="font-display text-lg font-bold">{{ item.data.name }}</h3>
                  <div class="flex items-center gap-2 mt-0.5">
                    <UBadge :color="(riskColor(item.data.worstRisk) as any)" variant="subtle" size="xs">
                      {{ item.data.worstRisk === 'ok' ? 'Healthy' : item.data.worstRisk === 'unknown' ? 'Unknown' : item.data.worstRisk }}
                    </UBadge>
                    <UBadge variant="outline" size="xs" color="neutral">plan limits</UBadge>
                  </div>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-medium text-[var(--ui-text-muted)]">
                  {{ item.data.metrics.length }} metric{{ item.data.metrics.length !== 1 ? 's' : '' }}
                </p>
              </div>
            </div>

            <!-- Limit metrics -->
            <div class="space-y-3">
              <div v-for="m in item.data.metrics" :key="m.metric" class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium">{{ m.label }}</span>
                  <span class="text-[var(--ui-text-muted)]">
                    <template v-if="m.pct !== null">
                      {{ m.usedFormatted }} / {{ m.limitFormatted }}
                      <span class="font-mono ml-1" :class="riskTextClass(m.riskLevel)">
                        ({{ m.pct }}%)
                      </span>
                    </template>
                    <template v-else>
                      <span class="text-[var(--ui-text-dimmed)]">{{ m.limitFormatted }} limit</span>
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
                    class="h-2 w-full rounded-full"
                    style="background: repeating-linear-gradient(45deg, transparent, transparent 4px, var(--ui-border) 4px, var(--ui-border) 8px)"
                  />
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </div>

    <p v-if="lastChecked" class="text-xs text-[var(--ui-text-dimmed)] text-right">
      Last checked: {{ lastChecked }}
    </p>
  </div>
</template>
