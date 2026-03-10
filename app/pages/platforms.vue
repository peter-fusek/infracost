<script setup lang="ts">
interface Platform {
  id: number
  slug: string
  name: string
  type: string
  collectionMethod: string
  billingCycle: string
  isActive: boolean
}

const { data: platformList, status } = await useFetch<Platform[]>('/api/platforms')

const typeColors: Record<string, string> = {
  hosting: 'primary',
  ai: 'warning',
  database: 'success',
  email: 'info',
  sms: 'info',
  cloud: 'secondary',
  ci_cd: 'neutral',
  domain: 'neutral',
  banking: 'neutral',
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold">Platforms</h2>
      <p class="text-sm text-[var(--ui-text-muted)]">All monitored infrastructure platforms</p>
    </div>

    <div v-if="status === 'pending'" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
    </div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="platform in platformList" :key="platform.id">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">{{ platform.name }}</h3>
            <UBadge :color="(typeColors[platform.type] as any) || 'neutral'" variant="subtle" size="sm">
              {{ platform.type }}
            </UBadge>
          </div>
          <div class="flex gap-2 text-xs text-[var(--ui-text-muted)]">
            <span>{{ platform.collectionMethod }}</span>
            <span>&middot;</span>
            <span>{{ platform.billingCycle }}</span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
