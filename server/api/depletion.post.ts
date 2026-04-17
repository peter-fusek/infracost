/**
 * Update prepaid credit balance for a platform.
 * POST /api/depletion { platform: "railway", balance: 23.00 }
 *
 * Balances are stored in the credit_balances DB table.
 * Hardcoded defaults are used only when the table is empty (bootstrap case).
 */
import { eq } from 'drizzle-orm'
import { creditBalances } from '../db/schema'

export interface CreditBalance {
  balance: number
  updatedAt: string
}

const DEFAULT_BALANCES: Record<string, CreditBalance> = {
  railway: { balance: 23.00, updatedAt: '2026-03-16' },
  anthropic: { balance: 29.68, updatedAt: '2026-03-16' },
}

export async function getBalances(): Promise<Record<string, CreditBalance>> {
  const db = useDB()
  const rows = await db.select().from(creditBalances)

  // Bootstrap case: table empty → return defaults so depletion view has something.
  // As soon as POST writes any row, defaults stop being used for THAT platform,
  // but other platforms without a row still fall back (below).
  const result: Record<string, CreditBalance> = { ...DEFAULT_BALANCES }
  for (const row of rows) {
    result[row.platform] = {
      balance: parseFloat(row.balance),
      updatedAt: row.updatedAt.toISOString().split('T')[0]!,
    }
  }
  return result
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

  const db = useDB()
  const now = new Date()

  await db
    .insert(creditBalances)
    .values({ platform, balance: numBalance.toString(), updatedAt: now })
    .onConflictDoUpdate({
      target: creditBalances.platform,
      set: { balance: numBalance.toString(), updatedAt: now },
    })

  return {
    updated: platform,
    balance: {
      balance: numBalance,
      updatedAt: now.toISOString().split('T')[0]!,
    },
  }
})
