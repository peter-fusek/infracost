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
  date: new Date().toISOString().split('T')[0] ?? '',
  notes: '',
})

const { loggedIn } = useUserSession()
const toast = useToast()
const submitting = ref(false)

// Expected vs Actual comparison
interface Reminder {
  slug: string
  name: string
  lastRecordedDate: string | null
  daysSinceLastRecord: number | null
  currentMonthRecorded: boolean
  currentMonthAmount: number | null
  expectedAmount: number | null
  costType: string
  serviceName: string
}
const { data: remindersData, refresh: refreshReminders } = await useFetch<{ reminders: Reminder[]; month: string }>('/api/costs/manual-reminders', { lazy: true })

// CSV Import
interface CsvRow {
  platformSlug: string
  amount: number
  costType: string
  date: string
  notes: string
}

const csvRows = ref<CsvRow[]>([])
const csvErrors = ref<string[]>([])
const importing = ref(false)
const showCsvPreview = ref(false)

// Split a CSV line respecting quoted fields (RFC 4180)
function splitCsvLine(line: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      }
      else if (ch === '"') {
        inQuotes = false
      }
      else {
        current += ch
      }
    }
    else if (ch === '"') {
      inQuotes = true
    }
    else if (ch === ',') {
      cols.push(current.trim())
      current = ''
    }
    else {
      current += ch
    }
  }
  cols.push(current.trim())
  return cols
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]!).map(h => h.toLowerCase())
  const slugIdx = headers.findIndex(h => h === 'platform' || h === 'platformslug')
  const amountIdx = headers.findIndex(h => h === 'amount')
  const typeIdx = headers.findIndex(h => h === 'costtype' || h === 'type' || h === 'cost_type')
  const dateIdx = headers.findIndex(h => h === 'date')
  const notesIdx = headers.findIndex(h => h === 'notes')

  if (slugIdx === -1 || amountIdx === -1) return []

  return lines.slice(1).filter(l => l.trim()).map((line) => {
    const cols = splitCsvLine(line)
    return {
      platformSlug: cols[slugIdx] || '',
      amount: Number(cols[amountIdx]) || 0,
      costType: cols[typeIdx] || 'usage',
      date: cols[dateIdx] || new Date().toISOString().split('T')[0] || '',
      notes: cols[notesIdx] || '',
    }
  })
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const rows = parseCsv(reader.result as string)
    if (rows.length === 0) {
      toast.add({ title: 'Invalid CSV', description: 'CSV must have headers: platform, amount (and optionally: type, date, notes)', color: 'error' })
      return
    }
    csvRows.value = rows
    csvErrors.value = []
    showCsvPreview.value = true
  }
  reader.readAsText(file)
}

async function importCsv() {
  importing.value = true
  try {
    const result = await $fetch<{ inserted: number; errors: string[] }>('/api/costs/import', {
      method: 'POST',
      body: { rows: csvRows.value },
    })
    csvErrors.value = result.errors
    if (result.inserted > 0) {
      toast.add({ title: 'Import complete', description: `${result.inserted} record(s) imported${result.errors.length ? `, ${result.errors.length} error(s)` : ''}`, color: 'success' })
    }
    if (result.inserted > 0 && result.errors.length === 0) {
      showCsvPreview.value = false
      csvRows.value = []
    }
  }
  catch (err: any) {
    toast.add({ title: 'Import failed', description: err.data?.message || 'Failed to import', color: 'error' })
  }
  finally {
    importing.value = false
  }
}

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
    await refreshReminders()
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

    <!-- Expected vs Actual Comparison -->
    <UCard v-if="remindersData?.reminders?.length">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-scale" class="size-5" />
            <span class="font-display font-bold">Expected vs Actual</span>
          </div>
          <UBadge variant="subtle" size="xs" color="neutral">{{ remindersData.month }}</UBadge>
        </div>
      </template>

      <div class="space-y-3">
        <div
          v-for="r in remindersData.reminders"
          :key="r.slug"
          class="flex items-center justify-between gap-4 rounded-lg border border-[var(--ui-border)] px-4 py-3"
          :class="{
            'border-l-3 border-l-emerald-500': r.currentMonthRecorded && r.expectedAmount && r.currentMonthAmount !== null && Math.abs(r.currentMonthAmount - r.expectedAmount) < r.expectedAmount * 0.1,
            'border-l-3 border-l-amber-500': r.currentMonthRecorded && r.expectedAmount && r.currentMonthAmount !== null && Math.abs(r.currentMonthAmount - r.expectedAmount) >= r.expectedAmount * 0.1,
            'border-l-3 border-l-red-500': !r.currentMonthRecorded,
          }"
        >
          <div class="min-w-0">
            <p class="font-medium">{{ r.name }}</p>
            <p class="text-xs text-[var(--ui-text-dimmed)]">{{ r.serviceName }}</p>
            <p v-if="r.lastRecordedDate" class="text-xs text-[var(--ui-text-dimmed)]">
              Last recorded {{ timeAgo(r.lastRecordedDate) }}
            </p>
          </div>
          <div class="flex items-center gap-4 text-right shrink-0">
            <div>
              <p class="text-xs text-[var(--ui-text-muted)]">Expected</p>
              <p class="font-mono tabular-nums">${{ r.expectedAmount?.toFixed(2) ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-[var(--ui-text-muted)]">Actual</p>
              <p v-if="r.currentMonthRecorded" class="font-mono tabular-nums font-medium">${{ r.currentMonthAmount?.toFixed(2) }}</p>
              <p v-else class="text-sm text-[var(--ui-text-dimmed)]">Not recorded</p>
            </div>
            <div v-if="r.currentMonthRecorded && r.expectedAmount && r.currentMonthAmount !== null" class="min-w-12">
              <p class="text-xs text-[var(--ui-text-muted)]">Diff</p>
              <p
                class="font-mono tabular-nums text-sm font-medium"
                :class="r.currentMonthAmount - r.expectedAmount > 0 ? 'text-[var(--ui-error)]' : r.currentMonthAmount - r.expectedAmount < 0 ? 'text-[var(--ui-success)]' : 'text-[var(--ui-text-muted)]'"
              >
                {{ r.currentMonthAmount - r.expectedAmount > 0 ? '+' : '' }}${{ (r.currentMonthAmount - r.expectedAmount).toFixed(2) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- CSV Import -->
    <UCard v-if="loggedIn">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-spreadsheet" class="size-5" />
          <span class="font-display font-bold">CSV Import</span>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-[var(--ui-text-muted)]">
          Upload a CSV with headers: <code class="text-xs">platform, amount, type, date, notes</code>
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          class="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-[var(--ui-bg-elevated)] file:px-4 file:py-2 file:text-sm file:font-medium"
          @change="onFileChange"
        />

        <!-- Preview -->
        <div v-if="showCsvPreview && csvRows.length" class="space-y-3">
          <p class="text-sm font-medium">Preview ({{ csvRows.length }} rows)</p>

          <div class="max-h-64 overflow-auto rounded border border-[var(--ui-border)]">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-[var(--ui-bg-elevated)]">
                <tr>
                  <th class="px-2 py-1 text-left">#</th>
                  <th class="px-2 py-1 text-left">Platform</th>
                  <th class="px-2 py-1 text-right">Amount</th>
                  <th class="px-2 py-1 text-left">Type</th>
                  <th class="px-2 py-1 text-left">Date</th>
                  <th class="px-2 py-1 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in csvRows" :key="i" class="border-t border-[var(--ui-border)]">
                  <td class="px-2 py-1 text-[var(--ui-text-dimmed)]">{{ i + 1 }}</td>
                  <td class="px-2 py-1">{{ row.platformSlug }}</td>
                  <td class="px-2 py-1 text-right font-mono">${{ row.amount.toFixed(2) }}</td>
                  <td class="px-2 py-1">{{ row.costType }}</td>
                  <td class="px-2 py-1">{{ row.date }}</td>
                  <td class="px-2 py-1 truncate max-w-32">{{ row.notes }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Errors -->
          <div v-if="csvErrors.length" class="rounded border border-[var(--ui-error)] bg-[var(--ui-bg-elevated)] p-3 space-y-1">
            <p class="text-sm font-medium text-[var(--ui-error)]">Import errors:</p>
            <p v-for="err in csvErrors" :key="err" class="text-xs text-[var(--ui-text-muted)]">{{ err }}</p>
          </div>

          <div class="flex gap-2">
            <UButton label="Import" icon="i-lucide-upload" :loading="importing" @click="importCsv" />
            <UButton label="Cancel" variant="ghost" @click="showCsvPreview = false; csvRows = []" />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
