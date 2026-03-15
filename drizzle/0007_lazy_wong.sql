CREATE TABLE "logos" (
	"svg_hash" text PRIMARY KEY NOT NULL,
	"svg_content" text NOT NULL,
	"visual_hash" text,
	"tile_bg" text,
	"color_richness" integer,
	"quality_score" integer,
	"quality_reason" text,
	"svg_size_bytes" integer,
	"svg_tiny_ps_valid" boolean,
	"svg_validation_errors" text[],
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"first_source" text NOT NULL,
	"cert_count" integer DEFAULT 0,
	"domain_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DROP INDEX "idx_certificates_visual_hash";--> statement-breakpoint
CREATE INDEX "idx_logos_visual_hash" ON "logos" USING btree ("visual_hash");--> statement-breakpoint
CREATE INDEX "idx_logos_quality_score" ON "logos" USING btree ("quality_score");--> statement-breakpoint
CREATE INDEX "idx_logos_first_seen" ON "logos" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "idx_logos_cert_count" ON "logos" USING btree ("cert_count");--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN "logotype_svg";--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN "logo_color_richness";--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN "logo_quality_score";--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN "logo_quality_reason";--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN "logo_tile_bg";--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN "logotype_visual_hash";--> statement-breakpoint
ALTER TABLE "domain_bimi_state" DROP COLUMN "svg_content";--> statement-breakpoint
ALTER TABLE "domain_bimi_state" DROP COLUMN "svg_tiny_ps_valid";--> statement-breakpoint
ALTER TABLE "domain_bimi_state" DROP COLUMN "svg_validation_errors";--> statement-breakpoint
ALTER TABLE "domain_bimi_state" DROP COLUMN "svg_tile_bg";