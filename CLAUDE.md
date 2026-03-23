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
- Collect task: server/tasks/collect.ts — daily cron at 06:00 UTC + manual trigger
- Auth: nuxt-auth-utils + Google OAuth. Middleware at server/middleware/auth.ts protects POST/PATCH/DELETE (except /api/bugs)
- Bug reporter: app/components/BugReportButton.vue + app/composables/useBugReport.ts → server/api/bugs.post.ts (needs GITHUB_TOKEN env var)
- Pages: 10 total (/, /breakdown, /trends, /platforms, /limits, /depletion, /optimizations, /status, /budgets, /manual)

## Conventions
- All DB queries use Drizzle ORM. Raw SQL via db.execute<T>(sql`...`) for complex queries (DISTINCT ON, CTEs)
- Input validation: server/utils/validation.ts (parseId, parseAmount, parsePagination)
- Notifications: server/utils/notifications.ts (sendAlertEmail, sendWhatsApp) — shared by budget + plan limit alerts
- Plan limits: server/utils/plan-limits.ts (PLAN_LIMITS, extractUsage, formatUsage, formatLimit)
- EUR conversion: server/utils/currency.ts (EUR_USD_RATE, toEur) — update monthly
- Bug issue markdown: server/utils/bug-report-markdown.ts (buildBugIssueBody, BugContext type)
- Fetch timeouts: AbortSignal.timeout(15_000) on all external calls, 30s for Railway GraphQL
- Error handling: always surface errors in errors[] array, never empty catch blocks
- Collection dedup: delete old records before inserting new per platform+period
- Test suite: `pnpm test` — vitest, tests in tests/ directory

## Deploy
- Render free tier, auto-deploy on push to main
- Build: `pnpm install && pnpm drizzle-kit push && pnpm build`
- Domain: infracost.eu (Websupport DNS → Render)
- Env vars: all API keys in Render dashboard, never in code

## Gotchas
- drizzle-kit push needs DATABASE_URL — only works on Render (in build command), not locally without the env var
- Render free tier: no blueprint support for custom domains — must use dashboard
- defineCachedEventHandler for Nitro caching (used on /api/platforms/status, 5min TTL)
- collectionRuns insert AFTER key check to avoid orphaned "running" records
- Depletion balances stored in .data/credit-balances.json (not DB) — distinguish ENOENT from corruption
