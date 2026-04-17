<script setup lang="ts">
interface ReconResult {
  platformId: number
  platformSlug: string
  platformName: string
  year: number
  month: number
  costRecordsSum: number
  invoicesSum: number
  delta: number
  deltaPct: number | null
  status: 'match' | 'over' | 'under' | 'no_invoice' | 'no_records'
}

interface Duplicate {
  platformId: number
  platformSlug: string
  serviceId: number | null
  periodStart: string
  periodEnd: string
  amount: string
  collectionMethod: string
  count: number
}

interface MissingPeriod {
  platformId: number
  platformSlug: string
  platformName: string
  hasInvoice: boolean
  hasRecords: boolean
  costRecordsSum: number
  invoicesSum: number
}

interface ReconResponse {
  year: number
  month: number
  results: ReconResult[]
  duplicates: Duplicate[]
  missingPeriods: MissingPeriod[]
  grandCostRecordsUsd: number
  grandInvoicesUsd: number
  grandDeltaUsd: number
  grandCostRecordsEur: number
  grandInvoicesEur: number
  grandDeltaEur: number
  matchCount: number
  mismatchCount: number
  noInvoiceCount: number
  noRecordsCount: number
}

const now = new Date()
const year = ref(now.getUTCFullYear())
const month = ref(now.getUTCMonth() + 1)

const { data, refresh, pending } = await useFetch<ReconResponse>('/api/reconciliation', {
  query: { year, month },
})

const { loggedIn } = useUserSession()
const toast = useToast()
const running = ref(false)

async function runNow() {
  if (!loggedIn.value) {
    toast.add({ title: 'Login required', description: 'Sign in to run reconciliation.', color: 'warning' })
    return
  }
  running.value = true
  try {
    const res = await $fetch<{ saved: number; mismatches: number }>('/api/reconciliation/run', {
      method: 'POST',
      body: { year: year.value, month: month.value },
    })
    toast.add({
      title: 'Reconciliation complete',
      description: `Saved ${res.saved} runs, ${res.mismatches} new mismatches.`,
      color: res.mismatches > 0 ? 'warning' : 'success',
    })
    await refresh()
  }
  catch (err: unknown) {
    toast.add({
      title: 'Run failed',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  }
  finally {
    running.value = false
  }
}

const STATUS_COLOR: Record<ReconResult['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  match: 'success',
  over: 'error',
  under: 'warning',
  no_invoice: 'neutral',
  no_records: 'warning',
}

const STATUS_ICON: Record<ReconResult['status'], string> = {
  match: 'i-lucide-check-circle',
  over: 'i-lucide-alert-triangle',
  under: 'i-lucide-alert-circle',
  no_invoice: 'i-lucide-file-minus',
  no_records: 'i-lucide-database-zap',
}

const STATUS_LABEL: Record<ReconResult['status'], string> = {
  match: 'match',
  over: 'over',
  under: 'under',
  no_invoice: 'no invoice',
  no_records: 'no records',
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${fmt(n)}`
}

function monthLabel(): string {
  return new Date(year.value, month.value - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

useHead({ title: 'Reconciliation — InfraCost' })
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Reconciliation</h1>
        <p class="text-neutral-500 dark:text-neutral-400 mt-1">
          Compare infracost totals against real invoice amounts per platform. The source of truth.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UInput v-model.number="year" type="number" size="sm" class="w-24" min="2024" max="2030" />
        <UInput v-model.number="month" type="number" size="sm" class="w-16" min="1" max="12" />
        <UButton icon="i-lucide-refresh-cw" size="sm" variant="ghost" @click="refresh()">
          Reload
        </UButton>
        <UButton icon="i-lucide-play" size="sm" color="primary" :loading="running" :disabled="!loggedIn" @click="runNow">
          Run now
        </UButton>
      </div>
    </div>

    <!-- Grand reconciliation banner -->
    <UCard v-if="data" class="border-l-3"
      :class="Math.abs(data.grandDeltaUsd) < 1 ? 'border-l-emerald-500' : data.grandDeltaUsd > 0 ? 'border-l-amber-500' : 'border-l-red-500'">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <div class="text-xs uppercase text-neutral-500">{{ monthLabel() }}</div>
          <div class="text-2xl font-bold mt-1">{{ fmt(data.grandCostRecordsUsd) }}</div>
          <div class="text-xs text-neutral-400">infracost cost records</div>
        </div>
        <div>
          <div class="text-xs uppercase text-neutral-500">Invoiced</div>
          <div class="text-2xl font-bold mt-1">{{ fmt(data.grandInvoicesUsd) }}</div>
          <div class="text-xs text-neutral-400">from paid invoices</div>
        </div>
        <div>
          <div class="text-xs uppercase text-neutral-500">Delta</div>
          <div class="text-2xl font-bold mt-1"
            :class="Math.abs(data.grandDeltaUsd) < 1 ? 'text-emerald-600' : data.grandDeltaUsd > 0 ? 'text-amber-600' : 'text-red-600'">
            {{ signed(data.grandDeltaUsd) }}
          </div>
          <div class="text-xs text-neutral-400">
            {{ data.grandDeltaUsd > 0 ? 'over-reported' : data.grandDeltaUsd < 0 ? 'under-reported' : 'in sync' }}
          </div>
        </div>
        <div>
          <div class="text-xs uppercase text-neutral-500">Status</div>
          <div class="flex flex-wrap gap-1 mt-1">
            <UBadge v-if="data.matchCount" color="success" variant="soft">{{ data.matchCount }} match</UBadge>
            <UBadge v-if="data.mismatchCount" color="error" variant="soft">{{ data.mismatchCount }} mismatch</UBadge>
            <UBadge v-if="data.noInvoiceCount" color="neutral" variant="soft">{{ data.noInvoiceCount }} no invoice</UBadge>
            <UBadge v-if="data.noRecordsCount" color="warning" variant="soft">{{ data.noRecordsCount }} no records</UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Per-platform table -->
    <UCard>
      <template #header>
        <div class="font-semibold text-sm">Per-platform reconciliation</div>
      </template>
      <div v-if="pending" class="text-center py-6 text-neutral-500">Loading…</div>
      <div v-else-if="data" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-200 dark:border-neutral-800">
              <th class="text-left py-2 px-2 font-semibold">Platform</th>
              <th class="text-right py-2 px-2 font-semibold">Infracost</th>
              <th class="text-right py-2 px-2 font-semibold">Invoiced</th>
              <th class="text-right py-2 px-2 font-semibold">Delta</th>
              <th class="text-left py-2 px-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.results" :key="r.platformId"
              class="border-b border-neutral-100 dark:border-neutral-900">
              <td class="py-2 px-2">{{ r.platformName }}</td>
              <td class="py-2 px-2 text-right font-mono">{{ fmt(r.costRecordsSum) }}</td>
              <td class="py-2 px-2 text-right font-mono">{{ fmt(r.invoicesSum) }}</td>
              <td class="py-2 px-2 text-right font-mono"
                :class="Math.abs(r.delta) < 1 ? 'text-emerald-600' : r.delta > 0 ? 'text-amber-600' : 'text-red-600'">
                {{ r.delta === 0 ? '—' : signed(r.delta) }}
                <span v-if="r.deltaPct !== null" class="text-xs text-neutral-400 ml-1">
                  ({{ r.deltaPct >= 0 ? '+' : '' }}{{ r.deltaPct.toFixed(1) }}%)
                </span>
              </td>
              <td class="py-2 px-2">
                <UBadge :color="STATUS_COLOR[r.status]" variant="soft" size="xs">
                  <UIcon :name="STATUS_ICON[r.status]" class="w-3 h-3 mr-1" />
                  {{ STATUS_LABEL[r.status] }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Duplicates -->
    <UCard v-if="data && data.duplicates.length > 0" class="border-l-3 border-l-red-500">
      <template #header>
        <div class="font-semibold text-sm">
          <UIcon name="i-lucide-copy" class="inline w-4 h-4 mr-1 text-red-500" />
          {{ data.duplicates.length }} duplicate cost record group(s)
        </div>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase text-neutral-500">
              <th class="text-left py-2 px-2">Platform</th>
              <th class="text-left py-2 px-2">Service</th>
              <th class="text-left py-2 px-2">Period</th>
              <th class="text-right py-2 px-2">Amount</th>
              <th class="text-left py-2 px-2">Method</th>
              <th class="text-right py-2 px-2">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in data.duplicates" :key="i"
              class="border-b border-neutral-100 dark:border-neutral-900">
              <td class="py-2 px-2">{{ d.platformSlug }}</td>
              <td class="py-2 px-2">{{ d.serviceId ?? '—' }}</td>
              <td class="py-2 px-2 text-xs text-neutral-500">
                {{ new Date(d.periodStart).toISOString().slice(0, 10) }} →
                {{ new Date(d.periodEnd).toISOString().slice(0, 10) }}
              </td>
              <td class="py-2 px-2 text-right font-mono">${{ parseFloat(d.amount).toFixed(2) }}</td>
              <td class="py-2 px-2">{{ d.collectionMethod }}</td>
              <td class="py-2 px-2 text-right">
                <UBadge color="error" variant="soft" size="xs">{{ d.count }}×</UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Missing periods -->
    <UCard v-if="data && data.missingPeriods.length > 0" class="border-l-3 border-l-amber-500">
      <template #header>
        <div class="font-semibold text-sm">
          <UIcon name="i-lucide-alert-circle" class="inline w-4 h-4 mr-1 text-amber-500" />
          {{ data.missingPeriods.length }} platform(s) with records-invoice mismatch this month
        </div>
      </template>
      <ul class="text-sm space-y-2">
        <li v-for="m in data.missingPeriods" :key="m.platformId"
          class="flex items-center justify-between">
          <span>
            <span class="font-semibold">{{ m.platformName }}</span>
            <span class="text-neutral-500 ml-2 text-xs">
              {{ m.hasRecords ? `$${m.costRecordsSum.toFixed(2)} in records` : 'no records' }}
              ·
              {{ m.hasInvoice ? `$${m.invoicesSum.toFixed(2)} in invoices` : 'no invoice' }}
            </span>
          </span>
          <UBadge
            :color="!m.hasInvoice ? 'neutral' : 'warning'"
            variant="soft"
            size="xs"
          >
            {{ !m.hasInvoice ? 'enter invoice' : 'check collector' }}
          </UBadge>
        </li>
      </ul>
    </UCard>

    <UAlert v-if="!loggedIn"
      icon="i-lucide-lock"
      color="warning"
      variant="soft"
      title="Sign in to run reconciliation"
      description="Reading is open; running reconciliation and entering invoices requires auth."
    />
  </div>
</template>
