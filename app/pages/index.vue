<script setup lang="ts">
interface PlatformCost {
  platformId: number
  platformSlug: string
  platformName: string
  mtd: number
  eomEstimate: number
  recordCount: number
}

interface MTDSummary {
  totalMTD: number
  eomEstimate: number
  monthProgress: number
  daysInMonth: number
  currentDay: number
  byPlatform: PlatformCost[]
}

const { data: mtd, status, refresh } = await useFetch<MTDSummary>('/api/costs/mtd')

const topCards = computed(() => [
  {
    label: 'Month-to-Date',
    value: mtd.value ? `$${mtd.value.totalMTD.toFixed(2)}` : '$0.00',
    description: `Day ${mtd.value?.currentDay || 0} of ${mtd.value?.daysInMonth || 30}`,
    icon: 'i-lucide-dollar-sign',
  },
  {
    label: 'EOM Estimate',
    value: mtd.value ? `$${mtd.value.eomEstimate.toFixed(2)}` : '$0.00',
    description: `${mtd.value?.monthProgress || 0}% through the month`,
    icon: 'i-lucide-trending-up',
  },
  {
    label: 'Platforms Tracked',
    value: mtd.value?.byPlatform.length || 0,
    description: 'With cost data this month',
    icon: 'i-lucide-server',
  },
])

const collecting = ref(false)

async function triggerCollection() {
  collecting.value = true
  try {
    await $fetch('/api/collect/trigger', { method: 'POST', body: { trigger: 'manual' } })
    await refresh()
  }
  finally {
    collecting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">Infrastructure Costs</h2>
        <p class="text-sm text-[var(--ui-text-muted)]">
          {{ new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }}
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        label="Collect Now"
        :loading="collecting"
        @click="triggerCollection"
      />
    </div>

    <!-- Top metric cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <UCard v-for="card in topCards" :key="card.label">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm text-[var(--ui-text-muted)]">{{ card.label }}</p>
            <p class="mt-1 text-2xl font-semibold">{{ card.value }}</p>
            <p class="mt-1 text-xs text-[var(--ui-text-dimmed)]">{{ card.description }}</p>
          </div>
          <UIcon :name="card.icon" class="size-5 text-[var(--ui-text-muted)]" />
        </div>
      </UCard>
    </div>

    <!-- Platform breakdown -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">Cost by Platform</h3>
      </template>

      <div v-if="status === 'pending'" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
      </div>

      <div v-else-if="!mtd?.byPlatform?.length" class="py-8 text-center text-[var(--ui-text-muted)]">
        <p>No cost data yet.</p>
        <p class="mt-1 text-sm">Click "Collect Now" or add manual entries to get started.</p>
      </div>

      <UTable
        v-else
        :data="mtd.byPlatform"
        :columns="[
          { accessorKey: 'platformName', header: 'Platform' },
          { accessorKey: 'mtd', header: 'MTD', cell: ({ row }: any) => `$${row.original.mtd.toFixed(2)}` },
          { accessorKey: 'eomEstimate', header: 'EOM Est.', cell: ({ row }: any) => `$${row.original.eomEstimate.toFixed(2)}` },
          { accessorKey: 'recordCount', header: 'Records' },
        ]"
      />
    </UCard>
  </div>
</template>
