<script setup lang="ts">
interface Budget {
  id: number
  name: string
  platformId: number | null
  platformName: string | null
  projectId: number | null
  projectName: string | null
  projectSlug: string | null
  monthlyLimit: string
  alertAt50: boolean
  alertAt75: boolean
  alertAt90: boolean
  alertAt100: boolean
  isActive: boolean
  createdAt: string
}

interface Project {
  id: number
  name: string
  slug: string
}

const { data, status, refresh } = await useFetch<{ budgets: Budget[] }>('/api/budgets')
const { data: projectsData } = await useFetch<{ projects: Project[] }>('/api/projects', { lazy: true })
const { loggedIn } = useUserSession()

const showForm = ref(false)
const saving = ref(false)
const budgetScope = ref<'global' | 'project'>('global')
const form = ref({
  name: '',
  monthlyLimit: 550,
  projectId: null as number | null,
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
      body: {
        ...form.value,
        projectId: budgetScope.value === 'project' ? form.value.projectId : null,
      },
    })
    showForm.value = false
    budgetScope.value = 'global'
    form.value = { name: '', monthlyLimit: 550, projectId: null, alertAt50: true, alertAt75: true, alertAt90: true, alertAt100: true }
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
          <label class="block text-sm font-medium mb-2">Budget Scope</label>
          <div class="flex gap-3">
            <UButton
              size="xs"
              :variant="budgetScope === 'global' ? 'solid' : 'outline'"
              :color="budgetScope === 'global' ? 'primary' : 'neutral'"
              label="Global"
              icon="i-lucide-globe"
              @click="budgetScope = 'global'; form.projectId = null"
            />
            <UButton
              size="xs"
              :variant="budgetScope === 'project' ? 'solid' : 'outline'"
              :color="budgetScope === 'project' ? 'primary' : 'neutral'"
              label="Per Project"
              icon="i-lucide-folder"
              @click="budgetScope = 'project'"
            />
          </div>
        </div>

        <div v-if="budgetScope === 'project'">
          <label class="block text-sm font-medium mb-1">Project</label>
          <select
            v-model.number="form.projectId"
            required
            class="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option :value="null" disabled>Select a project...</option>
            <option v-for="p in projectsData?.projects" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
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
    <SkeletonLoader v-if="status === 'pending'" variant="list" :rows="3" />

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
              <UBadge v-if="budget.projectName" variant="subtle" size="xs" color="success">
                {{ budget.projectName }}
              </UBadge>
              <UBadge v-else-if="budget.platformName" variant="subtle" size="xs" color="primary">
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

        <div class="mt-4">
          <p class="text-xs text-[var(--ui-text-dimmed)] mb-2">
            Alert thresholds — click to toggle. Alerts fire once per month when EOM estimate reaches the threshold.
            <span class="text-[var(--ui-text-muted)]">75%+ → email + WhatsApp</span>
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="threshold in [
                { field: 'alertAt50' as const, label: '50%', active: budget.alertAt50, severity: 'info', channel: 'log only' },
                { field: 'alertAt75' as const, label: '75%', active: budget.alertAt75, severity: 'warning', channel: 'email + WhatsApp' },
                { field: 'alertAt90' as const, label: '90%', active: budget.alertAt90, severity: 'warning', channel: 'email + WhatsApp' },
                { field: 'alertAt100' as const, label: '100%', active: budget.alertAt100, severity: 'critical', channel: 'email + WhatsApp' },
              ]"
              :key="threshold.field"
              size="xs"
              :variant="threshold.active ? 'solid' : 'outline'"
              :color="threshold.active ? (threshold.severity === 'critical' ? 'error' : threshold.severity === 'warning' ? 'warning' : 'primary') : 'neutral'"
              :icon="threshold.active ? 'i-lucide-bell-ring' : 'i-lucide-bell-off'"
              :label="threshold.label"
              :title="`${threshold.active ? 'ON' : 'OFF'} — Alert at $${(parseFloat(budget.monthlyLimit) * parseInt(threshold.label) / 100).toFixed(0)} (${threshold.channel}). Click to ${threshold.active ? 'disable' : 'enable'}.`"
              :disabled="!loggedIn"
              @click="loggedIn && toggleThreshold(budget, threshold.field)"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
