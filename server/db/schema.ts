import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// --- Enums ---

export const collectionMethodEnum = pgEnum('collection_method', ['api', 'hybrid', 'manual', 'csv_import'])
export const costTypeEnum = pgEnum('cost_type', ['subscription', 'usage', 'overage', 'one_time'])
export const alertSeverityEnum = pgEnum('alert_severity', ['info', 'warning', 'critical'])
export const alertStatusEnum = pgEnum('alert_status', ['pending', 'sent', 'acknowledged', 'resolved'])
export const optimizationStatusEnum = pgEnum('optimization_status', ['suggested', 'approved', 'rejected', 'implemented', 'dismissed'])
export const effortEnum = pgEnum('effort', ['trivial', 'small', 'medium', 'large'])
export const actorTypeEnum = pgEnum('actor_type', ['system', 'user', 'ai'])
export const collectionRunStatusEnum = pgEnum('collection_run_status', ['running', 'success', 'partial', 'failed'])
export const verificationMethodEnum = pgEnum('verification_method', ['manual', 'browser', 'cli', 'api'])
export const invoiceSourceEnum = pgEnum('invoice_source', ['platform_api', 'email_parse', 'manual'])
export const reconciliationStatusEnum = pgEnum('reconciliation_status', ['match', 'over', 'under', 'no_invoice', 'no_records'])

// --- Projects ---

export const projectStatusEnum = pgEnum('project_status', ['active', 'paused', 'archived'])

export const projects = pgTable('projects', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar({ length: 100 }).notNull().unique(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  repoUrl: varchar('repo_url', { length: 500 }),
  productionUrl: varchar('production_url', { length: 500 }),
  techStack: jsonb('tech_stack').$type<string[]>(), // ['nuxt', 'postgres', 'render', 'tailwind']
  status: projectStatusEnum().notNull().default('active'),
  monthlyBudget: numeric('monthly_budget', { precision: 10, scale: 2 }),
  discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

// --- Platforms ---

export const platforms = pgTable('platforms', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar({ length: 50 }).notNull().unique(),
  name: varchar({ length: 100 }).notNull(),
  type: varchar({ length: 50 }).notNull(), // hosting, ai, database, email, sms, cloud, ci_cd, domain, banking
  collectionMethod: collectionMethodEnum('collection_method').notNull().default('manual'),
  billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('monthly'), // monthly, usage, annual
  accountIdentifier: varchar('account_identifier', { length: 255 }), // email, org name, or team ID shown on dashboard
  apiConfigKey: varchar('api_config_key', { length: 100 }), // runtime config key for API credentials
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

// --- Services ---

export const services = pgTable('services', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  externalId: varchar('external_id', { length: 255 }), // ID from the platform's API
  name: varchar({ length: 255 }).notNull(),
  project: varchar({ length: 100 }), // which of our projects uses this
  serviceType: varchar('service_type', { length: 50 }).notNull(), // web, database, cron, worker, api_usage, subscription
  monthlyCostEstimate: numeric('monthly_cost_estimate', { precision: 10, scale: 2 }),
  metadata: jsonb(), // platform-specific data (region, plan, disk size, etc.)
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_services_platform').on(t.platformId),
  index('idx_services_project').on(t.project),
])

// --- Cost Records ---

export const costRecords = pgTable('cost_records', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  serviceId: integer('service_id').references(() => services.id),
  invoiceId: integer('invoice_id'), // FK added after invoices table declared below
  recordDate: timestamp('record_date').notNull(), // date this cost applies to
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  amount: numeric({ precision: 10, scale: 4 }).notNull(),
  currency: varchar({ length: 3 }).notNull().default('USD'),
  costType: costTypeEnum('cost_type').notNull().default('usage'),
  collectionMethod: collectionMethodEnum('collection_method').notNull(),
  rawData: jsonb('raw_data'), // original API response for audit
  notes: text(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_cost_records_platform').on(t.platformId),
  index('idx_cost_records_period').on(t.periodStart, t.periodEnd),
  index('idx_cost_records_platform_period').on(t.platformId, t.periodStart, t.periodEnd),
  index('idx_cost_records_record_date').on(t.recordDate),
  index('idx_cost_records_invoice').on(t.invoiceId),
])

// --- Budgets ---

export const budgets = pgTable('budgets', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 100 }).notNull(),
  platformId: integer('platform_id').references(() => platforms.id), // null = global budget
  projectId: integer('project_id').references(() => projects.id), // null = not project-scoped
  monthlyLimit: numeric('monthly_limit', { precision: 10, scale: 2 }).notNull(),
  alertAt50: boolean('alert_at_50').notNull().default(true),
  alertAt75: boolean('alert_at_75').notNull().default(true),
  alertAt90: boolean('alert_at_90').notNull().default(true),
  alertAt100: boolean('alert_at_100').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

// --- Alerts ---

export const alerts = pgTable('alerts', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  severity: alertSeverityEnum().notNull().default('info'),
  status: alertStatusEnum().notNull().default('pending'),
  alertType: varchar('alert_type', { length: 50 }).notNull(), // budget_threshold, anomaly, optimization, daily_summary
  message: text().notNull(),
  budgetId: integer('budget_id').references(() => budgets.id),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_alerts_type_created').on(t.alertType, t.createdAt),
  index('idx_alerts_active_created').on(t.isActive, t.createdAt),
])

// --- Optimizations ---

export const optimizations = pgTable('optimizations', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: varchar({ length: 255 }).notNull(),
  description: text().notNull(),
  platformId: integer('platform_id').references(() => platforms.id),
  serviceId: integer('service_id').references(() => services.id),
  estimatedSavings: numeric('estimated_savings', { precision: 10, scale: 2 }),
  effort: effortEnum().notNull().default('medium'),
  status: optimizationStatusEnum().notNull().default('suggested'),
  suggestedBy: actorTypeEnum('suggested_by').notNull().default('ai'),
  approvedAt: timestamp('approved_at'),
  implementedAt: timestamp('implemented_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

// --- Invoices ---

export const invoices = pgTable('invoices', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  invoiceNumber: varchar('invoice_number', { length: 100 }),
  invoiceDate: timestamp('invoice_date').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar({ length: 3 }).notNull().default('USD'),
  sourceSystem: invoiceSourceEnum('source_system').notNull().default('manual'),
  checksum: varchar({ length: 64 }), // sha256 hex for dedup
  pdfData: text('pdf_data'), // base64-encoded PDF, ~5MB cap enforced at handler
  pdfUrl: varchar('pdf_url', { length: 1000 }), // external PDF link when we don't store bytes (e.g. Turso API)
  rawData: jsonb('raw_data'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_invoices_platform_period').on(t.platformId, t.periodStart),
  index('idx_invoices_checksum').on(t.checksum),
])

// --- Reconciliation Runs ---
// One row per (platform, year, month, runAt) — audit trail of whether
// infracost's cost_records totals matched the authoritative invoice totals.

export const reconciliationRuns = pgTable('reconciliation_runs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  year: integer().notNull(),
  month: integer().notNull(), // 1-12
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  costRecordsSum: numeric('cost_records_sum', { precision: 10, scale: 4 }).notNull(),
  invoicesSum: numeric('invoices_sum', { precision: 10, scale: 4 }).notNull(),
  delta: numeric({ precision: 10, scale: 4 }).notNull(),
  deltaPct: numeric('delta_pct', { precision: 8, scale: 4 }),
  status: reconciliationStatusEnum().notNull(),
  runAt: timestamp('run_at').defaultNow().notNull(),
}, (t) => [
  index('idx_recon_platform_period').on(t.platformId, t.year, t.month),
])

// --- Audit Log ---

export const auditLog = pgTable('audit_log', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  action: varchar({ length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: integer('entity_id'),
  actorType: actorTypeEnum('actor_type').notNull().default('system'),
  details: jsonb(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// --- Cost Attribution Weights ---
// Per-platform split rules for costs that can't be directly attributed
// (e.g. Claude Max subscription spread across projects).
// Weights per platform must sum to ~1.0.

export const costAttributionWeights = pgTable('cost_attribution_weights', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  projectSlug: varchar('project_slug', { length: 100 }).notNull(),
  weight: numeric({ precision: 6, scale: 4 }).notNull(),
  basis: varchar({ length: 50 }).notNull().default('manual'), // manual | api_usage_share | service_count | equal
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_attr_weights_platform').on(t.platformId),
])

// --- Verifications ---
// Durable record of a user-visible cross-check: did the platform's own billing page
// agree with what infracost's MTD total said? Powered by three paths — manual entry,
// local browser automation (Claude-in-Chrome), CLI wrappers. See issue #90.

export const verifications = pgTable('verifications', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  reportedUsd: numeric('reported_usd', { precision: 10, scale: 4 }).notNull(),
  verifiedUsd: numeric('verified_usd', { precision: 10, scale: 4 }).notNull(),
  delta: numeric({ precision: 10, scale: 4 }).notNull(),
  deltaPct: numeric('delta_pct', { precision: 8, scale: 4 }),
  method: verificationMethodEnum().notNull().default('manual'),
  notes: jsonb().$type<{ raw?: string; screenshotBase64?: string; url?: string; extractedText?: string }>(),
  verifiedAt: timestamp('verified_at').defaultNow().notNull(),
  verifiedBy: varchar('verified_by', { length: 100 }).notNull().default('peter'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_verifications_platform_period').on(t.platformId, t.periodStart),
])

// --- Credit Balances ---
// Prepaid credit balance per platform (Anthropic, Railway, etc.).
// Replaces .data/credit-balances.json which was wiped on every Render deploy.

export const creditBalances = pgTable('credit_balances', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platform: varchar({ length: 50 }).notNull().unique(),
  balance: numeric({ precision: 10, scale: 4 }).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// --- App Settings ---
// Key/value singleton table for runtime flags. Introduced for saving_mode (v36.02):
// when saving_mode=true, the collect task short-circuits and no autonomous
// external API calls run. Toggled from the dashboard.

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// --- Collection Runs ---

export const collectionRuns = pgTable('collection_runs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  platformId: integer('platform_id').notNull().references(() => platforms.id),
  triggerType: varchar('trigger_type', { length: 20 }).notNull().default('manual'), // cron, manual, api
  status: collectionRunStatusEnum().notNull().default('running'),
  recordsCollected: integer('records_collected').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (t) => [
  index('idx_collection_runs_platform_started').on(t.platformId, t.startedAt),
])

// --- Relations ---

export const platformsRelations = relations(platforms, ({ many }) => ({
  services: many(services),
  costRecords: many(costRecords),
  budgets: many(budgets),
  invoices: many(invoices),
  collectionRuns: many(collectionRuns),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  platform: one(platforms, { fields: [services.platformId], references: [platforms.id] }),
  costRecords: many(costRecords),
}))

export const costRecordsRelations = relations(costRecords, ({ one }) => ({
  platform: one(platforms, { fields: [costRecords.platformId], references: [platforms.id] }),
  service: one(services, { fields: [costRecords.serviceId], references: [services.id] }),
}))

export const projectsRelations = relations(projects, () => ({}))

export const budgetsRelations = relations(budgets, ({ one }) => ({
  platform: one(platforms, { fields: [budgets.platformId], references: [platforms.id] }),
  project: one(projects, { fields: [budgets.projectId], references: [projects.id] }),
}))
