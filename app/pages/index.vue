<script setup lang="ts">
useSeoMeta({
  title: 'InfraCost — Track All Your Infrastructure Costs in One Dashboard',
  ogTitle: 'InfraCost — Track All Your Infrastructure Costs in One Dashboard',
  description: 'Track spending across 9 cloud and AI platforms — Render, Railway, Anthropic, Neon, Turso and more — with budget alerts, drift detection, depletion forecasts, and collection freshness tracking. USD + EUR.',
  ogDescription: 'Automated cost tracking across Render, Railway, Anthropic API, Neon, Turso, Resend, UptimeRobot, GCP. Budget alerts, depletion forecasts, drift detection. Secured with Google OAuth.',
  ogType: 'website',
  ogSiteName: 'InfraCost',
  ogUrl: 'https://infracost.eu',
  twitterCard: 'summary_large_image',
})

useHead({
  htmlAttrs: { lang: 'en' },
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'InfraCost',
        url: 'https://infracost.eu',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        description: 'Infrastructure cost tracking dashboard for cloud and AI platforms with automated collectors, budget alerts, and depletion forecasts.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }),
    },
  ],
})

const { loggedIn } = useUserSession()

interface ServiceCost {
  serviceId: number | null
  serviceName: string | null
  amount: number
  amountEur: number
}

interface PlatformCost {
  platformId: number
  platformSlug: string
  platformName: string
  platformType: string
  mtd: number
  mtdEur: number
  eomEstimate: number
  eomEstimateEur: number
  recordCount: number
  services: ServiceCost[]
}

interface MTDSummary {
  totalMTD: number
  totalMTDEur: number
  eomEstimate: number
  eomEstimateEur: number
  budgetLimit: number
  budgetLimitEur: number
  budgetUsedPct: number
  monthProgress: number
  daysInMonth: number
  currentDay: number
  eurUsdRate: number
  byPlatform: PlatformCost[]
}

const { data: mtd, status, refresh } = await useFetch<MTDSummary>('/api/costs/mtd')

interface Alert {
  id: number
  severity: string
  status: string
  alertType: string
  message: string
  budgetName: string | null
  createdAt: string
}

const { data: activeAlerts, refresh: refreshAlerts } = await useFetch<Alert[]>('/api/alerts')

const collecting = ref(false)

async function triggerCollection() {
  collecting.value = true
  try {
    await $fetch('/api/collect/trigger', { method: 'POST', body: { trigger: 'manual' } })
    await refresh()
    await refreshAlerts()
  }
  finally {
    collecting.value = false
  }
}

function fmt(n: number | undefined) {
  return (n ?? 0).toFixed(2)
}

const budgetColor = computed(() => {
  const pct = mtd.value?.budgetUsedPct ?? 0
  if (pct >= 100) return 'error'
  if (pct >= 90) return 'warning'
  return 'primary'
})

const features = [
  {
    icon: 'i-lucide-radio-tower',
    title: '9 Platforms, 1 View',
    description: 'Automated API collectors pull live costs from Render, Railway, Anthropic, Neon, Turso, Resend, UptimeRobot, GCP, and Websupport every day.',
  },
  {
    icon: 'i-lucide-bell-ring',
    title: 'Budget Alerts',
    description: 'Threshold-based alerts at 50%, 75%, 90%, and 100% of your budget. Notifications via email and WhatsApp before you overspend.',
  },
  {
    icon: 'i-lucide-battery-warning',
    title: 'Depletion Forecasts',
    description: 'Know exactly when your prepaid API credits run out. Daily burn rate and runway projections for Anthropic, Railway, and others.',
  },
  {
    icon: 'i-lucide-git-compare',
    title: 'Drift Detection',
    description: 'Compares live API service lists against your inventory daily. New services, removed services, and status changes surfaced automatically.',
  },
  {
    icon: 'i-lucide-activity',
    title: 'Collection Freshness',
    description: 'Every platform shows when data was last collected with green/yellow/red status indicators. Know instantly if any collector is stale or failing.',
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Secured by Default',
    description: 'Google OAuth with email allowlist protects all write operations. Read-only dashboard stays public. All API calls timeout-protected with 15s limits.',
  },
]

const platforms = [
  { name: 'Render', type: 'hosting' },
  { name: 'Railway', type: 'hosting' },
  { name: 'Anthropic', type: 'ai' },
  { name: 'Neon', type: 'database' },
  { name: 'Turso', type: 'database' },
  { name: 'Resend', type: 'email' },
  { name: 'UptimeRobot', type: 'monitoring' },
  { name: 'GCP', type: 'cloud' },
  { name: 'Websupport', type: 'domain' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Hero Section -->
    <section class="relative overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] px-6 py-12 sm:px-12 sm:py-16">
      <div class="absolute inset-0 bg-gradient-to-br from-[var(--ui-primary)]/5 via-transparent to-[var(--ui-primary)]/3" />
      <div class="relative mx-auto max-w-3xl text-center">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Every dollar your infrastructure spends.
          <span class="text-[var(--ui-primary)]">One dashboard.</span>
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-lg text-[var(--ui-text-muted)] sm:mt-6">
          Automated cost tracking across 9 cloud and AI platforms. Budget alerts before you overspend. Depletion forecasts before your credits run dry. Collection freshness you can trust. USD and EUR.
        </p>
        <div class="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <UButton
            v-if="!loggedIn"
            to="/auth/google"
            external
            icon="i-lucide-log-in"
            label="Sign In to Dashboard"
            size="lg"
          />
          <UButton
            v-else
            icon="i-lucide-refresh-cw"
            label="Collect Now"
            size="lg"
            :loading="collecting"
            @click="triggerCollection"
          />
          <UButton
            to="https://github.com/peter-fusek/infra-cost-optimizer"
            external
            variant="outline"
            icon="i-lucide-github"
            label="View Source"
            size="lg"
          />
        </div>
      </div>
    </section>

    <!-- Feature Cards -->
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="feature in features" :key="feature.title">
        <div class="flex gap-4">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--ui-primary)]/10">
            <UIcon :name="feature.icon" class="size-5 text-[var(--ui-primary)]" />
          </div>
          <div>
            <h3 class="font-semibold">{{ feature.title }}</h3>
            <p class="mt-1 text-sm text-[var(--ui-text-muted)]">{{ feature.description }}</p>
          </div>
        </div>
      </UCard>
    </section>

    <!-- Tracked Platforms -->
    <section class="text-center">
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--ui-text-dimmed)]">Tracking costs across</p>
      <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
        <UBadge
          v-for="p in platforms"
          :key="p.name"
          :color="p.type === 'ai' ? 'warning' : p.type === 'hosting' ? 'primary' : p.type === 'database' ? 'success' : 'neutral'"
          variant="subtle"
          size="lg"
        >
          {{ p.name }}
        </UBadge>
      </div>
    </section>

    <!-- Dashboard Section (authenticated users) -->
    <template v-if="loggedIn">
      <USeparator />

      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold">Infrastructure Costs</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            {{ new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }}
            &middot; Day {{ mtd?.currentDay || 0 }} of {{ mtd?.daysInMonth || 31 }}
            &middot; 1 USD = {{ mtd?.eurUsdRate ?? 0.92 }} EUR
          </p>
        </div>
      </div>

      <!-- Top metric cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UCard>
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">Month-to-Date</p>
              <p class="mt-1 text-2xl font-semibold">${{ fmt(mtd?.totalMTD) }}</p>
              <p class="mt-0.5 text-sm text-[var(--ui-text-dimmed)]">€{{ fmt(mtd?.totalMTDEur) }}</p>
            </div>
            <UIcon name="i-lucide-dollar-sign" class="size-5 text-[var(--ui-text-muted)]" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">EOM Estimate</p>
              <p class="mt-1 text-2xl font-semibold">${{ fmt(mtd?.eomEstimate) }}</p>
              <p class="mt-0.5 text-sm text-[var(--ui-text-dimmed)]">€{{ fmt(mtd?.eomEstimateEur) }}</p>
            </div>
            <UIcon name="i-lucide-trending-up" class="size-5 text-[var(--ui-text-muted)]" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">Budget</p>
              <p class="mt-1 text-2xl font-semibold">{{ mtd?.budgetUsedPct ?? 0 }}%</p>
              <p class="mt-0.5 text-sm text-[var(--ui-text-dimmed)]">${{ fmt(mtd?.eomEstimate) }} / ${{ fmt(mtd?.budgetLimit) }}</p>
            </div>
            <UIcon name="i-lucide-gauge" class="size-5 text-[var(--ui-text-muted)]" />
          </div>
          <div class="mt-3">
            <div class="h-2 w-full rounded-full bg-[var(--ui-bg-elevated)]">
              <div
                class="h-2 rounded-full transition-all"
                :class="{
                  'bg-[var(--ui-primary)]': budgetColor === 'primary',
                  'bg-[var(--ui-warning)]': budgetColor === 'warning',
                  'bg-[var(--ui-error)]': budgetColor === 'error',
                }"
                :style="{ width: `${Math.min(mtd?.budgetUsedPct ?? 0, 100)}%` }"
              />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">Platforms Tracked</p>
              <p class="mt-1 text-2xl font-semibold">{{ mtd?.byPlatform?.length || 0 }}</p>
              <p class="mt-0.5 text-sm text-[var(--ui-text-dimmed)]">{{ mtd?.monthProgress ?? 0 }}% through month</p>
            </div>
            <UIcon name="i-lucide-server" class="size-5 text-[var(--ui-text-muted)]" />
          </div>
        </UCard>
      </div>

      <!-- Budget alerts -->
      <div v-if="activeAlerts?.length" class="space-y-2">
        <div
          v-for="alert in activeAlerts"
          :key="alert.id"
          class="flex items-center justify-between rounded-lg border px-4 py-3"
          :class="{
            'border-[var(--ui-error)] bg-[var(--ui-error)]/5': alert.severity === 'critical',
            'border-[var(--ui-warning)] bg-[var(--ui-warning)]/5': alert.severity === 'warning',
            'border-[var(--ui-info)] bg-[var(--ui-info)]/5': alert.severity === 'info',
          }"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="alert.severity === 'critical' ? 'i-lucide-alert-triangle' : alert.severity === 'warning' ? 'i-lucide-alert-circle' : 'i-lucide-info'"
              class="size-5 shrink-0"
              :class="{
                'text-[var(--ui-error)]': alert.severity === 'critical',
                'text-[var(--ui-warning)]': alert.severity === 'warning',
                'text-[var(--ui-info)]': alert.severity === 'info',
              }"
            />
            <span class="text-sm">{{ alert.message }}</span>
          </div>
          <UBadge :color="alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info'" variant="subtle" size="xs">
            {{ alert.severity }}
          </UBadge>
        </div>
      </div>

      <!-- Platform breakdown -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Cost by Platform</h3>
            <UButton to="/breakdown" variant="ghost" size="xs" label="View Full Breakdown" icon="i-lucide-arrow-right" trailing />
          </div>
        </template>

        <div v-if="status === 'pending'" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
        </div>

        <div v-else-if="!mtd?.byPlatform?.length" class="py-8 text-center text-[var(--ui-text-muted)]">
          <p>No cost data yet.</p>
          <p class="mt-1 text-sm">Click "Collect Now" or add manual entries to get started.</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[var(--ui-text-muted)]">
                <th class="pb-3 font-medium">Platform</th>
                <th class="pb-3 font-medium">Type</th>
                <th class="pb-3 text-right font-medium">MTD (USD)</th>
                <th class="pb-3 text-right font-medium">MTD (EUR)</th>
                <th class="pb-3 text-right font-medium">EOM Est. (USD)</th>
                <th class="pb-3 text-right font-medium">EOM Est. (EUR)</th>
                <th class="pb-3 text-right font-medium">Records</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in mtd.byPlatform" :key="p.platformId" class="border-t border-[var(--ui-border)]">
                <td class="py-2.5 font-medium">{{ p.platformName }}</td>
                <td class="py-2.5">
                  <UBadge
                    :color="p.platformType === 'ai' ? 'warning' : p.platformType === 'hosting' ? 'primary' : 'neutral'"
                    variant="subtle" size="xs"
                  >
                    {{ p.platformType }}
                  </UBadge>
                </td>
                <td class="py-2.5 text-right font-mono">${{ fmt(p.mtd) }}</td>
                <td class="py-2.5 text-right font-mono text-[var(--ui-text-muted)]">€{{ fmt(p.mtdEur) }}</td>
                <td class="py-2.5 text-right font-mono">${{ fmt(p.eomEstimate) }}</td>
                <td class="py-2.5 text-right font-mono text-[var(--ui-text-muted)]">€{{ fmt(p.eomEstimateEur) }}</td>
                <td class="py-2.5 text-right">{{ p.recordCount }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-[var(--ui-border)] font-semibold">
                <td class="pt-3" colspan="2">Total</td>
                <td class="pt-3 text-right font-mono">${{ fmt(mtd.totalMTD) }}</td>
                <td class="pt-3 text-right font-mono text-[var(--ui-text-muted)]">€{{ fmt(mtd.totalMTDEur) }}</td>
                <td class="pt-3 text-right font-mono">${{ fmt(mtd.eomEstimate) }}</td>
                <td class="pt-3 text-right font-mono text-[var(--ui-text-muted)]">€{{ fmt(mtd.eomEstimateEur) }}</td>
                <td class="pt-3 text-right">{{ mtd.byPlatform.reduce((s: number, p: PlatformCost) => s + p.recordCount, 0) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
