<script setup lang="ts">
const { loggedIn, user, clear: logout } = useUserSession()
const route = useRoute()
const mobileMenuOpen = ref(false)

const navigation = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Breakdown', icon: 'i-lucide-list-tree', to: '/breakdown' },
  { label: 'Trends', icon: 'i-lucide-trending-up', to: '/trends' },
  { label: 'Optimizations', icon: 'i-lucide-lightbulb', to: '/optimizations' },
  { label: 'Countdown', icon: 'i-lucide-timer', to: '/countdown' },
  { label: 'Triage', icon: 'i-lucide-clipboard-list', to: '/triage' },
  { label: 'Alerts', icon: 'i-lucide-bell', to: '/alerts' },
  { label: 'Analytics', icon: 'i-lucide-bar-chart-2', to: '/analytics' },
  { label: 'Status', icon: 'i-lucide-activity', to: '/status' },
  { label: 'Platforms', icon: 'i-lucide-server', to: '/platforms' },
  { label: 'Budgets', icon: 'i-lucide-wallet', to: '/budgets' },
  { label: 'Manual Entry', icon: 'i-lucide-pencil', to: '/manual' },
  { label: 'Verify', icon: 'i-lucide-shield-check', to: '/verify' },
  { label: 'Reconciliation', icon: 'i-lucide-scale', to: '/reconciliation' },
]

// Pending alerts badge count
const { data: pendingAlerts } = await useFetch<{ alerts: any[]; total: number }>('/api/alerts', { query: { status: 'pending' }, lazy: true })
const pendingAlertCount = computed(() => pendingAlerts.value?.total ?? 0)

// Triage badge count
const { data: triageSummary } = await useFetch<{ totalCount: number; redCount: number }>('/api/triage/summary', { lazy: true })
const triageCount = computed(() => triageSummary.value?.totalCount ?? 0)

watch(() => route.path, () => {
  mobileMenuOpen.value = false
})
</script>

<template>
  <div class="min-h-screen bg-[var(--ui-bg)]">
    <!-- Sticky header with backdrop blur -->
    <header class="sticky top-0 z-50 border-b border-[var(--ui-border)] bg-[var(--ui-bg)]/80 header-blur">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-14 items-center justify-between">
          <!-- Brand + Desktop Nav -->
          <div class="flex items-center gap-6">
            <NuxtLink to="/" class="flex items-center gap-2 group">
              <div class="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                <UIcon name="i-lucide-bar-chart-3" class="size-4 text-emerald-500" />
              </div>
              <span class="font-display text-lg font-bold tracking-tight">InfraCost</span>
            </NuxtLink>
            <nav class="hidden lg:flex gap-0.5">
              <NuxtLink
                v-for="item in navigation"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--ui-bg-elevated)]"
                :class="route.path === item.to ? 'nav-pill-active' : 'text-[var(--ui-text-muted)]'"
              >
                <UIcon :name="item.icon" class="size-4" />
                <span>{{ item.label }}</span>
                <span
                  v-if="item.to === '/alerts' && pendingAlertCount > 0"
                  class="ml-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
                >
                  {{ pendingAlertCount > 9 ? '9+' : pendingAlertCount }}
                </span>
                <span
                  v-if="item.to === '/triage' && triageCount > 0"
                  class="ml-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                >
                  {{ triageCount > 9 ? '9+' : triageCount }}
                </span>
              </NuxtLink>
            </nav>
          </div>

          <!-- Right side: user + mobile toggle -->
          <div class="flex items-center gap-3">
            <template v-if="loggedIn">
              <div class="hidden sm:flex items-center gap-2">
                <UAvatar v-if="(user as any)?.picture" :src="(user as any).picture" size="xs" />
                <span class="text-sm text-[var(--ui-text-muted)]">{{ (user as any)?.name || (user as any)?.email }}</span>
              </div>
              <UButton label="Logout" variant="ghost" size="xs" @click="logout()" />
            </template>
            <UButton v-else label="Login" icon="i-lucide-log-in" variant="soft" size="sm" to="/auth/google" external />

            <UColorModeButton variant="ghost" size="xs" />

            <!-- Mobile menu toggle -->
            <UButton
              class="lg:hidden"
              :icon="mobileMenuOpen ? 'i-lucide-x' : 'i-lucide-menu'"
              :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
              variant="ghost"
              size="sm"
              @click="mobileMenuOpen = !mobileMenuOpen"
            />
          </div>
        </div>

        <!-- Mobile navigation drawer -->
        <nav v-if="mobileMenuOpen" class="lg:hidden border-t border-[var(--ui-border)] py-3 space-y-0.5">
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--ui-bg-elevated)]"
            :class="route.path === item.to ? 'nav-pill-active' : 'text-[var(--ui-text-muted)]'"
          >
            <UIcon :name="item.icon" class="size-4" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.to === '/alerts' && pendingAlertCount > 0"
              class="ml-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
            >
              {{ pendingAlertCount > 9 ? '9+' : pendingAlertCount }}
            </span>
          </NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t border-[var(--ui-border)] mt-12">
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between text-xs text-[var(--ui-text-dimmed)]">
          <span>InfraCost &middot; Infrastructure cost tracking</span>
          <span>infracost.eu</span>
        </div>
      </div>
    </footer>

    <BugReportButton />
  </div>
</template>
