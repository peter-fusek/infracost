/** Expected monthly amounts for manual platforms (single source of truth)
 * Updated 2026-04-05 from March EOM reconciliation (actual invoices)
 * Claude Max: €180 sub + ~€250 extra usage = €430 (~$494 at 0.87)
 * Google Services: invoice #5500832519 Mar 2026 — 5 seats Business Standard
 * Websupport: domain infracost.eu annual / 12
 */
export const MANUAL_PLATFORM_CONFIG: Record<string, { expectedAmount: number; costType: string; serviceName: string }> = {
  'claude-max': { expectedAmount: 467, costType: 'subscription', serviceName: 'Max Subscription (€180) + Extra Usage (~€250)' },
  'google-services': { expectedAmount: 62.50, costType: 'subscription', serviceName: 'Google Workspace Business Standard (5 seats)' },
  'websupport': { expectedAmount: 0.58, costType: 'subscription', serviceName: 'Domain (infracost.eu)' },
}
