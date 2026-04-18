<script setup lang="ts">
interface DailyTraffic {
  date: string
  sessions: number
  humans: number
  bots: number
}

interface DailySearch {
  date: string
  clicks: number
  impressions: number
  position: number
}

interface TopQuery {
  query: string
  clicks: number
  impressions: number
}

interface ProjectAnalytics {
  slug: string
  name: string
  productionUrl: string | null
  ga4PropertyId: string | null
  gscSiteUrl: string | null
  sharedGa4With: string[]
  sharedGscWith: string[]
  ga4: {
    sessions: number
    users: number
    humanSessions: number
    botSessions: number
    daily: DailyTraffic[]
    errors: string[]
  } | null
  gsc: {
    clicks: number
    impressions: number
    ctr: number
    position: number
    seoScore: number
    tips: string[]
    daily: DailySearch[]
    topQueries: TopQuery[]
    errors: string[]
  } | null
}

interface AnalyticsSummary {
  projects: ProjectAnalytics[]
  unconfigured: string[]
  fetchedAt: string
}

const { data, status, error } = await useFetch<AnalyticsSummary>('/api/analytics/summary', { lazy: true })

// Sparkline SVG generator
function sparklinePath(values: number[], width: number = 120, height: number = 32): string {
  if (values.length < 2) return ''
  const max = Math.max(...values, 1)
  const step = width / (values.length - 1)
  const points = values.map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`)
  return points.join(' ')
}

function sparklineArea(values: number[], width: number = 120, height: number = 32): string {
  if (values.length < 2) return ''
  const path = sparklinePath(values, width, height)
  const step = width / (values.length - 1)
  return `0,${height} ${path} ${(values.length - 1) * step},${height}`
}

// SEO score color
function seoScoreColor(score: number): string {
  if (score >= 75) return 'text-[var(--ui-success)]'
  if (score >= 50) return 'text-[var(--ui-warning)]'
  return 'text-[var(--ui-error)]'
}

function seoScoreBg(score: number): string {
  if (score >= 75) return 'border-[var(--ui-success)] bg-[var(--ui-success)]/10'
  if (score >= 50) return 'border-[var(--ui-warning)] bg-[var(--ui-warning)]/10'
  return 'border-[var(--ui-error)] bg-[var(--ui-error)]/10'
}

function seoScoreLabel(score: number): string {
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Needs work'
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function humanPct(ga4: ProjectAnalytics['ga4']): number {
  if (!ga4 || ga4.sessions === 0) return 0
  return Math.round((ga4.humanSessions / ga4.sessions) * 100)
}

// Trend indicator
function trend(values: number[]): { direction: 'up' | 'down' | 'flat'; pct: number } {
  if (values.length < 14) return { direction: 'flat', pct: 0 }
  const recent = values.slice(-7).reduce((a, b) => a + b, 0)
  const prior = values.slice(-14, -7).reduce((a, b) => a + b, 0)
  if (prior === 0) return { direction: recent > 0 ? 'up' : 'flat', pct: 0 }
  const pct = Math.round(((recent - prior) / prior) * 100)
  return { direction: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat', pct: Math.abs(pct) }
}

// External dashboard URLs
function ga4Url(propertyId: string): string {
  return `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/reportinghub`
}

function gscUrl(siteUrl: string): string {
  return `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(siteUrl)}`
}

// Expanded state for tips
const expandedTips = ref<Set<string>>(new Set())
function toggleTips(slug: string) {
  if (expandedTips.value.has(slug)) expandedTips.value.delete(slug)
  else expandedTips.value.add(slug)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Project Analytics</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">
          Traffic &amp; search performance per project &middot; 30-day window
        </p>
      </div>
      <div v-if="data?.fetchedAt" class="text-xs text-[var(--ui-text-dimmed)]">
        {{ new Date(data.fetchedAt).toLocaleString() }}
      </div>
    </div>

    <!-- Loading -->
    <SkeletonLoader v-if="status === 'pending'" variant="list" :rows="4" />

    <!-- Error state -->
    <div v-else-if="error" class="rounded-xl border border-dashed border-[var(--ui-error)] px-8 py-12 text-center">
      <UIcon name="i-lucide-alert-triangle" class="mx-auto size-10 text-[var(--ui-error)]" />
      <p class="mt-3 font-display font-bold text-lg">Failed to load analytics</p>
      <p class="mt-1 text-sm text-[var(--ui-text-muted)] max-w-md mx-auto">
        {{ error.statusCode === 401 || error.statusCode === 403
          ? 'GCP service account credentials may be expired or missing. Check GCP_SERVICE_ACCOUNT_JSON in your environment.'
          : error.statusCode === 429
            ? 'GA4/GSC API quota exceeded. Try again in a few minutes.'
            : error.data?.message || 'An unexpected error occurred while fetching analytics data.' }}
      </p>
    </div>

    <template v-else-if="data">
      <!-- No configured projects -->
      <div v-if="!data.projects.length" class="rounded-xl border border-dashed border-[var(--ui-border)] px-8 py-12 text-center">
        <UIcon name="i-lucide-bar-chart-2" class="mx-auto size-10 text-[var(--ui-text-dimmed)]" />
        <p class="mt-3 font-display font-bold text-lg">No analytics configured</p>
        <p class="mt-1 text-sm text-[var(--ui-text-muted)] max-w-md mx-auto">
          Set GA4 Property IDs and GSC Site URLs in server/utils/analytics-config.ts, then add a GCP service account with Analytics and Search Console read access.
        </p>
      </div>

      <!-- Project analytics cards -->
      <div v-else class="space-y-6">
        <div
          v-for="(project, i) in data.projects"
          :key="project.slug"
          class="animate-fade-in-up"
          :style="{ animationDelay: `${i * 80}ms` }"
        >
          <UCard class="overflow-hidden">
            <!-- Project header -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3 flex-wrap">
                <h2 class="font-display text-lg font-bold">{{ project.name }}</h2>
                <a
                  v-if="project.productionUrl"
                  :href="project.productionUrl"
                  target="_blank"
                  rel="noopener"
                  class="text-xs text-[var(--ui-primary)] hover:underline flex items-center gap-0.5"
                >
                  <UIcon name="i-lucide-external-link" class="size-3" />
                  {{ project.productionUrl.replace('https://', '') }}
                </a>
                <UBadge
                  v-if="project.sharedGa4With?.length"
                  color="warning"
                  variant="subtle"
                  size="xs"
                  :title="`Same GA4 property (${project.ga4PropertyId}) as ${project.sharedGa4With.join(', ')} — numbers below are not traffic-isolated for this slug.`"
                >
                  <UIcon name="i-lucide-link-2" class="size-3 mr-0.5" />
                  shares GA4 with {{ project.sharedGa4With.join(', ') }}
                </UBadge>
                <UBadge
                  v-if="project.sharedGscWith?.length"
                  color="warning"
                  variant="subtle"
                  size="xs"
                  :title="`Same GSC site (${project.gscSiteUrl}) as ${project.sharedGscWith.join(', ')}.`"
                >
                  <UIcon name="i-lucide-link-2" class="size-3 mr-0.5" />
                  shares GSC with {{ project.sharedGscWith.join(', ') }}
                </UBadge>
              </div>
              <!-- SEO Score badge -->
              <div
                v-if="project.gsc"
                class="flex items-center gap-2"
              >
                <div
                  class="flex items-center justify-center size-11 rounded-full border-2 font-display font-bold text-sm"
                  :class="seoScoreBg(project.gsc.seoScore)"
                >
                  <span :class="seoScoreColor(project.gsc.seoScore)">{{ project.gsc.seoScore }}</span>
                </div>
                <div class="text-right">
                  <p class="text-xs font-medium" :class="seoScoreColor(project.gsc.seoScore)">{{ seoScoreLabel(project.gsc.seoScore) }}</p>
                  <p class="text-[10px] text-[var(--ui-text-dimmed)]">SEO Score</p>
                </div>
              </div>
            </div>

            <!-- Two-column layout: Traffic + Search -->
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">

              <!-- GA4 Traffic Section -->
              <div v-if="project.ga4" class="space-y-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-users" class="size-4 text-emerald-500" />
                  <h3 class="text-sm font-medium">Traffic</h3>
                  <a
                    v-if="project.ga4PropertyId"
                    :href="ga4Url(project.ga4PropertyId)"
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-[var(--ui-primary)] hover:underline flex items-center gap-0.5"
                    title="Open in Google Analytics"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3" />
                    GA4
                  </a>
                  <UBadge
                    v-if="project.ga4.daily.length >= 14"
                    :color="trend(project.ga4.daily.map(d => d.sessions)).direction === 'up' ? 'success' : trend(project.ga4.daily.map(d => d.sessions)).direction === 'down' ? 'error' : ('neutral' as any)"
                    variant="subtle"
                    size="xs"
                  >
                    <UIcon
                      :name="trend(project.ga4.daily.map(d => d.sessions)).direction === 'up' ? 'i-lucide-trending-up' : trend(project.ga4.daily.map(d => d.sessions)).direction === 'down' ? 'i-lucide-trending-down' : 'i-lucide-minus'"
                      class="size-3 mr-0.5"
                    />
                    {{ trend(project.ga4.daily.map(d => d.sessions)).pct }}%
                  </UBadge>
                </div>

                <!-- Sparkline: humans (green) + bots (orange) -->
                <div class="relative">
                  <svg viewBox="0 0 120 32" class="w-full h-12" preserveAspectRatio="none">
                    <!-- Human sessions area fill -->
                    <polygon
                      :points="sparklineArea(project.ga4.daily.map(d => d.humans), 120, 32)"
                      fill="rgba(16, 185, 129, 0.12)"
                    />
                    <!-- Human sessions line -->
                    <polyline
                      :points="sparklinePath(project.ga4.daily.map(d => d.humans), 120, 32)"
                      fill="none"
                      stroke="rgb(16, 185, 129)"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <!-- Bot sessions line -->
                    <polyline
                      v-if="project.ga4.daily.some(d => d.bots > 0)"
                      :points="sparklinePath(project.ga4.daily.map(d => d.bots), 120, 32)"
                      fill="none"
                      stroke="rgb(251, 146, 60)"
                      stroke-width="1"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-dasharray="3 2"
                    />
                  </svg>
                  <div class="flex items-center gap-3 mt-1 text-[10px] text-[var(--ui-text-dimmed)]">
                    <span class="flex items-center gap-1"><span class="inline-block size-1.5 rounded-full bg-emerald-500" /> Humans</span>
                    <span class="flex items-center gap-1"><span class="inline-block size-1.5 rounded-full bg-orange-400" /> Bots</span>
                  </div>
                </div>

                <!-- Traffic metrics -->
                <div class="grid grid-cols-4 gap-2">
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums">{{ fmtNum(project.ga4.sessions) }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">sessions</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums">{{ fmtNum(project.ga4.users) }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">users</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums text-emerald-600">{{ humanPct(project.ga4) }}%</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">human</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums text-orange-500">{{ fmtNum(project.ga4.botSessions) }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">bots</p>
                  </div>
                </div>

                <!-- GA4 errors -->
                <p v-for="err in project.ga4.errors" :key="err" class="text-xs text-[var(--ui-error)]">{{ err }}</p>
              </div>

              <!-- GA4 not configured -->
              <div v-else class="flex items-center justify-center rounded-lg border border-dashed border-[var(--ui-border)] py-8 text-center">
                <div>
                  <UIcon name="i-lucide-bar-chart-2" class="mx-auto size-6 text-[var(--ui-text-dimmed)]" />
                  <p class="mt-1.5 text-xs text-[var(--ui-text-muted)]">GA4 not configured</p>
                </div>
              </div>

              <!-- GSC Search Performance Section -->
              <div v-if="project.gsc" class="space-y-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-search" class="size-4 text-blue-500" />
                  <h3 class="text-sm font-medium">Search Performance</h3>
                  <a
                    v-if="project.gscSiteUrl"
                    :href="gscUrl(project.gscSiteUrl)"
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-[var(--ui-primary)] hover:underline flex items-center gap-0.5"
                    title="Open in Search Console"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3" />
                    GSC
                  </a>
                  <UBadge
                    v-if="project.gsc.daily.length >= 14"
                    :color="trend(project.gsc.daily.map(d => d.clicks)).direction === 'up' ? 'success' : trend(project.gsc.daily.map(d => d.clicks)).direction === 'down' ? 'error' : ('neutral' as any)"
                    variant="subtle"
                    size="xs"
                  >
                    <UIcon
                      :name="trend(project.gsc.daily.map(d => d.clicks)).direction === 'up' ? 'i-lucide-trending-up' : trend(project.gsc.daily.map(d => d.clicks)).direction === 'down' ? 'i-lucide-trending-down' : 'i-lucide-minus'"
                      class="size-3 mr-0.5"
                    />
                    {{ trend(project.gsc.daily.map(d => d.clicks)).pct }}%
                  </UBadge>
                </div>

                <!-- Sparkline: clicks (blue) + impressions (gray) -->
                <div class="relative">
                  <svg viewBox="0 0 120 32" class="w-full h-12" preserveAspectRatio="none">
                    <!-- Impressions area fill -->
                    <polygon
                      :points="sparklineArea(project.gsc.daily.map(d => d.impressions), 120, 32)"
                      fill="rgba(148, 163, 184, 0.1)"
                    />
                    <!-- Impressions line -->
                    <polyline
                      :points="sparklinePath(project.gsc.daily.map(d => d.impressions), 120, 32)"
                      fill="none"
                      stroke="rgb(148, 163, 184)"
                      stroke-width="1"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <!-- Clicks area fill -->
                    <polygon
                      :points="sparklineArea(project.gsc.daily.map(d => d.clicks), 120, 32)"
                      fill="rgba(59, 130, 246, 0.12)"
                    />
                    <!-- Clicks line -->
                    <polyline
                      :points="sparklinePath(project.gsc.daily.map(d => d.clicks), 120, 32)"
                      fill="none"
                      stroke="rgb(59, 130, 246)"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <div class="flex items-center gap-3 mt-1 text-[10px] text-[var(--ui-text-dimmed)]">
                    <span class="flex items-center gap-1"><span class="inline-block size-1.5 rounded-full bg-blue-500" /> Clicks</span>
                    <span class="flex items-center gap-1"><span class="inline-block size-1.5 rounded-full bg-slate-400" /> Impressions</span>
                  </div>
                </div>

                <!-- Search metrics -->
                <div class="grid grid-cols-4 gap-2">
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums">{{ fmtNum(project.gsc.clicks) }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">clicks</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums">{{ fmtNum(project.gsc.impressions) }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">impressions</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums">{{ fmtPct(project.gsc.ctr) }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">CTR</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-bold tabular-nums">#{{ project.gsc.position }}</p>
                    <p class="text-[10px] text-[var(--ui-text-dimmed)]">avg pos</p>
                  </div>
                </div>

                <!-- Top queries -->
                <div v-if="project.gsc.topQueries.length" class="mt-2">
                  <p class="text-xs font-medium text-[var(--ui-text-muted)] mb-1">Top Queries</p>
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="q in project.gsc.topQueries.slice(0, 5)"
                      :key="q.query"
                      color="neutral"
                      variant="outline"
                      size="xs"
                      :title="`${q.clicks} clicks, ${q.impressions} imp`"
                    >
                      {{ q.query }}
                    </UBadge>
                  </div>
                </div>

                <!-- GSC errors -->
                <p v-for="err in project.gsc.errors" :key="err" class="text-xs text-[var(--ui-error)]">{{ err }}</p>
              </div>

              <!-- GSC not configured -->
              <div v-else class="flex items-center justify-center rounded-lg border border-dashed border-[var(--ui-border)] py-8 text-center">
                <div>
                  <UIcon name="i-lucide-search" class="mx-auto size-6 text-[var(--ui-text-dimmed)]" />
                  <p class="mt-1.5 text-xs text-[var(--ui-text-muted)]">GSC not configured</p>
                </div>
              </div>
            </div>

            <!-- Tips section -->
            <div v-if="project.gsc?.tips?.length" class="mt-4 border-t border-[var(--ui-border)] pt-3">
              <button
                class="flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors"
                @click="toggleTips(project.slug)"
              >
                <UIcon
                  :name="expandedTips.has(project.slug) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-3.5"
                />
                {{ project.gsc.tips.length }} improvement tip{{ project.gsc.tips.length !== 1 ? 's' : '' }}
              </button>
              <div v-if="expandedTips.has(project.slug)" class="mt-2 space-y-1.5">
                <div
                  v-for="(tip, idx) in project.gsc.tips"
                  :key="idx"
                  class="flex items-start gap-2 text-xs text-[var(--ui-text-muted)]"
                >
                  <UIcon name="i-lucide-lightbulb" class="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span>{{ tip }}</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Unconfigured projects -->
      <div v-if="data.unconfigured.length" class="mt-4">
        <p class="text-xs text-[var(--ui-text-dimmed)] mb-2">Not configured for analytics</p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="slug in data.unconfigured"
            :key="slug"
            color="neutral"
            variant="outline"
            size="sm"
          >
            {{ slug }}
          </UBadge>
        </div>
      </div>
    </template>
  </div>
</template>
