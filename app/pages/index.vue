<script setup lang="ts">
useSeoMeta({
  title: 'InfraCost — Stop Flying Blind on Infra Costs | Render, Railway, Neon, Turso & More',
  ogTitle: 'InfraCost — Stop Flying Blind on Infra Costs | Render, Railway, Neon, Turso & More',
  description: 'You ship fast and infra piles up. InfraCost tracks all 12 platforms — Render, Railway, Neon, Turso, Claude Max — alerts before overspend, counts down every free tier.',
  ogDescription: 'Vibecoding spawns infra debt fast. InfraCost tracks 12 platforms automatically — Render, Railway, Anthropic, GCP, Claude Max and more. Budget alerts, free-tier expiry countdowns, drift detection, anomaly spikes, GitHub auto-discovery. USD + EUR.',
  ogType: 'website',
  ogSiteName: 'InfraCost',
  ogUrl: 'https://infracost.eu',
  ogImage: 'https://infracost.eu/og-image.png',
  ogImageAlt: 'InfraCost — infrastructure cost dashboard for vibecoders and indie builders',
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
        description: 'Self-hosted dashboard that tracks infrastructure spending across 12 cloud and AI platforms. Built for vibecoders and indie builders who accumulate infra debt fast — budget alerts, free-tier expiry countdowns, drift detection, anomaly detection, and GitHub auto-discovery.',
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

const { data: alertsResponse, refresh: refreshAlerts } = await useFetch<{ alerts: Alert[]; total: number }>('/api/alerts', { lazy: true })
const activeAlerts = computed(() => alertsResponse.value?.alerts ?? [])
const { data: collectionStatus } = await useFetch<{ lastCollectedAt: string | null }>('/api/collection-status', { lazy: true })

// Analytics summary (lazy — dashboard doesn't block on it)
interface AnalyticsSummaryProject {
  slug: string
  name: string
  ga4: { sessions: number; users: number; humanSessions: number } | null
  gsc: { clicks: number; impressions: number; seoScore: number } | null
}
const { data: analyticsSummary } = await useFetch<{ projects: AnalyticsSummaryProject[] }>('/api/analytics/summary', { lazy: true })
const { data: triageSummary } = await useFetch<{ redCount: number; yellowCount: number; totalCount: number }>('/api/triage/summary', { lazy: true })

const analyticsAgg = computed(() => {
  if (!analyticsSummary.value?.projects?.length) return null
  const projects = analyticsSummary.value.projects
  let sessions = 0, users = 0, clicks = 0, impressions = 0, seoTotal = 0, seoCount = 0
  for (const p of projects) {
    if (p.ga4) { sessions += p.ga4.sessions; users += p.ga4.users }
    if (p.gsc) { clicks += p.gsc.clicks; impressions += p.gsc.impressions; seoTotal += p.gsc.seoScore; seoCount++ }
  }
  return { sessions, users, clicks, impressions, avgSeo: seoCount ? Math.round(seoTotal / seoCount) : null, projectCount: projects.length }
})

const { collecting, triggerCollection } = useCollectionTrigger(async () => {
  await refresh()
  await refreshAlerts()
})

function fmt(n: number | undefined) {
  return (n ?? 0).toFixed(2)
}

// Alert management
const toast = useToast()

async function updateAlert(id: number, newStatus: 'acknowledged' | 'resolved') {
  try {
    await $fetch(`/api/alerts/${id}`, { method: 'PATCH', body: { status: newStatus } })
    await refreshAlerts()
    toast.add({ title: `Alert ${newStatus}`, color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to update alert', color: 'error' })
  }
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
    title: 'One Place for All 12 Platforms',
    description: 'Stop logging into Render, Railway, Neon, Turso, Resend, and GCP separately to piece together what you spent. API collectors pull live costs every morning and land them in a single table.',
  },
  {
    icon: 'i-lucide-bell-ring',
    title: 'Know Before the Spike Hits Your Card',
    description: 'Budget threshold alerts at 50-100% plus anomaly detection when spending jumps outside your normal baseline. Notifications via email and WhatsApp so nothing slips through while you\'re heads-down shipping.',
  },
  {
    icon: 'i-lucide-battery-warning',
    title: 'Free Tiers Don\'t Expire Quietly Anymore',
    description: 'Credits running low, plan limits approaching, domain renewals due, free tier deadlines looming — all urgency-sorted in one countdown view with risk-colored badges. No more surprise suspension emails.',
  },
  {
    icon: 'i-lucide-git-compare',
    title: 'Catch Infrastructure That Grew While You Weren\'t Looking',
    description: 'Daily scans compare live API service inventories against your tracked registry. GitHub auto-discovery flags repos with deployment indicators you never registered. Change history timeline shows exactly when things shifted.',
  },
  {
    icon: 'i-lucide-download',
    title: 'Drill Down, Then Get Out of the Way',
    description: 'Break costs down by platform or project. Sort by spend, filter by type, search services. Export to CSV for your accountant or your spreadsheet. Month-over-month trends per platform so you see what\'s creeping.',
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Built to Run Unattended',
    description: 'Google OAuth with email allowlist. 183 automated tests. Weekly autonomous health checks. Collector retry with exponential backoff. 15s API timeouts. All amounts in both USD and EUR.',
  },
]

const platforms = [
  { name: 'Render', type: 'hosting', icon: 'i-simple-icons-render' },
  { name: 'Railway', type: 'hosting', icon: 'i-simple-icons-railway' },
  { name: 'Anthropic', type: 'ai', icon: 'i-simple-icons-anthropic' },
  { name: 'Claude', type: 'ai', icon: 'i-simple-icons-claude' },
  { name: 'Neon', type: 'database', icon: 'i-simple-icons-neon' },
  { name: 'Turso', type: 'database', icon: 'i-simple-icons-turso' },
  { name: 'Resend', type: 'email', icon: 'i-simple-icons-resend' },
  { name: 'UptimeRobot', type: 'monitoring', icon: 'i-simple-icons-uptimerobot' },
  { name: 'Google Cloud', type: 'cloud', icon: 'i-simple-icons-googlecloud' },
  { name: 'GitHub', type: 'ci_cd', icon: 'i-simple-icons-github' },
  { name: 'Google', type: 'analytics', icon: 'i-simple-icons-google' },
  { name: 'Websupport', type: 'domain', icon: 'i-lucide-globe' },
]
</script>

<template>
  <div class="space-y-8">
    <!-- Hero Section -->
    <section class="relative overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] px-6 py-14 sm:px-12 sm:py-20 hero-mesh">
      <div class="absolute inset-0 hero-grid" />
      <div class="relative mx-auto max-w-3xl text-center">
        <div class="animate-fade-in-up" style="animation-delay: 0ms">
          <p class="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-500">Infra Debt Is Real. So Is The Bill.</p>
          <h1 class="font-display text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            You shipped fast. Now you're paying
            <span class="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">twelve platforms you forgot about.</span>
          </h1>
        </div>
        <p class="animate-fade-in-up mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--ui-text-muted)]" style="animation-delay: 100ms">
          Render, Railway, Neon, Turso, Claude Max, Resend — every side project adds another line item. Free trials expire silently. Manual invoices go untracked. InfraCost pulls live costs from all 12 platforms, fires alerts before you overspend, and counts down every free tier, credit, and domain renewal you're about to miss.
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
            to="https://github.com/peter-fusek/infracost"
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
        <UCard
          v-for="(feature, i) in features"
          :key="feature.title"
          class="feature-card animate-fade-in-up border-l-3 border-l-emerald-500"
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
        </UCard>
      </div>
    </section>

    <!-- Tracked Platforms — auto-scrolling carousel -->
    <section class="animate-fade-in-up overflow-hidden" style="animation-delay: 700ms">
      <h2 class="text-center text-xs font-bold uppercase tracking-[0.2em] text-[var(--ui-text-dimmed)] mb-4">Pulling live costs from</h2>
      <div class="logo-carousel">
        <div class="logo-track">
          <div
            v-for="(p, i) in [...platforms, ...platforms]"
            :key="`${p.name}-${i}`"
            class="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] px-4 py-2.5 shrink-0 dark:border-gray-500/50 dark:bg-gray-700/20"
          >
            <UIcon :name="p.icon" class="size-5 text-[var(--ui-text-muted)]" />
            <span class="text-sm font-medium whitespace-nowrap">{{ p.name }}</span>
          </div>
        </div>
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

        <UCard class="metric-card-triage">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Needs Attention</p>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span v-if="triageSummary?.redCount" class="text-2xl font-bold tabular-nums text-red-500">{{ triageSummary.redCount }}</span>
                <span v-if="triageSummary?.redCount && triageSummary?.yellowCount" class="text-[var(--ui-text-dimmed)]">/</span>
                <span v-if="triageSummary?.yellowCount" class="text-2xl font-bold tabular-nums text-amber-500">{{ triageSummary.yellowCount }}</span>
                <span v-if="!triageSummary?.totalCount" class="text-2xl font-bold tabular-nums text-emerald-500">0</span>
              </div>
              <NuxtLink to="/triage" class="mt-0.5 text-sm text-emerald-500 hover:underline">Review &rarr;</NuxtLink>
            </div>
            <div class="flex size-9 items-center justify-center rounded-lg" :class="triageSummary?.redCount ? 'bg-red-500/10' : 'bg-violet-500/10'">
              <UIcon name="i-lucide-clipboard-list" class="size-4" :class="triageSummary?.redCount ? 'text-red-500' : 'text-violet-500'" />
            </div>
          </div>
        </UCard>
      </div>

      <StaleDataBanner v-if="collectionStatus" :last-collected-at="collectionStatus.lastCollectedAt" />

      <!-- Active alerts -->
      <div v-if="activeAlerts?.length" class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="font-display font-bold text-sm">Active Alerts</h3>
          <UBadge :color="activeAlerts.some(a => a.severity === 'critical') ? 'error' : 'warning'" variant="solid" size="xs">
            {{ activeAlerts.length }}
          </UBadge>
        </div>
        <div
          v-for="alert in activeAlerts"
          :key="alert.id"
          class="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
          :class="{
            'border-[var(--ui-error)] bg-[var(--ui-error)]/5': alert.severity === 'critical',
            'border-[var(--ui-warning)] bg-[var(--ui-warning)]/5': alert.severity === 'warning',
            'border-[var(--ui-info)] bg-[var(--ui-info)]/5': alert.severity === 'info',
          }"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UIcon
              :name="alert.severity === 'critical' ? 'i-lucide-alert-triangle' : alert.severity === 'warning' ? 'i-lucide-alert-circle' : 'i-lucide-info'"
              class="size-5 shrink-0"
              :class="{
                'text-[var(--ui-error)]': alert.severity === 'critical',
                'text-[var(--ui-warning)]': alert.severity === 'warning',
                'text-[var(--ui-info)]': alert.severity === 'info',
              }"
            />
            <div class="min-w-0">
              <p class="text-sm truncate">{{ alert.message }}</p>
              <p class="text-xs text-[var(--ui-text-dimmed)]">{{ timeAgo(alert.createdAt) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UBadge :color="alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : ('info' as any)" variant="subtle" size="xs">
              {{ alert.severity }}
            </UBadge>
            <template v-if="loggedIn">
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
          </div>
        </div>
      </div>

      <!-- Analytics overview (lazy-loaded) -->
      <UCard v-if="analyticsAgg">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-display font-bold">Analytics Overview</h3>
            <UButton to="/analytics" variant="ghost" size="xs" label="View Details" icon="i-lucide-arrow-right" trailing />
          </div>
        </template>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Sessions</p>
            <p class="mt-1 text-xl font-bold tabular-nums">{{ analyticsAgg.sessions.toLocaleString() }}</p>
          </div>
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Users</p>
            <p class="mt-1 text-xl font-bold tabular-nums">{{ analyticsAgg.users.toLocaleString() }}</p>
          </div>
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Search Clicks</p>
            <p class="mt-1 text-xl font-bold tabular-nums">{{ analyticsAgg.clicks.toLocaleString() }}</p>
          </div>
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Impressions</p>
            <p class="mt-1 text-xl font-bold tabular-nums">{{ analyticsAgg.impressions.toLocaleString() }}</p>
          </div>
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Avg SEO</p>
            <p
              class="mt-1 text-xl font-bold tabular-nums"
              :class="analyticsAgg.avgSeo !== null ? (analyticsAgg.avgSeo >= 75 ? 'text-[var(--ui-success)]' : analyticsAgg.avgSeo >= 50 ? 'text-[var(--ui-warning)]' : 'text-[var(--ui-error)]') : ''"
            >
              {{ analyticsAgg.avgSeo ?? '—' }}
            </p>
          </div>
        </div>
        <p class="mt-3 text-xs text-[var(--ui-text-dimmed)] text-center">
          30-day totals across {{ analyticsAgg.projectCount }} project{{ analyticsAgg.projectCount !== 1 ? 's' : '' }}
        </p>
      </UCard>

      <!-- Platform breakdown -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-display font-bold">Cost by Platform</h3>
            <UButton to="/breakdown" variant="ghost" size="xs" label="View Full Breakdown" icon="i-lucide-arrow-right" trailing />
          </div>
        </template>

        <SkeletonLoader v-if="status === 'pending'" variant="table" :rows="6" />

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
