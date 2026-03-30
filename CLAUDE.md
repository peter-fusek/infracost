# InfraCost — infracost.eu

## Build & Dev
- `pnpm build` — production build (Nitro + Nuxt)
- `pnpm dev` — dev server on port 3000
- `pnpm drizzle-kit generate --name <name>` — create migration
- `pnpm drizzle-kit push` — apply schema to DB (runs in Render build command)
- `pnpm nuxt typecheck` — type checking (0 errors as of Sprint 28)

## Architecture
- Nuxt 4 + @nuxt/ui v4 + Tailwind CSS v4 + Drizzle ORM + node-postgres
- DB: Railway PostgreSQL (migrated from Render 2026-03-25). Schema at server/db/schema.ts
- Collectors: server/collectors/*.ts — each returns CollectorResult { records, errors, accountIdentifier? }
- Collect task: server/tasks/collect.ts — daily cron at 06:00 UTC + manual trigger via POST /api/collect/trigger (2min rate limit, concurrent run guard)
- Auth: nuxt-auth-utils + Google OAuth. Middleware at server/middleware/auth.ts protects all POST/PATCH/DELETE
- Bug reporter: app/components/BugReportButton.vue + app/composables/useBugReport.ts → server/api/bugs.post.ts (needs GITHUB_TOKEN env var)
  - Screenshot: user paste (Ctrl+V) or file upload only — NEVER auto-capture DOM content
  - No DOM-scraping libraries (html2canvas etc.) — injection surface
- GitHub Discovery: server/services/github-discovery.ts — scans peter-fusek/* + instarea-sk/* repos, detects deployment indicators + tech stacks
  - POST /api/projects/discover (auth-gated) triggers scan, compares against project registry
  - Ignored repos: autoniq, osa, marketlocator, smartbill, servicehub, .github
- Drift Detection: server/services/drift-detector.ts — Render, Railway, GitHub project registry checks
  - Drift results persisted as alerts (alertType: drift_*) with 24h dedup + audit_log for history
  - GET /api/drift returns live drift check results
  - GET /api/projects/[slug]/changes returns change history timeline from audit_log
- Free Tier Expiry: server/utils/free-tier-expiry.ts — tracks known expiration dates for free services
  - GET /api/expiry returns expiry statuses with risk levels
- Analytics: server/services/analytics-ga4.ts + analytics-gsc.ts — GA4 traffic + GSC search performance per project
  - Config: server/utils/analytics-config.ts maps project slugs to GA4 Property IDs + GSC Site URLs
  - Auth: server/utils/google-auth.ts — GCP service account (GCP_SERVICE_ACCOUNT_JSON env var)
  - API: GET /api/analytics/traffic, /api/analytics/search, /api/analytics/summary
  - SEO scoring: 0-100 based on CTR, position, impressions, click volume, trend direction
  - LLMEO tips: structured data, content recommendations for AI crawler visibility
- Pages: 11 total (/, /breakdown, /trends, /optimizations, /countdown, /alerts, /analytics, /status, /platforms, /budgets, /manual)
  - /countdown = merged Depletion + Limits + Free Tier Expiry — urgency-sorted + Monthly Tasks (manual platform reminders)
  - /alerts = filterable alert history (severity, status, type, date range) with acknowledge/resolve actions
  - /status = UptimeRobot monitors + Projects grid (expandable with change timeline) + Drift alerts + GitHub Discovery (auth-gated)
  - Project cards: clickable expand with change history, yellow ring for "recently changed" (7 days)
  - /depletion, /limits redirect 301 → /countdown
- Manual cost reminders: GET /api/costs/manual-reminders — tracks last-recorded date per manual platform, overdue >35 days
- Weekly digest: server/tasks/weekly-digest.ts — Mondays 07:00 UTC, emails MTD spend, budget %, active alerts, manual reminders, cost variance alerts (>20% deviation)
- Loading: SkeletonLoader component (5 variants: cards, table, countdown, chart, list) replaces spinners on all pages
- Bulk alerts: PATCH /api/alerts/bulk — batch resolve/acknowledge up to 200 alerts, UI checkboxes + toolbar on /alerts
- Drift detection: 7-day dedup window, DRIFT_IGNORE_LIST for known-expected drifts (28 entries), dedup checks all statuses
- Anomaly detection: MIN_HISTORICAL_MONTHS = 2 guard, 7-day dedup, threshold tuning deferred (June 2026)

## Conventions
- All DB queries use Drizzle ORM. Raw SQL via db.execute<T>(sql`...`) for complex queries (DISTINCT ON, CTEs)
- Input validation: server/utils/validation.ts (parseId, parseAmount, parsePagination)
- Notifications: server/utils/notifications.ts (sendAlertEmail, sendWhatsApp) — shared by budget + plan limit + drift alerts
- Plan limits: server/utils/plan-limits.ts (PLAN_LIMITS, extractUsage, formatUsage, formatLimit)
- EUR conversion: server/utils/currency.ts (EUR_USD_RATE, toEur) — update monthly
- Manual platform config: server/utils/manual-platforms.ts (MANUAL_PLATFORM_CONFIG — single source of truth for expected amounts)
- Bug issue markdown: server/utils/bug-report-markdown.ts (buildBugIssueBody, BugContext type)
- Collection trigger: app/composables/useCollectionTrigger.ts — shared composable for all refresh buttons
- CSV export: app/composables/useCsvExport.ts — client-side CSV generation + download
- CSV import: POST /api/costs/import — bulk insert from CSV (max 200 rows, collectionMethod: csv_import)
- Subscription check: GET /api/costs/subscription-check?platform= — dedup check for monthly subscription records
- Shared formatters: app/utils/time.ts (timeAgo), app/utils/icons.ts (typeIcons) — auto-imported by Nuxt
- Fetch timeouts: AbortSignal.timeout(15_000) on all external calls, 30s for Railway GraphQL
- Retry: server/utils/retry.ts — withRetry() + fetchWithRetry() with exponential backoff for transient failures
- GitHub API: server/utils/github.ts — githubHeaders(token) shared by discovery, drift-detector, repo-stats
- Error handling: always surface errors in errors[] array, never empty catch blocks
- Collection dedup: delete old records before inserting new per platform+period
- Breakdown: sort groups (name/cost/variance), filter by project, search services, sortable column headers
- Platforms: expandable with Services + Collection Runs tabs (lazy-loaded)
- Trends: per-platform MoM % change in detail table
- Test suite: `pnpm test` — vitest, tests in tests/ directory (183 tests, 15 files)
- Expiry tracking: server/utils/free-tier-expiry.ts — free tier + domain/hosting/SSL renewal countdown (category field)
- Drift ignore list: 23 entries in drift-detector.ts — Render suspended/deleted + GitHub renamed repos

## Deploy
- Render Starter tier ($7/mo), auto-deploy on push to main
- Build: `pnpm install && pnpm drizzle-kit push && pnpm build` (drizzle-kit push runs against Railway PostgreSQL via DATABASE_URL)
- Domain: infracost.eu (Websupport DNS → Render)
- Env vars: all API keys in Render dashboard, never in code

## Gotchas
- drizzle-kit push needs DATABASE_URL — runs in Render build command against Railway PostgreSQL, not available locally without the env var
- Render free tier: no blueprint support for custom domains — must use dashboard
- defineCachedEventHandler for Nitro caching (used on /api/platforms/status, 5min TTL)
- collectionRuns insert AFTER key check to avoid orphaned "running" records
- Depletion balances stored in .data/credit-balances.json (not DB) — distinguish ENOENT from corruption
- Resend collector: paginated email counting capped at 10 pages to prevent API overdrawing
- Collection trigger: module-level rate limit (2min) and concurrent run guard — resets on deploy
- Breakdown: NULL-serviceId cost records shown as synthetic "Unallocated" service rows (not hidden)
- Seed data: projects merged (partners+homegrif → homegrif.com), Claude Max split into personal+instarea accounts
- Countdown page uses Record<string,string> lookup maps for risk→color/icon instead of if-chains
