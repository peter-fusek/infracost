CREATE TABLE "cost_attribution_weights" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_attribution_weights_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platform_id" integer NOT NULL,
	"project_slug" varchar(100) NOT NULL,
	"weight" numeric(6, 4) NOT NULL,
	"basis" varchar(50) DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_attribution_weights" ADD CONSTRAINT "cost_attribution_weights_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attr_weights_platform" ON "cost_attribution_weights" USING btree ("platform_id");