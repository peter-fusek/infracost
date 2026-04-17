/**
 * Per-platform visual-verification config.
 * Used by /verify page to link users to billing URLs and by local browser
 * automation scripts to extract cost totals.
 */

export interface PlatformVerificationConfig {
  platformSlug: string
  billingUrl: string
  extractPattern?: string // regex applied to page text to pull the total amount
  displayFormat: string
  currency: 'USD' | 'EUR'
  notes?: string
  cliCommand?: string // one-liner that dumps billing data, if available
}

export const VERIFICATION_CONFIGS: PlatformVerificationConfig[] = [
  {
    platformSlug: 'render',
    billingUrl: 'https://dashboard.render.com/billing',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$131.00',
    currency: 'USD',
    notes: 'Look for "Current Bill" section, not "Next Invoice"',
  },
  {
    platformSlug: 'railway',
    billingUrl: 'https://railway.com/account/billing',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$18.45',
    currency: 'USD',
    notes: 'MTD usage shown in "Current Usage" card',
    cliCommand: 'railway api --query \'query { me { usage { estimatedTotal } } }\'',
  },
  {
    platformSlug: 'anthropic',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$45.23',
    currency: 'USD',
    notes: 'API usage only — not Claude.ai subscriptions',
    cliCommand: 'curl -H "x-api-key: $ANTHROPIC_ADMIN_API_KEY" "https://api.anthropic.com/v1/organizations/cost_report?starting_at=$(date -u +%Y-%m-01)T00:00:00Z"',
  },
  {
    platformSlug: 'claude-max',
    billingUrl: 'https://claude.ai/settings/billing',
    displayFormat: '$100.00',
    currency: 'USD',
    notes: 'Claude Max subscription — fixed monthly, confirm plan + any overage',
  },
  {
    platformSlug: 'neon',
    billingUrl: 'https://console.neon.tech/app/billing',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$0.00',
    currency: 'USD',
  },
  {
    platformSlug: 'turso',
    billingUrl: 'https://app.turso.tech/settings/billing',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$5.99',
    currency: 'USD',
    notes: 'API also exposes invoice PDFs — see #88',
  },
  {
    platformSlug: 'resend',
    billingUrl: 'https://resend.com/settings/billing',
    extractPattern: '\\$([\\d,]+)',
    displayFormat: '$20',
    currency: 'USD',
  },
  {
    platformSlug: 'uptimerobot',
    billingUrl: 'https://uptimerobot.com/dashboard#myAccount',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$0.00',
    currency: 'USD',
    notes: 'Free plan — verify $0',
  },
  {
    platformSlug: 'gcp',
    billingUrl: 'https://console.cloud.google.com/billing',
    extractPattern: '([\\d,]+\\.\\d{2})',
    displayFormat: '$12.34',
    currency: 'USD',
    notes: 'Navigate to billing account first',
    cliCommand: 'gcloud billing accounts list --format=json',
  },
  {
    platformSlug: 'google-services',
    billingUrl: 'https://admin.google.com/ac/billing',
    displayFormat: '$62.50',
    currency: 'USD',
    notes: 'Workspace Business Standard (5 seats)',
  },
  {
    platformSlug: 'websupport',
    billingUrl: 'https://admin.websupport.sk/en/finance/invoices',
    extractPattern: '([\\d,]+\\.\\d{2})',
    displayFormat: '€6.90',
    currency: 'EUR',
    notes: 'Sum invoices for current month; EUR amounts',
  },
  {
    platformSlug: 'github',
    billingUrl: 'https://github.com/settings/billing/summary',
    extractPattern: '\\$([\\d,]+\\.\\d{2})',
    displayFormat: '$0.00',
    currency: 'USD',
    notes: 'GitHub Free — confirm $0',
    cliCommand: 'gh api /orgs/instarea-sk/settings/billing/actions',
  },
]

export function getVerificationConfig(slug: string): PlatformVerificationConfig | undefined {
  return VERIFICATION_CONFIGS.find(c => c.platformSlug === slug)
}
