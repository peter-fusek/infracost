<script setup lang="ts">
useSeoMeta({
  title: 'InfraCost — Track All Your Infrastructure Costs in One Dashboard',
  ogTitle: 'InfraCost — Track All Your Infrastructure Costs in One Dashboard',
  description: 'Track spending across 12 cloud and AI platforms — Render, Railway, Anthropic, Claude Max, Neon, Turso, and more — with budget alerts, drift detection, depletion forecasts, GitHub auto-discovery, and CSV export. USD + EUR.',
  ogDescription: 'Automated cost tracking across 12 platforms including Render, Railway, Anthropic, Claude Max, GCP. Budget alerts, drift detection, depletion forecasts, anomaly detection, GitHub auto-discovery. Secured with Google OAuth.',
  ogType: 'website',
  ogSiteName: 'InfraCost',
  ogUrl: 'https://infracost.eu',
  ogImage: 'https://infracost.eu/og-image.png',
  ogImageAlt: 'InfraCost — infrastructure cost tracking dashboard',
  twitterCard: 'summary_large_image',
  twitterImage: 'https://infracost.eu/og-image.png',
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
        description: 'Infrastructure cost tracking dashboard for 12 cloud and AI platforms with automated collectors, budget alerts, drift detection, depletion forecasts, and anomaly detection.',
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

const { data: activeAlerts, refresh: refreshAlerts } = await useFetch<Alert[]>('/api/alerts', { lazy: true })

const { collecting, triggerCollection } = useCollectionTrigger(async () => {
  await refresh()
  await refreshAlerts()
})

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
    title: '12 Platforms, 1 View',
    description: 'API collectors pull live costs from Render, Railway, Anthropic, Claude Max, Neon, Turso, Resend, UptimeRobot, GCP, GitHub, Google Services, and Websupport.',
  },
  {
    icon: 'i-lucide-bell-ring',
    title: 'Budget & Anomaly Alerts',
    description: 'Threshold alerts at 50-100% of budget plus anomaly detection for unusual spending spikes. Email and WhatsApp notifications.',
  },
  {
    icon: 'i-lucide-battery-warning',
    title: 'Countdown Dashboard',
    description: 'Credits, plan limits, and free tier expirations — all urgency-sorted in one view. Know when your Anthropic credits run dry or your free DB expires.',
  },
  {
    icon: 'i-lucide-git-compare',
    title: 'Drift Detection + GitHub Discovery',
    description: 'Daily scans compare live services against your registry. Auto-discover untracked GitHub repos with deployment indicators. Change history timeline per project.',
  },
  {
    icon: 'i-lucide-download',
    title: 'Sort, Filter & Export',
    description: 'Breakdown by platform or project with sorting, filtering, and search. CSV exports for offline analysis. Per-platform month-over-month trends.',
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Resilient & Secure',
    description: 'Google OAuth with email allowlist. Collector retry with exponential backoff. Collection run history. 15s API timeouts. All data in USD and EUR.',
  },
]

const platforms = [
  { name: 'Render', type: 'hosting' },
  { name: 'Railway', type: 'hosting' },
  { name: 'Anthropic', type: 'ai' },
  { name: 'Claude Max', type: 'ai' },
  { name: 'Neon', type: 'database' },
  { name: 'Turso', type: 'database' },
  { name: 'Resend', type: 'email' },
  { name: 'UptimeRobot', type: 'monitoring' },
  { name: 'GCP', type: 'cloud' },
  { name: 'GitHub', type: 'ci_cd' },
  { name: 'Google Services', type: 'analytics' },
  { name: 'Websupport', type: 'domain' },
]
</script>

<template>
  <div class="space-y-8">
    <!-- Hero Section -->
    <section class="relative overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] px-6 py-14 sm:px-12 sm:py-20 hero-mesh">
      <div class="absolute inset-0 hero-grid" />
      <div class="relative mx-auto max-w-3xl text-center">
        <div class="animate-fade-in-up" style="animation-delay: 0ms">
          <p class="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-500">Infrastructure Cost Intelligence</p>
          <h1 class="font-display text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Every dollar your infrastructure spends.
            <span class="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">One dashboard.</span>
          </h1>
        </div>
        <p class="animate-fade-in-up mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--ui-text-muted)]" style="animation-delay: 100ms">
          Automated cost tracking across 12 platforms. Budget alerts before you overspend. Drift detection when infrastructure changes. GitHub auto-discovery for untracked projects. CSV exports. USD and EUR.
        </p>
        <div class="animate-fade-in-up mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center" style="animation-delay: 200ms">
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
    <section>
      <h2 class="sr-only">Features</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(feature, i) in features"
          :key="feature.title"
          class="feature-card animate-fade-in-up rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] p-5"
          :style="{ animationDelay: `${300 + i * 60}ms` }"
        >
          <div class="flex gap-4">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <UIcon :name="feature.icon" class="size-5 text-emerald-500" />
            </div>
            <div>
              <h3 class="font-display font-bold">{{ feature.title }}</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-[var(--ui-text-muted)]">{{ feature.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Tracked Platforms -->
    <section class="text-center animate-fade-in-up" style="animation-delay: 700ms">
      <h2 class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ui-text-dimmed)]">Tracking costs across</h2>
      <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
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
      <div class="h-px bg-gradient-to-r from-transparent via-[var(--ui-border)] to-transparent" />

      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-display text-2xl font-black tracking-tight">Infrastructure Costs</h2>
          <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
            {{ new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }}
            &middot; Day {{ mtd?.currentDay || 0 }} of {{ mtd?.daysInMonth || 31 }}
            &middot; 1 USD = {{ mtd?.eurUsdRate ?? 0.92 }} EUR
          </p>
        </div>
      </div>

      <!-- Top metric cards with accent borders -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UCard class="metric-card-mtd">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Month-to-Date</p>
              <p class="mt-1.5 text-2xl font-bold tabular-nums">${{ fmt(mtd?.totalMTD) }}</p>
              <p class="mt-0.5 text-sm tabular-nums text-[var(--ui-text-dimmed)]">€{{ fmt(mtd?.totalMTDEur) }}</p>
            </div>
            <div class="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <UIcon name="i-lucide-dollar-sign" class="size-4 text-emerald-500" />
            </div>
          </div>
        </UCard>

        <UCard class="metric-card-eom">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">EOM Estimate</p>
              <p class="mt-1.5 text-2xl font-bold tabular-nums">${{ fmt(mtd?.eomEstimate) }}</p>
              <p class="mt-0.5 text-sm tabular-nums text-[var(--ui-text-dimmed)]">€{{ fmt(mtd?.eomEstimateEur) }}</p>
            </div>
            <div class="flex size-9 items-center justify-center rounded-lg bg-cyan-500/10">
              <UIcon name="i-lucide-trending-up" class="size-4 text-cyan-500" />
            </div>
          </div>
        </UCard>

        <UCard class="metric-card-budget">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Budget</p>
              <p class="mt-1.5 text-2xl font-bold tabular-nums">{{ mtd?.budgetUsedPct ?? 0 }}%</p>
              <p class="mt-0.5 text-sm tabular-nums text-[var(--ui-text-dimmed)]">${{ fmt(mtd?.eomEstimate) }} / ${{ fmt(mtd?.budgetLimit) }}</p>
            </div>
            <div class="flex size-9 items-center justify-center rounded-lg bg-amber-500/10">
              <UIcon name="i-lucide-gauge" class="size-4 text-amber-500" />
            </div>
          </div>
          <div class="mt-3">
            <div class="h-1.5 w-full rounded-full bg-[var(--ui-bg)]">
              <div
                class="h-1.5 rounded-full transition-all duration-700"
                :class="{
                  'bg-emerald-500': budgetColor === 'primary',
                  'bg-amber-500': budgetColor === 'warning',
                  'bg-red-500': budgetColor === 'error',
                }"
                :style="{ width: `${Math.min(mtd?.budgetUsedPct ?? 0, 100)}%` }"
              />
            </div>
          </div>
        </UCard>

        <UCard class="metric-card-platforms">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Platforms Tracked</p>
              <p class="mt-1.5 text-2xl font-bold tabular-nums">{{ mtd?.byPlatform?.length || 0 }}</p>
              <p class="mt-0.5 text-sm text-[var(--ui-text-dimmed)]">{{ mtd?.monthProgress ?? 0 }}% through month</p>
            </div>
            <div class="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
              <UIcon name="i-lucide-server" class="size-4 text-violet-500" />
            </div>
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
            <h3 class="font-display font-bold">Cost by Platform</h3>
            <UButton to="/breakdown" variant="ghost" size="xs" label="View Full Breakdown" icon="i-lucide-arrow-right" trailing />
          </div>
        </template>

        <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-emerald-500" />
        </div>

        <div v-else-if="!mtd?.byPlatform?.length" class="py-12 text-center">
          <UIcon name="i-lucide-database" class="mx-auto size-8 text-[var(--ui-text-dimmed)]" />
          <p class="mt-3 font-medium text-[var(--ui-text-muted)]">No cost data yet</p>
          <p class="mt-1 text-sm text-[var(--ui-text-dimmed)]">Click "Collect Now" or add manual entries to get started.</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-dimmed)]">
                <th scope="col" class="pb-3">Platform</th>
                <th scope="col" class="pb-3">Type</th>
                <th scope="col" class="pb-3 text-right">MTD (USD)</th>
                <th scope="col" class="pb-3 text-right">MTD (EUR)</th>
                <th scope="col" class="pb-3 text-right">EOM Est. (USD)</th>
                <th scope="col" class="pb-3 text-right">EOM Est. (EUR)</th>
                <th scope="col" class="pb-3 text-right">Records</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in mtd.byPlatform" :key="p.platformId" class="data-row border-t border-[var(--ui-border)]">
                <td class="py-2.5 font-medium">{{ p.platformName }}</td>
                <td class="py-2.5">
                  <UBadge
                    :color="p.platformType === 'ai' ? 'warning' : p.platformType === 'hosting' ? 'primary' : 'neutral'"
                    variant="subtle" size="xs"
                  >
                    {{ p.platformType }}
                  </UBadge>
                </td>
                <td class="py-2.5 text-right font-mono tabular-nums">${{ fmt(p.mtd) }}</td>
                <td class="py-2.5 text-right font-mono tabular-nums text-[var(--ui-text-muted)]">€{{ fmt(p.mtdEur) }}</td>
                <td class="py-2.5 text-right font-mono tabular-nums">${{ fmt(p.eomEstimate) }}</td>
                <td class="py-2.5 text-right font-mono tabular-nums text-[var(--ui-text-muted)]">€{{ fmt(p.eomEstimateEur) }}</td>
                <td class="py-2.5 text-right tabular-nums">{{ p.recordCount }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-[var(--ui-border)] font-bold">
                <td class="pt-3" colspan="2">Total</td>
                <td class="pt-3 text-right font-mono tabular-nums">${{ fmt(mtd.totalMTD) }}</td>
                <td class="pt-3 text-right font-mono tabular-nums text-[var(--ui-text-muted)]">€{{ fmt(mtd.totalMTDEur) }}</td>
                <td class="pt-3 text-right font-mono tabular-nums">${{ fmt(mtd.eomEstimate) }}</td>
                <td class="pt-3 text-right font-mono tabular-nums text-[var(--ui-text-muted)]">€{{ fmt(mtd.eomEstimateEur) }}</td>
                <td class="pt-3 text-right tabular-nums">{{ mtd.byPlatform.reduce((s: number, p: PlatformCost) => s + p.recordCount, 0) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
