<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'

interface Platform {
  id: number
  slug: string
  name: string
}

const { data: platformList } = await useFetch<Platform[]>('/api/platforms')

const platformOptions = computed(() =>
  (platformList.value || []).map(p => ({ label: p.name, value: p.slug })),
)

const costTypeOptions = [
  { label: 'Usage', value: 'usage' },
  { label: 'Subscription', value: 'subscription' },
  { label: 'One-time', value: 'one_time' },
  { label: 'Overage', value: 'overage' },
]

interface FormState {
  platformSlug: string
  amount: number | undefined
  costType: string
  date: string
  notes: string
}

const state = reactive<FormState>({
  platformSlug: '',
  amount: undefined,
  costType: 'usage',
  date: new Date().toISOString().split('T')[0],
  notes: '',
})

const { loggedIn } = useUserSession()
const toast = useToast()
const submitting = ref(false)

async function onSubmit(event: FormSubmitEvent<FormState>) {
  submitting.value = true
  try {
    await $fetch('/api/costs/manual', {
      method: 'POST',
      body: event.data,
    })
    toast.add({ title: 'Cost recorded', description: `$${event.data.amount} added for ${event.data.platformSlug}`, color: 'success' })
    state.amount = undefined
    state.notes = ''
  }
  catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.message || 'Failed to save', color: 'error' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6">
    <div>
      <h1 class="font-display text-2xl font-black tracking-tight">Manual Cost Entry</h1>
      <p class="text-sm text-[var(--ui-text-muted)]">Record costs for platforms without API collection</p>
    </div>

    <div v-if="!loggedIn" class="py-12 text-center">
      <UIcon name="i-lucide-lock" class="mx-auto size-8 text-[var(--ui-text-dimmed)]" />
      <p class="mt-3 font-medium text-[var(--ui-text-muted)]">Login required</p>
      <p class="mt-1 text-sm text-[var(--ui-text-dimmed)]">You need to be logged in to add manual cost entries.</p>
    </div>

    <UCard v-else>
      <UForm :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Platform" name="platformSlug" required>
          <USelect
            v-model="state.platformSlug"
            :items="platformOptions"
            placeholder="Select platform..."
            class="w-full"
          />
        </UFormField>

        <UFormField label="Amount (USD)" name="amount" required>
          <UInput
            v-model="state.amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
          />
        </UFormField>

        <UFormField label="Cost Type" name="costType">
          <USelect
            v-model="state.costType"
            :items="costTypeOptions"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Date" name="date">
          <UInput v-model="state.date" type="date" />
        </UFormField>

        <UFormField label="Notes" name="notes">
          <UTextarea v-model="state.notes" placeholder="Optional notes..." />
        </UFormField>

        <UButton type="submit" label="Save Cost Record" :loading="submitting" block />
      </UForm>
    </UCard>
  </div>
</template>
