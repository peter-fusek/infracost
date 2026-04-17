CREATE TYPE "public"."verification_method" AS ENUM('manual', 'browser', 'cli', 'api');--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platform_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"reported_usd" numeric(10, 4) NOT NULL,
	"verified_usd" numeric(10, 4) NOT NULL,
	"delta" numeric(10, 4) NOT NULL,
	"delta_pct" numeric(8, 4),
	"method" "verification_method" DEFAULT 'manual' NOT NULL,
	"notes" jsonb,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"verified_by" varchar(100) DEFAULT 'peter' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_verifications_platform_period" ON "verifications" USING btree ("platform_id","period_start");