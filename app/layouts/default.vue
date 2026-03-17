<script setup lang="ts">
const { loggedIn, user, clear: logout } = useUserSession()

const navigation = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Breakdown', icon: 'i-lucide-list-tree', to: '/breakdown' },
  { label: 'Trends', icon: 'i-lucide-trending-up', to: '/trends' },
  { label: 'Optimizations', icon: 'i-lucide-lightbulb', to: '/optimizations' },
  { label: 'Depletion', icon: 'i-lucide-battery-low', to: '/depletion' },
  { label: 'Status', icon: 'i-lucide-activity', to: '/status' },
  { label: 'Platforms', icon: 'i-lucide-server', to: '/platforms' },
  { label: 'Manual Entry', icon: 'i-lucide-pencil', to: '/manual' },
]
</script>

<template>
  <div class="min-h-screen bg-[var(--ui-bg)]">
    <header class="border-b border-[var(--ui-border)]">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between">
          <div class="flex items-center gap-4">
            <h1 class="text-lg font-semibold">InfraCost</h1>
            <nav class="flex gap-1">
              <UButton
                v-for="item in navigation"
                :key="item.to"
                :to="item.to"
                :icon="item.icon"
                :label="item.label"
                variant="ghost"
                size="sm"
              />
            </nav>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="loggedIn">
              <UAvatar v-if="user?.picture" :src="user.picture" size="xs" />
              <span class="text-sm text-[var(--ui-text-muted)]">{{ user?.name || user?.email }}</span>
              <UButton label="Logout" variant="ghost" size="xs" @click="logout()" />
            </template>
            <UButton v-else label="Login" icon="i-lucide-log-in" variant="soft" size="sm" to="/auth/google" external />
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <slot />
    </main>
  </div>
</template>
