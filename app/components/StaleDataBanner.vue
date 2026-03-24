<script setup lang="ts">
const props = defineProps<{
  lastCollectedAt: string | null
  thresholdHours?: number
}>()

const threshold = props.thresholdHours ?? 48

const isStale = computed(() => {
  if (!props.lastCollectedAt) return true
  const hoursOld = (Date.now() - new Date(props.lastCollectedAt).getTime()) / 3_600_000
  return hoursOld > threshold
})

const hoursOld = computed(() => {
  if (!props.lastCollectedAt) return null
  return Math.round((Date.now() - new Date(props.lastCollectedAt).getTime()) / 3_600_000)
})
</script>

<template>
  <div v-if="isStale" class="rounded-lg border border-[var(--ui-warning)] bg-[var(--ui-warning)]/5 px-4 py-2 flex items-center gap-2">
    <UIcon name="i-lucide-clock" class="size-4 text-[var(--ui-warning)] shrink-0" />
    <p class="text-sm text-[var(--ui-warning)]">
      <template v-if="hoursOld !== null">
        Data is {{ hoursOld }}h old — last collection was {{ timeAgo(lastCollectedAt!) }}.
      </template>
      <template v-else>
        No collection data available yet.
      </template>
      <span class="text-[var(--ui-text-muted)]">Costs may not reflect current usage.</span>
    </p>
  </div>
</template>
