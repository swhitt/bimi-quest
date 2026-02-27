ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_lps_tag" text;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_avp_tag" text;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_declination" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_selector" text DEFAULT 'default';--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_org_domain_fallback" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "svg_indicator_hash" text;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_grade" text;