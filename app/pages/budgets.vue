<script setup lang="ts">
interface Budget {
  id: number
  name: string
  platformId: number | null
  platformName: string | null
  monthlyLimit: string
  alertAt50: boolean
  alertAt75: boolean
  alertAt90: boolean
  alertAt100: boolean
  isActive: boolean
  createdAt: string
}

const { data, status, refresh } = await useFetch<{ budgets: Budget[] }>('/api/budgets')
const { loggedIn } = useUserSession()

const showForm = ref(false)
const saving = ref(false)
const form = ref({
  name: '',
  monthlyLimit: 550,
  alertAt50: true,
  alertAt75: true,
  alertAt90: true,
  alertAt100: true,
})

async function createBudget() {
  saving.value = true
  try {
    await $fetch('/api/budgets', {
      method: 'POST',
      body: form.value,
    })
    showForm.value = false
    form.value = { name: '', monthlyLimit: 550, alertAt50: true, alertAt75: true, alertAt90: true, alertAt100: true }
    await refresh()
  }
  finally {
    saving.value = false
  }
}

async function toggleThreshold(budget: Budget, field: 'alertAt50' | 'alertAt75' | 'alertAt90' | 'alertAt100') {
  await $fetch(`/api/budgets/${budget.id}`, {
    method: 'PATCH',
    body: { [field]: !budget[field] },
  })
  await refresh()
}

async function deactivateBudget(budget: Budget) {
  await $fetch(`/api/budgets/${budget.id}`, {
    method: 'PATCH',
    body: { isActive: false },
  })
  await refresh()
}

function fmt(n: string | number) {
  return parseFloat(String(n)).toFixed(2)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-black tracking-tight">Budget Management</h1>
        <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
          Set monthly spending limits and configure alert thresholds
        </p>
      </div>
      <UButton
        v-if="loggedIn"
        icon="i-lucide-plus"
        label="New Budget"
        @click="showForm = !showForm"
      />
    </div>

    <!-- Create budget form -->
    <UCard v-if="showForm && loggedIn" class="metric-card-budget">
      <form @submit.prevent="createBudget" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="block text-sm font-medium mb-1">Budget Name</label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="e.g. Global Monthly Budget"
              class="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Monthly Limit (USD)</label>
            <input
              v-model.number="form.monthlyLimit"
              type="number"
              required
              min="1"
              step="0.01"
              class="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Alert Thresholds</label>
          <div class="flex flex-wrap gap-4">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.alertAt50" type="checkbox" class="rounded" />
              50%
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.alertAt75" type="checkbox" class="rounded" />
              75%
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.alertAt90" type="checkbox" class="rounded" />
              90%
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.alertAt100" type="checkbox" class="rounded" />
              100%
            </label>
          </div>
        </div>

        <div class="flex gap-2">
          <UButton type="submit" label="Create Budget" :loading="saving" />
          <UButton variant="ghost" label="Cancel" @click="showForm = false" />
        </div>
      </form>
    </UCard>

    <!-- Loading -->
    <div v-if="status === 'pending'" class="flex justify-center py-8" role="status" aria-label="Loading">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-emerald-500" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!data?.budgets?.length" class="py-12 text-center">
      <UIcon name="i-lucide-wallet" class="mx-auto size-8 text-[var(--ui-text-dimmed)]" />
      <p class="mt-3 font-medium text-[var(--ui-text-muted)]">No budgets configured</p>
      <p class="mt-1 text-sm text-[var(--ui-text-dimmed)]">Create a budget to start receiving spending alerts via email and WhatsApp.</p>
      <UButton v-if="loggedIn" class="mt-4" icon="i-lucide-plus" label="Create Your First Budget" @click="showForm = true" />
      <p v-else class="mt-3 text-sm text-[var(--ui-text-dimmed)]">Login to manage budgets.</p>
    </div>

    <!-- Budget list -->
    <div v-else class="space-y-4">
      <UCard v-for="budget in data.budgets" :key="budget.id" class="metric-card-budget">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="font-display font-bold text-lg">{{ budget.name }}</h2>
              <UBadge v-if="budget.platformName" variant="subtle" size="xs" color="primary">
                {{ budget.platformName }}
              </UBadge>
              <UBadge v-else variant="subtle" size="xs" color="neutral">
                Global
              </UBadge>
            </div>
            <p class="mt-1 text-2xl font-bold tabular-nums">${{ fmt(budget.monthlyLimit) }}</p>
            <p class="mt-0.5 text-xs text-[var(--ui-text-dimmed)]">per month</p>
          </div>
          <UButton
            v-if="loggedIn"
            icon="i-lucide-trash-2"
            variant="ghost"
            size="xs"
            color="error"
            @click="deactivateBudget(budget)"
          />
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            v-for="threshold in [
              { field: 'alertAt50' as const, label: '50%', active: budget.alertAt50 },
              { field: 'alertAt75' as const, label: '75%', active: budget.alertAt75 },
              { field: 'alertAt90' as const, label: '90%', active: budget.alertAt90 },
              { field: 'alertAt100' as const, label: '100%', active: budget.alertAt100 },
            ]"
            :key="threshold.field"
            size="xs"
            :variant="threshold.active ? 'solid' : 'outline'"
            :color="threshold.active ? 'primary' : 'neutral'"
            :label="threshold.label"
            :disabled="!loggedIn"
            @click="loggedIn && toggleThreshold(budget, threshold.field)"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>
