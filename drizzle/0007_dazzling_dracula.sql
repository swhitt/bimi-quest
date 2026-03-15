CREATE TABLE "certificate_scts" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificate_id" integer NOT NULL,
	"sct_version" integer,
	"log_id" text NOT NULL,
	"sct_timestamp" timestamp with time zone NOT NULL,
	"hash_algorithm" integer,
	"sig_algorithm" integer,
	"log_name" text,
	"log_operator" text,
	"log_url" text,
	"lag_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dmarc_policy_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"previous_policy" text,
	"new_policy" text NOT NULL,
	"previous_pct" integer,
	"new_pct" integer,
	"detected_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dns_record_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"record_type" text NOT NULL,
	"change_type" text NOT NULL,
	"previous_raw" text,
	"new_raw" text,
	"previous_record" jsonb,
	"new_record" jsonb,
	"detected_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_watches" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"webhook_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "is_test" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "sct_count" integer;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "bimi_record_count" integer;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "dmarc_record_count" integer;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "svg_tile_bg" text;--> statement-breakpoint
ALTER TABLE "certificate_scts" ADD CONSTRAINT "certificate_scts_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmarc_policy_changes" ADD CONSTRAINT "dmarc_policy_changes_domain_domain_bimi_state_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."domain_bimi_state"("domain") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_record_changes" ADD CONSTRAINT "dns_record_changes_domain_domain_bimi_state_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."domain_bimi_state"("domain") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scts_certificate_id" ON "certificate_scts" USING btree ("certificate_id");--> statement-breakpoint
CREATE INDEX "idx_scts_log_id" ON "certificate_scts" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "idx_scts_sct_timestamp" ON "certificate_scts" USING btree ("sct_timestamp");--> statement-breakpoint
CREATE INDEX "idx_scts_log_name" ON "certificate_scts" USING btree ("log_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_scts_cert_log" ON "certificate_scts" USING btree ("certificate_id","log_id");--> statement-breakpoint
CREATE INDEX "idx_dmarc_changes_domain" ON "dmarc_policy_changes" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_dmarc_changes_detected_at" ON "dmarc_policy_changes" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "idx_dns_changes_detected_at" ON "dns_record_changes" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "idx_dns_changes_domain_detected" ON "dns_record_changes" USING btree ("domain","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_domain_watches_domain_webhook" ON "domain_watches" USING btree ("domain","webhook_url");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chain_links_unique" ON "certificate_chain_links" USING btree ("leaf_cert_id","chain_cert_id");--> statement-breakpoint
CREATE INDEX "idx_domain_bimi_last_checked" ON "domain_bimi_state" USING btree ("last_checked");--> statement-breakpoint
CREATE INDEX "idx_domain_bimi_grade" ON "domain_bimi_state" USING btree ("bimi_grade");--> statement-breakpoint
CREATE INDEX "idx_domain_bimi_dmarc_policy" ON "domain_bimi_state" USING btree ("dmarc_policy");