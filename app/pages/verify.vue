<script setup lang="ts">
interface VerifySummaryRow {
  platformId: number
  platformSlug: string
  platformName: string
  billingUrl: string | null
  displayFormat: string | null
  notes: string | null
  reportedMtdUsd: number
  reportedMtdEur: number
  lastVerifiedAt: string | null
  lastVerifiedUsd: number | null
  lastDelta: number | null
  lastDeltaPct: number | null
  lastMethod: string | null
  daysSinceVerified: number | null
  status: 'verified' | 'stale' | 'mismatch' | 'unverified'
}

interface SummaryResponse {
  platforms: VerifySummaryRow[]
  grandReportedUsd: number
  grandVerifiedUsd: number
  grandDelta: number
  grandReportedEur: number
  grandVerifiedEur: number
  grandDeltaEur: number
  eurUsdRate: number
  mismatchCount: number
  verifiedCount: number
  unverifiedCount: number
  staleCount: number
}

const { data, refresh, pending } = await useFetch<SummaryResponse>('/api/verify/summary')
const { loggedIn } = useUserSession()
const toast = useToast()

const STATUS_COLORS: Record<VerifySummaryRow['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  verified: 'success',
  stale: 'warning',
  mismatch: 'error',
  unverified: 'neutral',
}

const STATUS_ICONS: Record<VerifySummaryRow['status'], string> = {
  verified: 'i-lucide-check-circle',
  stale: 'i-lucide-clock',
  mismatch: 'i-lucide-alert-triangle',
  unverified: 'i-lucide-circle-dashed',
}

// Per-row form state
const forms = reactive<Record<number, { amount: number | undefined; notes: string; open: boolean; submitting: boolean }>>({})

function toggleForm(platformId: number) {
  if (!forms[platformId]) {
    forms[platformId] = { amount: undefined, notes: '', open: true, submitting: false }
  }
  else {
    forms[platformId].open = !forms[platformId].open
  }
}

async function submitVerification(row: VerifySummaryRow) {
  const form = forms[row.platformId]
  if (!form || form.amount === undefined) return
  if (!loggedIn.value) {
    toast.add({ title: 'Login required', description: 'Sign in to record a verification.', color: 'warning' })
    return
  }
  form.submitting = true
  try {
    const periodStart = new Date()
    periodStart.setUTCDate(1)
    periodStart.setUTCHours(0, 0, 0, 0)
    await $fetch('/api/verifications', {
      method: 'POST',
      body: {
        platformId: row.platformId,
        periodStart: periodStart.toISOString(),
        verifiedUsd: form.amount,
        method: 'manual',
        notes: form.notes ? { raw: form.notes, url: row.billingUrl ?? undefined } : undefined,
      },
    })
    toast.add({ title: 'Verification saved', description: `${row.platformName}: $${form.amount.toFixed(2)} recorded.`, color: 'success' })
    form.amount = undefined
    form.notes = ''
    form.open = false
    await refresh()
  }
  catch (err: unknown) {
    toast.add({
      title: 'Save failed',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  }
  finally {
    form.submitting = false
  }
}

function openBilling(url: string | null) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function formatDelta(row: VerifySummaryRow): string {
  if (row.lastDelta === null) return '—'
  const sign = row.lastDelta >= 0 ? '+' : ''
  const pct = row.lastDeltaPct !== null ? ` (${sign}${row.lastDeltaPct.toFixed(1)}%)` : ''
  return `${sign}$${row.lastDelta.toFixed(2)}${pct}`
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

useHead({ title: 'Verify — InfraCost' })
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Verify</h1>
      <p class="text-neutral-500 dark:text-neutral-400 mt-1">
        Cross-check infracost totals against what each platform actually shows on its billing page.
      </p>
    </div>

    <!-- Grand reconciliation banner -->
    <UCard v-if="data" class="border-l-3"
      :class="data.grandDelta === 0 ? 'border-l-neutral-400' : Math.abs(data.grandDelta) < 1 ? 'border-l-emerald-500' : 'border-l-amber-500'">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <div class="text-xs uppercase text-neutral-500">Infracost reports</div>
          <div class="text-2xl font-bold">{{ formatCurrency(data.grandReportedUsd) }}</div>
          <div class="text-xs text-neutral-400">€{{ data.grandReportedEur.toFixed(2) }}</div>
        </div>
        <div>
          <div class="text-xs uppercase text-neutral-500">Platforms verified</div>
          <div class="text-2xl font-bold">{{ formatCurrency(data.grandVerifiedUsd) }}</div>
          <div class="text-xs text-neutral-400">{{ data.verifiedCount }} / {{ data.platforms.length }} platforms</div>
        </div>
        <div>
          <div class="text-xs uppercase text-neutral-500">Delta</div>
          <div class="text-2xl font-bold"
            :class="Math.abs(data.grandDelta) < 1 ? 'text-emerald-600' : data.grandDelta > 0 ? 'text-amber-600' : 'text-red-600'">
            {{ data.grandDelta >= 0 ? '+' : '' }}{{ formatCurrency(data.grandDelta) }}
          </div>
          <div class="text-xs text-neutral-400">
            {{ data.grandDelta > 0 ? 'platforms show more' : data.grandDelta < 0 ? 'platforms show less' : 'in sync' }}
          </div>
        </div>
        <div>
          <div class="text-xs uppercase text-neutral-500">Alerts</div>
          <div class="flex gap-2 mt-1">
            <UBadge v-if="data.mismatchCount > 0" color="error" variant="soft">{{ data.mismatchCount }} mismatch</UBadge>
            <UBadge v-if="data.staleCount > 0" color="warning" variant="soft">{{ data.staleCount }} stale</UBadge>
            <UBadge v-if="data.unverifiedCount > 0" color="neutral" variant="soft">{{ data.unverifiedCount }} unverified</UBadge>
            <UBadge v-if="data.mismatchCount === 0 && data.staleCount === 0 && data.unverifiedCount === 0" color="success" variant="soft">all green</UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <!-- How it works -->
    <UCard>
      <template #header>
        <div class="font-semibold text-sm">How to verify</div>
      </template>
      <ol class="list-decimal list-inside space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <li>Click <b>Open billing</b> — opens platform dashboard in a new tab.</li>
        <li>Read the MTD amount shown. Copy the number.</li>
        <li>Click <b>Enter reading</b> → paste amount → save. Infracost logs the verification with today's date.</li>
        <li>Delta &gt; 2% or &gt; $1 auto-fires an email + WhatsApp alert. Records stale after 14 days.</li>
      </ol>
    </UCard>

    <!-- Platform table -->
    <UCard>
      <div v-if="pending" class="text-center py-8 text-neutral-500">Loading…</div>
      <div v-else-if="data" class="space-y-2">
        <div v-for="row in data.platforms" :key="row.platformId"
          class="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold">{{ row.platformName }}</span>
                <UBadge :color="STATUS_COLORS[row.status]" variant="soft" size="xs">
                  <UIcon :name="STATUS_ICONS[row.status]" class="w-3 h-3 mr-1" />
                  {{ row.status }}
                </UBadge>
              </div>
              <div class="text-xs text-neutral-500 mt-0.5">
                Reported MTD: <b>{{ formatCurrency(row.reportedMtdUsd) }}</b>
                <span v-if="row.lastVerifiedUsd !== null"> · Verified: <b>{{ formatCurrency(row.lastVerifiedUsd) }}</b></span>
                <span v-if="row.lastDelta !== null"> · Delta: <b :class="Math.abs(row.lastDelta) < 1 ? 'text-emerald-600' : 'text-amber-600'">{{ formatDelta(row) }}</b></span>
                <span v-if="row.lastVerifiedAt"> · Last check: {{ formatRelativeTime(row.lastVerifiedAt) }} via {{ row.lastMethod }}</span>
              </div>
              <div v-if="row.notes" class="text-xs text-neutral-400 mt-1 italic">{{ row.notes }}</div>
            </div>

            <div class="flex gap-2 shrink-0">
              <UButton
                v-if="row.billingUrl"
                icon="i-lucide-external-link"
                size="xs"
                color="primary"
                variant="soft"
                @click="openBilling(row.billingUrl)"
              >
                Open billing
              </UButton>
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                color="neutral"
                variant="soft"
                :disabled="!loggedIn"
                @click="toggleForm(row.platformId)"
              >
                Enter reading
              </UButton>
            </div>
          </div>

          <!-- Inline form -->
          <div v-if="forms[row.platformId]?.open" class="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
              <UFormField label="Amount the platform shows (USD)" required>
                <UInput
                  v-model="forms[row.platformId]!.amount"
                  type="number"
                  step="0.01"
                  min="0"
                  :placeholder="row.displayFormat ?? '0.00'"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Notes (optional)" class="md:col-span-2">
                <UInput
                  v-model="forms[row.platformId]!.notes"
                  placeholder="e.g. screenshot-2026-04-17.png"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div class="flex gap-2">
              <UButton
                color="primary"
                size="sm"
                :loading="forms[row.platformId]!.submitting"
                :disabled="forms[row.platformId]!.amount === undefined"
                @click="submitVerification(row)"
              >
                Save verification
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                @click="forms[row.platformId]!.open = false"
              >
                Cancel
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UAlert v-if="!loggedIn"
      icon="i-lucide-lock"
      color="warning"
      variant="soft"
      title="Sign in to record verifications"
      description="You can browse platform billing links without logging in, but submitting a verification requires authentication."
    />
  </div>
</template>
