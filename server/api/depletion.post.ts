/**
 * Update prepaid credit balance for a platform.
 * POST /api/depletion { platform: "railway", balance: 23.00 }
 *
 * Balances are stored in a JSON file since they're not in the DB schema.
 * Falls back to hardcoded defaults if file doesn't exist.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BALANCES_FILE = join(process.cwd(), '.data', 'credit-balances.json')

export interface CreditBalance {
  balance: number
  updatedAt: string
}

export async function getBalances(): Promise<Record<string, CreditBalance>> {
  try {
    const data = await readFile(BALANCES_FILE, 'utf-8')
    return JSON.parse(data)
  }
  catch (err: unknown) {
    // File not found is expected on first run — use defaults
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return {
        railway: { balance: 23.00, updatedAt: '2026-03-16' },
        anthropic: { balance: 29.68, updatedAt: '2026-03-16' },
      }
    }
    // File exists but is corrupt or unreadable — surface the error
    console.error('[depletion] Failed to read balances file:', err instanceof Error ? err.message : err)
    throw createError({ statusCode: 500, message: 'Failed to read credit balances file' })
  }
}

async function saveBalances(balances: Record<string, CreditBalance>) {
  await mkdir(join(process.cwd(), '.data'), { recursive: true })
  await writeFile(BALANCES_FILE, JSON.stringify(balances, null, 2))
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { platform, balance } = body as { platform: string; balance: number }

  if (!platform || typeof platform !== 'string' || balance === undefined) {
    throw createError({ statusCode: 400, message: 'platform and balance required' })
  }

  const allowedPlatforms = ['railway', 'anthropic', 'render', 'neon', 'turso', 'resend', 'gcp', 'uptimerobot', 'websupport', 'claude-max']
  if (!allowedPlatforms.includes(platform)) {
    throw createError({ statusCode: 400, message: `platform must be one of: ${allowedPlatforms.join(', ')}` })
  }

  const numBalance = Number(balance)
  if (!Number.isFinite(numBalance) || numBalance < 0) {
    throw createError({ statusCode: 400, message: 'balance must be a non-negative number' })
  }

  const balances = await getBalances()
  balances[platform] = {
    balance: numBalance,
    updatedAt: new Date().toISOString().split('T')[0]!,
  }
  await saveBalances(balances)

  return { updated: platform, balance: balances[platform] }
})
