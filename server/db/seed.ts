import { platforms, services, budgets, optimizations, projects } from './schema'

// Platform seed data — full service inventory
// Updated 2026-03-24: added Google services, removed unused OpenAI/Twilio
export const platformSeed = [
  { slug: 'render', name: 'Render', type: 'hosting', collectionMethod: 'hybrid' as const, billingCycle: 'monthly', apiConfigKey: 'renderApiKey' },
  { slug: 'railway', name: 'Railway', type: 'hosting', collectionMethod: 'api' as const, billingCycle: 'usage', apiConfigKey: 'railwayApiToken' },
  { slug: 'anthropic', name: 'Anthropic Claude API', type: 'ai', collectionMethod: 'api' as const, billingCycle: 'usage', apiConfigKey: 'anthropicAdminApiKey' },
  { slug: 'claude-max', name: 'Claude Max', type: 'ai', collectionMethod: 'manual' as const, billingCycle: 'monthly' },
  { slug: 'resend', name: 'Resend', type: 'email', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'turso', name: 'Turso', type: 'database', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'neon', name: 'Neon', type: 'database', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'gcp', name: 'Google Cloud', type: 'cloud', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'google-services', name: 'Google Services', type: 'analytics', collectionMethod: 'manual' as const, billingCycle: 'monthly' },
  { slug: 'websupport', name: 'Websupport', type: 'domain', collectionMethod: 'manual' as const, billingCycle: 'annual' },
  { slug: 'github', name: 'GitHub', type: 'ci_cd', collectionMethod: 'api' as const, billingCycle: 'usage' },
  { slug: 'uptimerobot', name: 'UptimeRobot', type: 'monitoring', collectionMethod: 'api' as const, billingCycle: 'monthly', apiConfigKey: 'uptimeRobotApiKey' },
] as const

// Service seed data — known services from our infrastructure
// Updated 2026-03-24: merged partners+homegrif→homegrif.com, split Claude Max accounts, fixed GCP, added Websupport domains
export const serviceSeed = [
  // Render — Professional plan
  { platformSlug: 'render', name: 'Professional Plan', project: null, serviceType: 'subscription', monthlyCostEstimate: '19.00' },

  // Render — Web services (homegrif — single app serves .cz/.com/.sk via domain-locale middleware)
  { platformSlug: 'render', name: 'homegrif-prod', project: 'homegrif.com', serviceType: 'web', monthlyCostEstimate: '7.13' },
  { platformSlug: 'render', name: 'homegrif-test', project: 'homegrif.com', serviceType: 'web', monthlyCostEstimate: '0.00' }, // SUSPENDED — candidate for deletion
  { platformSlug: 'render', name: 'homegrif-pipeline', project: 'homegrif.com', serviceType: 'worker', monthlyCostEstimate: '7.00' },
  { platformSlug: 'render', name: 'scrabsnap', project: 'scrabsnap', serviceType: 'web', monthlyCostEstimate: '2.57' },
  { platformSlug: 'render', name: 'budgetco', project: 'budgetco', serviceType: 'web', monthlyCostEstimate: '2.14' },
  { platformSlug: 'render', name: 'contacts-refiner-dashboard', project: 'contacts-refiner', serviceType: 'web', monthlyCostEstimate: '2.23' },
  { platformSlug: 'render', name: 'instareaweb', project: 'instarea', serviceType: 'web', monthlyCostEstimate: '0.00' }, // DELETED — migrated to Railway (loyal-creativity)
  { platformSlug: 'render', name: 'oncoteam-dashboard', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '0.00' }, // SUSPENDED — migrated to Railway
  { platformSlug: 'render', name: 'oncoteam-dashboard-test', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '0.00' }, // SUSPENDED
  { platformSlug: 'render', name: 'oncoteam-landing', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '0.00' }, // SUSPENDED — migrated to Railway

  // Render — Databases (homegrif — single active DB, old partners DBs removed)
  { platformSlug: 'render', name: 'homegrif-db', project: 'homegrif.com', serviceType: 'database', monthlyCostEstimate: '6.42' }, // dpg-d6fgkrhdrdic739vgo7g-a
  { platformSlug: 'render', name: 'scrabsnap-db', project: 'scrabsnap', serviceType: 'database', monthlyCostEstimate: '10.70' },
  { platformSlug: 'render', name: 'budgetco-db', project: 'budgetco', serviceType: 'database', monthlyCostEstimate: '0.00' },
  { platformSlug: 'render', name: 'infracost', project: 'infracost', serviceType: 'web', monthlyCostEstimate: '7.00' }, // Starter plan, upgraded from free 2026-03-24
  { platformSlug: 'render', name: 'infracost-db', project: 'infracost', serviceType: 'database', monthlyCostEstimate: '6.42' },
  { platformSlug: 'render', name: 'oncoteam-db-prod', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: '0.00' }, // SUSPENDED — migrated to Railway
  { platformSlug: 'render', name: 'oncoteam-db-test', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: '0.00' }, // SUSPENDED

  // Render — Cron + Pipeline
  { platformSlug: 'render', name: 'homegrif-daily-report', project: 'homegrif.com', serviceType: 'cron', monthlyCostEstimate: '0.65' },
  { platformSlug: 'render', name: 'Pipeline Minutes', project: null, serviceType: 'ci_cd', monthlyCostEstimate: '0.00' },

  // Railway — 2 projects, 5 services (updated 2026-03-16 after oncoteam migration)
  { platformSlug: 'railway', name: 'oncofiles', project: 'oncofiles', serviceType: 'web', monthlyCostEstimate: '9.23' },
  { platformSlug: 'railway', name: 'oncoteam-backend', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '4.00' },
  { platformSlug: 'railway', name: 'oncoteam-dashboard', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '3.00' },
  { platformSlug: 'railway', name: 'oncoteam-landing', project: 'oncoteam', serviceType: 'web', monthlyCostEstimate: '1.00' },
  { platformSlug: 'railway', name: 'oncoteam-postgres', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: '2.00' },

  // Anthropic API — includes autonomous agent (~$2/day = ~$60/mo) + manual usage (~$65/mo)
  { platformSlug: 'anthropic', name: 'API Usage', project: null, serviceType: 'api_usage', monthlyCostEstimate: '65.00' },

  // Claude Max — one personal account (corrected 2026-03-24, was incorrectly showing two accounts)
  { platformSlug: 'claude-max', name: 'Max Subscription (personal)', project: 'personal', serviceType: 'subscription', monthlyCostEstimate: '196.00' },
  { platformSlug: 'claude-max', name: 'Extra Usage (personal)', project: 'personal', serviceType: 'usage', monthlyCostEstimate: '50.00' }, // varies $29-$162/mo depending on sprint intensity

  // Neon (free tier)
  { platformSlug: 'neon', name: 'homegrif-neon', project: 'homegrif.com', serviceType: 'database', monthlyCostEstimate: '0.00' },
  { platformSlug: 'neon', name: 'scrabsnap-neon', project: 'scrabsnap', serviceType: 'database', monthlyCostEstimate: '0.00' },

  // GCP — actual billing: €4.66 MTD Mar 2026, Autoniq PulseShape Backups (scraped 2026-03-24)
  { platformSlug: 'gcp', name: 'contacts-refiner', project: 'contacts-refiner', serviceType: 'cloud_run', monthlyCostEstimate: '0.00' },
  { platformSlug: 'gcp', name: 'PulseShape Backups', project: 'pulseshape', serviceType: 'storage', monthlyCostEstimate: '7.15' }, // €6.56 forecasted EOM

  // Resend
  { platformSlug: 'resend', name: 'Transactional Pro', project: 'homegrif.com', serviceType: 'subscription', monthlyCostEstimate: '20.00' }, // $20/mo, Visa 5717

  // Turso
  { platformSlug: 'turso', name: 'erika-files-mcp', project: 'oncoteam', serviceType: 'database', monthlyCostEstimate: '0.00' }, // 16.8M rows read, 26.87 MB storage

  // UptimeRobot
  { platformSlug: 'uptimerobot', name: 'Monitoring (10 monitors)', project: null, serviceType: 'monitoring', monthlyCostEstimate: '0.00' },

  // Websupport — 18 domains + 1 hosting + 1 email (scraped 2026-03-24)
  { platformSlug: 'websupport', name: 'Hosting Super (instarea)', project: 'instarea', serviceType: 'hosting', monthlyCostEstimate: '5.00' }, // ~€60/yr — decommission after 2026-04-30 (redirect to Railway)
  { platformSlug: 'websupport', name: 'infracost.eu', project: 'infracost', serviceType: 'domain', monthlyCostEstimate: '0.58' }, // ~€6.90/yr
  { platformSlug: 'websupport', name: 'budgetco.eu', project: 'budgetco', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'oncoteam.cloud', project: 'oncoteam', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'oncofiles.com', project: 'oncofiles', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'contactrefiner.com', project: 'contacts-refiner', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'homegrif.cz', project: 'homegrif.com', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'homegrif.com', project: 'homegrif.com', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  // shiftrotation.com removed — orphaned domain, no active project
  { platformSlug: 'websupport', name: 'repli.city', project: 'replica.city', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'replica.city', project: 'replica.city', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'goreplicity.com', project: 'replica.city', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'goreplicacity.com', project: 'replica.city', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  // seekwhy domains (getwhysurvey.com, getsurveylink.com) removed — orphaned, no active project
  { platformSlug: 'websupport', name: 'grandpacheck.com', project: 'grandpa_check', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'pulseshape.com', project: 'pulseshape', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'instarea.com', project: 'instarea', serviceType: 'domain', monthlyCostEstimate: '0.58' },
  { platformSlug: 'websupport', name: 'instarea.sk', project: 'instarea.sk', serviceType: 'domain', monthlyCostEstimate: '0.58' }, // moved from instarea to instarea.sk project

  // Google Services (free tier — $0, tracked for complete infra picture)
  { platformSlug: 'google-services', name: 'Google Analytics 4', project: 'infracost', serviceType: 'analytics', monthlyCostEstimate: '0.00' },
  { platformSlug: 'google-services', name: 'Google Tag Manager', project: 'infracost', serviceType: 'analytics', monthlyCostEstimate: '0.00' },
  { platformSlug: 'google-services', name: 'Google Search Console', project: 'infracost', serviceType: 'analytics', monthlyCostEstimate: '0.00' },
  { platformSlug: 'google-services', name: 'Google OAuth (GCP)', project: null, serviceType: 'auth', monthlyCostEstimate: '0.00' },

  // GitHub — repos + Actions (free tier for public, 2000 min/mo for private)
  { platformSlug: 'github', name: 'peter-fusek (personal)', project: null, serviceType: 'repository', monthlyCostEstimate: '0.00' },
  { platformSlug: 'github', name: 'instarea-sk (org)', project: null, serviceType: 'repository', monthlyCostEstimate: '0.00' },
  { platformSlug: 'github', name: 'Actions: homegrif_com', project: 'homegrif.com', serviceType: 'ci_cd', monthlyCostEstimate: '0.00' }, // 390 runs, free tier
  { platformSlug: 'github', name: 'Actions: grandpa_check', project: 'grandpa_check', serviceType: 'ci_cd', monthlyCostEstimate: '0.00' }, // 363 runs, free tier
  // robota removed — project no longer exists
]

// Default global budget — updated 2026-03-24 to reflect actual ~$800/mo with Claude dual accounts
export const budgetSeed = [
  { name: 'Total Infrastructure', platformId: null, monthlyLimit: '850.00' },
]

// Project registry — all personal projects with tech stack and URLs
export const projectSeed = [
  { slug: 'infracost', name: 'InfraCost', description: 'Infrastructure cost tracking dashboard', repoUrl: 'https://github.com/peter-fusek/infracost', productionUrl: 'https://infracost.eu', techStack: ['nuxt', 'typescript', 'tailwind', 'drizzle', 'postgres', 'render'], status: 'active' as const },
  { slug: 'homegrif.com', name: 'HomeGrif.com', description: 'Real estate partner platform (CZ + SK)', repoUrl: 'https://github.com/instarea-sk/homegrif_com', productionUrl: 'https://homegrif.com', techStack: ['nuxt', 'typescript', 'tailwind', 'postgres', 'render'], status: 'active' as const },
  { slug: 'oncoteam', name: 'Oncoteam', description: 'Oncology treatment management dashboard', repoUrl: 'https://github.com/peter-fusek/oncoteam', productionUrl: 'https://dashboard.oncoteam.cloud', techStack: ['nuxt', 'typescript', 'fastapi', 'python', 'postgres', 'railway'], status: 'active' as const },
  { slug: 'oncofiles', name: 'Oncofiles', description: 'Medical document management with AI', repoUrl: 'https://github.com/peter-fusek/oncofiles', productionUrl: 'https://oncofiles.com', techStack: ['nuxt', 'typescript', 'turso', 'railway'], status: 'active' as const },
  { slug: 'scrabsnap', name: 'ScrabSnap', description: 'Scrabble board scanner and scorer', repoUrl: 'https://github.com/peter-fusek/scrabsnap', productionUrl: 'https://scrabsnap.com', techStack: ['nuxt', 'typescript', 'neon', 'render'], status: 'active' as const },
  { slug: 'budgetco', name: 'BudgetCo', description: 'Family budget management with bank sync', repoUrl: 'https://github.com/peter-fusek/budgetco', productionUrl: 'https://budgetco.eu', techStack: ['nuxt', 'fastapi', 'python', 'postgres', 'render', 'gcp'], status: 'active' as const },
  { slug: 'contacts-refiner', name: 'Contacts Refiner', description: 'Google Contacts deduplication and enrichment', repoUrl: 'https://github.com/peter-fusek/google-contacts-refiner', productionUrl: 'https://contactrefiner.com', techStack: ['nuxt', 'typescript', 'gcp', 'render'], status: 'active' as const },
  { slug: 'pulseshape', name: 'PulseShape', description: 'Health data visualization', repoUrl: 'https://github.com/instarea-sk/pulseshape', productionUrl: 'https://pulseshape.com', techStack: ['vue', 'python', 'gcp'], status: 'active' as const },
  { slug: 'grandpa_check', name: 'Grandpa Check', description: 'Elderly wellness check-in system', repoUrl: 'https://github.com/instarea-sk/grandpa_check', productionUrl: null, techStack: ['python', 'github-actions'], status: 'active' as const },
  { slug: 'replica.city', name: 'Replica City', description: '3D city replica visualization', repoUrl: 'https://github.com/instarea-sk/replica-city', productionUrl: null, techStack: ['javascript', 'three.js'], status: 'paused' as const },
  { slug: 'instarea.com', name: 'Instarea.com', description: 'Company website (.com) — redirects to instarea.sk since 2026-03-31, historical analytics only', repoUrl: 'https://github.com/instarea-sk/instareaweb', productionUrl: 'https://instarea.com', techStack: ['nuxt', 'websupport'], status: 'paused' as const },
  { slug: 'instarea.sk', name: 'Instarea SK', description: 'Company website (migrated from instarea.com 2026-03-31)', repoUrl: 'https://github.com/instarea-sk/instareaweb', productionUrl: 'https://instarea.sk', techStack: ['nuxt', 'railway', 'turso'], status: 'active' as const },
  { slug: 'personal', name: 'Personal (Claude)', description: 'Personal Claude Max account', repoUrl: null, productionUrl: null, techStack: ['claude'], status: 'active' as const },
]

// Optimization opportunities — regenerated 2026-03-24 after infrastructure audit
// Reflects: merged projects, dual Claude Max accounts, corrected GCP costs, consolidated test envs
export const optimizationSeed = [
  {
    title: 'Monitor Claude Max extra usage (~$29/mo)',
    description: `**Current:** One Claude Max personal account:
- Max $196/mo + ~$29 extra usage = ~$225/mo

**ACTION:** Monitor extra usage spending. If consistently under $10/mo, consider lowering the cap.`,
    platformSlug: 'claude-max',
    estimatedSavings: '15.00',
    effort: 'trivial' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Reduce Claude extra usage spending (~$29/mo)',
    description: `**Current:** Extra usage on personal account ~$29/mo (€26.43/€30 cap).

**ACTION:** Monitor for 2 months. If consistently under cap, reduce spending limit.`,
    platformSlug: 'claude-max',
    estimatedSavings: '15.00',
    effort: 'trivial' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Resize 4 over-provisioned Render DBs (homegrif.com project)',
    description: `**Current:** homegrif.com project has 4 Render databases:
- homegrif-db-test ($10.70) — 15GB disk, <100MB actual data
- partners-db-prod ($10.70) — 15GB disk
- partners-db-test ($10.70) — 15GB disk
- scrabsnap-db ($10.70) — 15GB disk
**Target:** Recreate with 1GB disk (~$6.42/mo each).

**PROS:**
- Saves ~$17.12/mo ($205/yr)
- No performance impact — actual data well under 1GB per DB

**CONS:**
- Cannot resize in-place — must create new DB, migrate, update connection strings
- ~15min downtime per DB migration
- Risk of missed connection string updates

**ACTION:** Start with test DBs (lowest risk), then prod after verifying approach.`,
    platformSlug: 'render',
    estimatedSavings: '17.12',
    effort: 'medium' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Lock partners-cz-prod on Starter tier',
    description: `**Current:** partners-cz-prod (now under homegrif.com) using Standard plan part-month — ~$13.18/mo.
**Target:** Lock on Starter tier — ~$7.13/mo.

**PROS:**
- Saves ~$6/mo ($72/yr)
- Starter tier sufficient for current traffic levels

**CONS:**
- Standard provides more CPU/RAM for traffic spikes
- Need to verify utilization before downgrading

**ACTION:** Check Render metrics. If P95 memory <400MB, lock on Starter.`,
    platformSlug: 'render',
    estimatedSavings: '6.00',
    effort: 'trivial' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Consolidate Websupport domains (18 domains, ~$124/yr)',
    description: `**Current:** 18 domains across Websupport at ~€6.90/yr each = ~€124/yr (~$11/mo).
Some may be unused or redundant:
- replica.city has 4 domains (repli.city, replica.city, goreplicity.com, goreplicacity.com)
- seekwhy has 2 domains (getwhysurvey.com, getsurveylink.com)
- shiftrotation.com — project status unclear

**PROS:**
- Dropping 4-6 unused domains saves ~€28-41/yr
- Reduces renewal tracking overhead

**CONS:**
- Domain squatting risk if dropped and re-registered by others
- Some may be needed for future projects

**ACTION:** Review each domain's DNS records and traffic. Drop domains with no A/CNAME records and no visitors.`,
    platformSlug: 'websupport',
    estimatedSavings: '3.00',
    effort: 'trivial' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Automate manual platform collection (5 platforms)',
    description: `**Current:** 5 platforms still show "never" collected or rely on manual entries:
- Claude Max: manual (both accounts)
- GCP: placeholder collector, actual cost from PulseShape Backups
- Websupport: manual (18 domains)
- GitHub: no collector
- Google Services: manual ($0)

**PROS:**
- Eliminates monthly manual update burden
- More accurate real-time cost tracking
- Catches unexpected cost spikes automatically

**CONS:**
- Development effort for each collector
- Some platforms have no billing API (Claude Max, Websupport)
- GCP requires BigQuery billing export setup

**ACTION:** Priority order: GCP (BigQuery export), GitHub (API exists), then browser-scrape solutions for Claude Max.`,
    platformSlug: 'render',
    estimatedSavings: '0.00',
    effort: 'large' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Migrate infracost DB from Render to Railway',
    description: `**Current:** infracost on Render free web + Basic-256mb DB ($6.42/mo).
**Target:** Move DB to Railway Hobby plan (already paid, $5/mo includes DB).

**PROS:**
- Saves ~$1.42/mo net
- Reduces Render bill complexity

**CONS:**
- Migration effort + downtime
- Railway has shared resource limits across all services

**VERDICT:** Defer until Railway capacity is confirmed sufficient.`,
    platformSlug: 'render',
    estimatedSavings: '1.42',
    effort: 'medium' as const,
    suggestedBy: 'ai' as const,
  },
  {
    title: 'Delete suspended Render databases by April 24',
    description: `**Deadline:** April 24, 2026 (30-day review period ends)

**Databases to delete:**
- infracost-db (suspended — migrated to Railway 2026-03-25)
- oncoteam-db-prod, oncoteam-db-test (suspended — migrated to Railway)
- homegrif-db, homegrif-db-test (suspended)
- partners-db-prod, partners-db-test (suspended)
- scrabsnap-db, budgetco-db (suspended)

**ACTION:** Delete all suspended DBs via Render dashboard. They are already migrated or unused. No cost savings (already $0) but cleans up inventory and drift alerts.`,
    platformSlug: 'render',
    estimatedSavings: '0.00',
    effort: 'trivial' as const,
    suggestedBy: 'ai' as const,
  },
]
