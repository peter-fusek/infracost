<script setup lang="ts">
interface Optimization {
  id: number
  title: string
  description: string
  platformName: string | null
  platformSlug: string | null
  serviceName: string | null
  estimatedSavingsUsd: number
  estimatedSavingsEur: number
  effort: string
  status: string
  suggestedBy: string
  createdAt: string
  implementedAt: string | null
}

const { data: items, status, refresh } = await useFetch<Optimization[]>('/api/optimizations')
const { loggedIn } = useUserSession()

const route = useRoute()
const router = useRouter()
const toast = useToast()

type FilterKey = 'all' | 'actionable' | 'dismissed' | 'implemented'
const activeFilter = ref<FilterKey>((route.query.filter as FilterKey) || 'all')

function setFilter(f: FilterKey) {
  activeFilter.value = f
  router.replace({ query: { ...route.query, filter: f === 'all' ? undefined : f } })
}

const filteredItems = computed(() => {
  if (!items.value) return []
  switch (activeFilter.value) {
    case 'actionable': return items.value.filter(i => i.status === 'suggested' || i.status === 'approved')
    case 'dismissed': return items.value.filter(i => i.status === 'dismissed' || i.status === 'rejected')
    case 'implemented': return items.value.filter(i => i.status === 'implemented')
    default: return items.value
  }
})

const filterCounts = computed(() => {
  if (!items.value) return { all: 0, actionable: 0, dismissed: 0, implemented: 0 }
  return {
    all: items.value.length,
    actionable: items.value.filter(i => i.status === 'suggested' || i.status === 'approved').length,
    dismissed: items.value.filter(i => i.status === 'dismissed' || i.status === 'rejected').length,
    implemented: items.value.filter(i => i.status === 'implemented').length,
  }
})

async function updateStatus(id: number, newStatus: string) {
  try {
    await $fetch(`/api/optimizations/${id}`, { method: 'PATCH', body: { status: newStatus } })
    await refresh()
    toast.add({ title: 'Updated', description: `Status changed to ${newStatus}`, color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to update', color: 'error' })
  }
}

const effortColors: Record<string, string> = {
  trivial: 'success',
  small: 'info',
  medium: 'warning',
  large: 'error',
}

const statusColors: Record<string, string> = {
  suggested: 'neutral',
  approved: 'primary',
  rejected: 'error',
  implemented: 'success',
  dismissed: 'neutral',
}

const totalSavings = computed(() => {
  const source = activeFilter.value === 'all'
    ? items.value?.filter(i => i.status === 'suggested' || i.status === 'approved')
    : filteredItems.value.filter(i => i.status === 'suggested' || i.status === 'approved')
  return {
    usd: source?.reduce((s, i) => s + i.estimatedSavingsUsd, 0) ?? 0,
    eur: source?.reduce((s, i) => s + i.estimatedSavingsEur, 0) ?? 0,
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Optimization Opportunities</h1>
        <p class="text-sm text-[var(--ui-text-muted)]">Actionable cost savings with pros &amp; cons</p>
      </div>
      <UCard v-if="items?.length" class="text-right">
        <p class="text-sm text-[var(--ui-text-muted)]">Potential Savings</p>
        <p class="text-xl font-semibold text-[var(--ui-success)]">${{ totalSavings.usd.toFixed(2) }}/mo</p>
        <p class="text-sm text-[var(--ui-text-dimmed)]">€{{ totalSavings.eur.toFixed(2) }}/mo</p>
      </UCard>
    </div>

    <!-- Filter toggles -->
    <div v-if="items?.length" class="flex items-center gap-1 rounded-lg border border-[var(--ui-border)] p-0.5 w-fit">
      <UButton
        v-for="f in (['all', 'actionable', 'dismissed', 'implemented'] as const)"
        :key="f"
        size="xs"
        :variant="activeFilter === f ? 'solid' : 'ghost'"
        @click="setFilter(f)"
      >
        {{ f.charAt(0).toUpperCase() + f.slice(1) }}
        <template #trailing>
          <UBadge :color="activeFilter === f ? 'neutral' : 'neutral'" variant="subtle" size="xs">
            {{ filterCounts[f] }}
          </UBadge>
        </template>
      </UButton>
    </div>

    <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
    </div>

    <div v-else-if="!items?.length" class="py-8 text-center text-[var(--ui-text-muted)]">
      <p>No optimization opportunities found.</p>
      <p class="mt-1 text-sm">Run a collection and seed the database to populate recommendations.</p>
    </div>

    <div v-else-if="!filteredItems.length" class="py-8 text-center text-[var(--ui-text-muted)]">
      <p>No {{ activeFilter }} optimizations.</p>
    </div>

    <div v-else class="space-y-4">
      <UCard v-for="opt in filteredItems" :key="opt.id">
        <!-- Header -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-display font-bold">{{ opt.title }}</h3>
              <UBadge :color="(effortColors[opt.effort] as any) || 'neutral'" variant="subtle" size="xs">
                {{ opt.effort }}
              </UBadge>
              <UBadge :color="(statusColors[opt.status] as any) || 'neutral'" variant="solid" size="xs">
                {{ opt.status }}
              </UBadge>
              <span v-if="opt.implementedAt" class="text-xs text-[var(--ui-text-dimmed)]">
                {{ new Date(opt.implementedAt).toLocaleDateString() }}
              </span>
              <UBadge v-if="opt.platformName" variant="outline" size="xs" color="neutral">
                {{ opt.platformName }}
              </UBadge>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p class="text-lg font-semibold" :class="opt.estimatedSavingsUsd > 0 ? 'text-[var(--ui-success)]' : 'text-[var(--ui-text-muted)]'">
              {{ opt.estimatedSavingsUsd > 0 ? `-$${opt.estimatedSavingsUsd.toFixed(2)}` : '$0.00' }}
            </p>
            <p class="text-xs text-[var(--ui-text-dimmed)]">
              {{ opt.estimatedSavingsUsd > 0 ? `-€${opt.estimatedSavingsEur.toFixed(2)}` : '€0.00' }}/mo
            </p>
          </div>
        </div>

        <!-- Description with markdown-like rendering -->
        <div class="mt-3 text-sm text-[var(--ui-text-toned)] whitespace-pre-line leading-relaxed">
          {{ opt.description }}
        </div>

        <!-- Actions (auth-gated) -->
        <div v-if="loggedIn && opt.status === 'suggested'" class="mt-4 flex gap-2 border-t border-[var(--ui-border)] pt-3">
          <UButton size="xs" color="primary" variant="soft" label="Approve" icon="i-lucide-check" @click="updateStatus(opt.id, 'approved')" />
          <UButton size="xs" color="neutral" variant="ghost" label="Dismiss" icon="i-lucide-x" @click="updateStatus(opt.id, 'dismissed')" />
        </div>
        <div v-else-if="loggedIn && opt.status === 'approved'" class="mt-4 flex gap-2 border-t border-[var(--ui-border)] pt-3">
          <UButton size="xs" color="success" variant="soft" label="Mark Implemented" icon="i-lucide-check-check" @click="updateStatus(opt.id, 'implemented')" />
        </div>
      </UCard>
    </div>
  </div>
</template>
