CREATE TYPE "public"."invoice_source" AS ENUM('platform_api', 'email_parse', 'manual');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('match', 'over', 'under', 'no_invoice', 'no_records');--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reconciliation_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"platform_id" integer NOT NULL,
	"cost_records_sum" numeric(10, 4) NOT NULL,
	"invoices_sum" numeric(10, 4) NOT NULL,
	"delta" numeric(10, 4) NOT NULL,
	"delta_pct" numeric(8, 4),
	"status" "reconciliation_status" NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_records" ADD COLUMN "invoice_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "invoice_number" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source_system" "invoice_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "checksum" varchar(64);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_data" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recon_platform_period" ON "reconciliation_runs" USING btree ("platform_id","year","month");--> statement-breakpoint
CREATE INDEX "idx_cost_records_invoice" ON "cost_records" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_platform_period" ON "invoices" USING btree ("platform_id","period_start");--> statement-breakpoint
CREATE INDEX "idx_invoices_checksum" ON "invoices" USING btree ("checksum");