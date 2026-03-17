export const VALID_COST_TYPES = ['subscription', 'usage', 'overage', 'one_time'] as const

export function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid ID' })
  }
  return id
}

export function parseAmount(raw: unknown): number {
  const amt = Number(raw)
  if (!Number.isFinite(amt) || amt < 0) {
    throw createError({ statusCode: 400, message: 'amount must be a non-negative number' })
  }
  return amt
}

export function validateCostType(costType: string): void {
  if (!VALID_COST_TYPES.includes(costType as typeof VALID_COST_TYPES[number])) {
    throw createError({ statusCode: 400, message: `costType must be one of: ${VALID_COST_TYPES.join(', ')}` })
  }
}
