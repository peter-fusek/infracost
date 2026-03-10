import { platforms, services, budgets } from './schema'

// Platform seed data — full service inventory
export const platformSeed = [
  { slug: 'render', name: 'Render', type: 'hosting', collectionMethod: 'hybrid' as const, billingCycle: 'monthly', apiConfigKey: 'renderApiKey' },
  { slug: 'railway', name: 'Railway', type: 'hosting', collectionMethod: 'api' as const, billingCycle: 'usage', apiConfigKey: 'railwayApiToken' },
  { slug: 'anthropic', name: 'Anthropic Claude API', type: 'ai', collectionMethod: 'api' as const, billingCycle: 'usage', apiConfigKey: 'anthropicAdminApiKey' },
  { slug: 'claude-pro', name: 'Claude Pro/Max', type: 'ai', collectionMethod: 'manual' as const, billingCycle: 'monthly' },
  { slug: 'openai', name: 'OpenAI/ChatGPT', type: 'ai', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'resend', name: 'Resend', type: 'email', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'twilio', name: 'Twilio', type: 'sms', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'turso', name: 'Turso', type: 'database', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'neon', name: 'Neon', type: 'database', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'gcp', name: 'Google Cloud', type: 'cloud', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'websupport', name: 'Websupport', type: 'domain', collectionMethod: 'manual' as const, billingCycle: 'annual' },
  { slug: 'github-actions', name: 'GitHub Actions', type: 'ci_cd', collectionMethod: 'api' as const, billingCycle: 'usage' },
] as const

// Service seed data — known services from our infrastructure
export const serviceSeed = [
  // Render — hosting services
  { platformSlug: 'render', name: 'Professional Plan', project: null, serviceType: 'subscription', monthlyCostEstimate: '19.00' },
  { platformSlug: 'render', name: 'homegrif-web', project: 'homegrif', serviceType: 'web', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'scrabsnap-web', project: 'scrabsnap', serviceType: 'web', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'oncoteam-web', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'partners-web', project: 'partners', serviceType: 'web', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'instarea-web', project: 'instarea', serviceType: 'web', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'homegrif-db', project: 'homegrif', serviceType: 'database', monthlyCostEstimate: '6.30' },
  { platformSlug: 'render', name: 'homegrif-db-test', project: 'homegrif', serviceType: 'database', monthlyCostEstimate: '10.50' },
  { platformSlug: 'render', name: 'oncoteam-db-prod', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: '10.50' },
  { platformSlug: 'render', name: 'oncoteam-db-test', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: '10.50' },
  { platformSlug: 'render', name: 'partners-db-prod', project: 'partners', serviceType: 'database', monthlyCostEstimate: '10.50' },
  { platformSlug: 'render', name: 'partners-db-test', project: 'partners', serviceType: 'database', monthlyCostEstimate: '10.50' },
  { platformSlug: 'render', name: 'scrabsnap-db', project: 'scrabsnap', serviceType: 'database', monthlyCostEstimate: '10.50' },
  { platformSlug: 'render', name: 'Pipeline Minutes', project: null, serviceType: 'ci_cd', monthlyCostEstimate: '0.00' },
  // Railway
  { platformSlug: 'railway', name: 'oncoteam-backend', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: null },
  // Anthropic
  { platformSlug: 'anthropic', name: 'API Usage', project: null, serviceType: 'api_usage', monthlyCostEstimate: null },
  // Neon
  { platformSlug: 'neon', name: 'homegrif-neon', project: 'homegrif', serviceType: 'database', monthlyCostEstimate: '0.00' },
  { platformSlug: 'neon', name: 'scrabsnap-neon', project: 'scrabsnap', serviceType: 'database', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'infracost-db', project: 'infracost', serviceType: 'database', monthlyCostEstimate: '6.30' },
  // GCP
  { platformSlug: 'gcp', name: 'contacts-refiner', project: 'contacts-refiner', serviceType: 'cloud_run', monthlyCostEstimate: null },
  // Resend
  { platformSlug: 'resend', name: 'Email Sending', project: 'homegrif', serviceType: 'api_usage', monthlyCostEstimate: null },
  // Turso
  { platformSlug: 'turso', name: 'oncofiles-db', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: null },
]

// Default global budget
export const budgetSeed = [
  { name: 'Total Infrastructure', platformId: null, monthlyLimit: '150.00' },
]
