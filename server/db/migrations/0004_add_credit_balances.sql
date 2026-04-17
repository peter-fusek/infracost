CREATE TABLE "credit_balances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credit_balances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platform" varchar(50) NOT NULL,
	"balance" numeric(10, 4) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_balances_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cost_records_record_date" ON "cost_records" USING btree ("record_date");--> statement-breakpoint
CREATE INDEX "idx_services_project" ON "services" USING btree ("project");