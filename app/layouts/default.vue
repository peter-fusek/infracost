<script setup lang="ts">
const navigation = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/' },
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
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <slot />
    </main>
  </div>
</template>
