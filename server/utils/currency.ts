/**
 * EUR/USD conversion utility.
 * Single source of truth for the exchange rate — update monthly.
 * Also available as runtimeConfig.public.eurUsdRate for client-side use.
 */

export const EUR_USD_RATE = 0.87

export function toEur(usd: number): number {
  return Math.round(usd * EUR_USD_RATE * 100) / 100
}
