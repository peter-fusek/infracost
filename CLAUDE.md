# InfraCost — Infrastructure Cost Optimizer

## Build & Dev
- `pnpm build` — production build (Nitro + Nuxt)
- `pnpm dev` — dev server on port 3000
- `pnpm drizzle-kit generate --name <name>` — create migration
- `pnpm drizzle-kit push` — apply schema to DB (runs in Render build command)
- `pnpm nuxt typecheck` — type checking (has pre-existing errors in railway.ts, render.ts, drift-detector.ts)

## Architecture
- Nuxt 4 + @nuxt/ui v4 + Tailwind CSS v4 + Drizzle ORM + node-postgres
- DB: Render PostgreSQL. Schema at server/db/schema.ts
- Collectors: server/collectors/*.ts — each returns CollectorResult { records, errors, accountIdentifier? }
- Collect task: server/tasks/collect.ts — daily cron at 06:00 UTC + manual trigger via POST /api/collect/trigger (2min rate limit, concurrent run guard)
- Auth: nuxt-auth-utils + Google OAuth. Middleware at server/middleware/auth.ts protects POST/PATCH/DELETE (except /api/bugs)
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
- Pages: 9 total (/, /breakdown, /trends, /optimizations, /countdown, /status, /platforms, /budgets, /manual)
  - /countdown = merged Depletion + Limits + Free Tier Expiry — urgency-sorted
  - /status = UptimeRobot monitors + Projects grid (expandable with change timeline) + Drift alerts + GitHub Discovery (auth-gated)
  - Project cards: clickable expand with change history, yellow ring for "recently changed" (7 days)
  - /depletion, /limits redirect 301 → /countdown

## Conventions
- All DB queries use Drizzle ORM. Raw SQL via db.execute<T>(sql`...`) for complex queries (DISTINCT ON, CTEs)
- Input validation: server/utils/validation.ts (parseId, parseAmount, parsePagination)
- Notifications: server/utils/notifications.ts (sendAlertEmail, sendWhatsApp) — shared by budget + plan limit + drift alerts
- Plan limits: server/utils/plan-limits.ts (PLAN_LIMITS, extractUsage, formatUsage, formatLimit)
- EUR conversion: server/utils/currency.ts (EUR_USD_RATE, toEur) — update monthly
- Bug issue markdown: server/utils/bug-report-markdown.ts (buildBugIssueBody, BugContext type)
- Collection trigger: app/composables/useCollectionTrigger.ts — shared composable for all refresh buttons
- CSV export: app/composables/useCsvExport.ts — client-side CSV generation + download
- Shared formatters: app/utils/time.ts (timeAgo), app/utils/icons.ts (typeIcons) — auto-imported by Nuxt
- Fetch timeouts: AbortSignal.timeout(15_000) on all external calls, 30s for Railway GraphQL
- Retry: server/utils/retry.ts — withRetry() + fetchWithRetry() with exponential backoff for transient failures
- Error handling: always surface errors in errors[] array, never empty catch blocks
- Collection dedup: delete old records before inserting new per platform+period
- Breakdown: sort groups (name/cost/variance), filter by project, search services, sortable column headers
- Platforms: expandable with Services + Collection Runs tabs (lazy-loaded)
- Trends: per-platform MoM % change in detail table
- Test suite: `pnpm test` — vitest, tests in tests/ directory (57 tests)

## Deploy
- Render Starter tier ($7/mo), auto-deploy on push to main
- Build: `pnpm install && pnpm drizzle-kit push && pnpm build`
- Domain: infracost.eu (Websupport DNS → Render)
- Env vars: all API keys in Render dashboard, never in code

## Gotchas
- drizzle-kit push needs DATABASE_URL — only works on Render (in build command), not locally without the env var
- Render free tier: no blueprint support for custom domains — must use dashboard
- defineCachedEventHandler for Nitro caching (used on /api/platforms/status, 5min TTL)
- collectionRuns insert AFTER key check to avoid orphaned "running" records
- Depletion balances stored in .data/credit-balances.json (not DB) — distinguish ENOENT from corruption
- Resend collector: paginated email counting capped at 10 pages to prevent API overdrawing
- Collection trigger: module-level rate limit (2min) and concurrent run guard — resets on deploy
- Breakdown: NULL-serviceId cost records shown as synthetic "Unallocated" service rows (not hidden)
- Seed data: projects merged (partners+homegrif → homegrif.com), Claude Max split into personal+instarea accounts
- Countdown page uses Record<string,string> lookup maps for risk→color/icon instead of if-chains
