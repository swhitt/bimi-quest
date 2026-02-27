CREATE TABLE "certificate_chain_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaf_cert_id" integer NOT NULL,
	"chain_cert_id" integer NOT NULL,
	"chain_position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"serial_number" text NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"subject_dn" text NOT NULL,
	"subject_cn" text,
	"subject_org" text,
	"subject_country" text,
	"subject_state" text,
	"subject_locality" text,
	"issuer_dn" text NOT NULL,
	"issuer_cn" text,
	"issuer_org" text,
	"root_ca_org" text,
	"san_list" text[] DEFAULT '{}' NOT NULL,
	"mark_type" text,
	"cert_type" text,
	"logotype_svg_hash" text,
	"logotype_svg" text,
	"raw_pem" text NOT NULL,
	"is_precert" boolean DEFAULT false,
	"ct_log_timestamp" timestamp with time zone,
	"ct_log_index" bigint,
	"ct_log_name" text DEFAULT 'gorgon',
	"extensions_json" jsonb,
	"crtsh_id" bigint,
	"notability_score" integer,
	"notability_reason" text,
	"company_description" text,
	"discovery_source" text DEFAULT 'ct-gorgon',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "certificates_fingerprint_sha256_unique" UNIQUE("fingerprint_sha256")
);
--> statement-breakpoint
CREATE TABLE "chain_certs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"subject_dn" text NOT NULL,
	"issuer_dn" text NOT NULL,
	"raw_pem" text NOT NULL,
	"not_before" timestamp with time zone,
	"not_after" timestamp with time zone,
	CONSTRAINT "chain_certs_fingerprint_sha256_unique" UNIQUE("fingerprint_sha256")
);
--> statement-breakpoint
CREATE TABLE "domain_bimi_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"bimi_record_raw" text,
	"bimi_version" text,
	"bimi_logo_url" text,
	"bimi_authority_url" text,
	"dmarc_record_raw" text,
	"dmarc_policy" text,
	"dmarc_pct" integer,
	"dmarc_valid" boolean,
	"svg_fetched" boolean DEFAULT false,
	"svg_content" text,
	"svg_content_type" text,
	"svg_size_bytes" integer,
	"svg_tiny_ps_valid" boolean,
	"svg_validation_errors" text[],
	"last_checked" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "domain_bimi_state_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "ingestion_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_name" text NOT NULL,
	"last_index" bigint DEFAULT 0 NOT NULL,
	"tree_size" bigint,
	"last_run" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ingestion_cursors_log_name_unique" UNIQUE("log_name")
);
--> statement-breakpoint
CREATE TABLE "og_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"png" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "certificate_chain_links" ADD CONSTRAINT "certificate_chain_links_leaf_cert_id_certificates_id_fk" FOREIGN KEY ("leaf_cert_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_chain_links" ADD CONSTRAINT "certificate_chain_links_chain_cert_id_chain_certs_id_fk" FOREIGN KEY ("chain_cert_id") REFERENCES "public"."chain_certs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chain_links_leaf_cert_id" ON "certificate_chain_links" USING btree ("leaf_cert_id");--> statement-breakpoint
CREATE INDEX "idx_certificates_serial_number" ON "certificates" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "idx_certificates_not_before" ON "certificates" USING btree ("not_before");--> statement-breakpoint
CREATE INDEX "idx_certificates_not_after" ON "certificates" USING btree ("not_after");--> statement-breakpoint
CREATE INDEX "idx_certificates_root_ca_org" ON "certificates" USING btree ("root_ca_org");--> statement-breakpoint
CREATE INDEX "idx_certificates_issuer_org" ON "certificates" USING btree ("issuer_org");--> statement-breakpoint
CREATE INDEX "idx_certificates_cert_type" ON "certificates" USING btree ("cert_type");--> statement-breakpoint
CREATE INDEX "idx_certificates_subject_country" ON "certificates" USING btree ("subject_country");--> statement-breakpoint
CREATE INDEX "idx_certificates_is_precert" ON "certificates" USING btree ("is_precert");--> statement-breakpoint
CREATE INDEX "idx_certificates_serial_precert" ON "certificates" USING btree ("serial_number","is_precert");--> statement-breakpoint
CREATE INDEX "idx_certs_type_notbefore" ON "certificates" USING btree ("cert_type","not_before");--> statement-breakpoint
CREATE INDEX "idx_certs_rootca_notbefore" ON "certificates" USING btree ("root_ca_org","not_before");--> statement-breakpoint
CREATE INDEX "idx_certs_type_rootca_notbefore" ON "certificates" USING btree ("cert_type","root_ca_org","not_before");--> statement-breakpoint
CREATE INDEX "idx_certs_notafter_precert" ON "certificates" USING btree ("not_after","is_precert");--> statement-breakpoint
CREATE INDEX "idx_certificates_san_list_gin" ON "certificates" USING gin ("san_list");--> statement-breakpoint
CREATE INDEX "idx_certificates_subject_org" ON "certificates" USING btree ("subject_org");