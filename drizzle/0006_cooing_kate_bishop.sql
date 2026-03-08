CREATE TABLE "ca_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"ccadb_record_id" text,
	"certificate_name" text NOT NULL,
	"record_type" text NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"parent_fingerprint_sha256" text,
	"subject_key_identifier" text,
	"authority_key_identifier" text,
	"subject_dn" text,
	"issuer_dn" text,
	"ca_owner" text NOT NULL,
	"subordinate_ca_owner" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"revocation_status" text,
	"apple_status" text,
	"chrome_status" text,
	"microsoft_status" text,
	"mozilla_status" text,
	"derived_trust_bits" text,
	"technically_constrained" boolean DEFAULT false,
	"ev_oids" text,
	"auditor_name" text,
	"standard_audit_url" text,
	"crl_urls" text,
	"cp_cps_url" text,
	"raw_pem" text,
	"cross_sign_group_id" text,
	"synced_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ca_certificates_fingerprint_sha256_unique" UNIQUE("fingerprint_sha256")
);
--> statement-breakpoint
CREATE TABLE "ca_cross_signs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cert_id_a" integer NOT NULL,
	"cert_id_b" integer NOT NULL,
	"shared_ski" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ca_sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"record_count" integer,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ca_sync_cursors_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "ct_log_entries" (
	"index" bigint PRIMARY KEY NOT NULL,
	"log_name" text DEFAULT 'gorgon' NOT NULL,
	"leaf_input" text NOT NULL,
	"extra_data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "subject_org_slug" text;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "logo_tile_bg" text;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "logotype_visual_hash" text;--> statement-breakpoint
ALTER TABLE "domain_bimi_state" ADD COLUMN "dns_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ca_cross_signs" ADD CONSTRAINT "ca_cross_signs_cert_id_a_ca_certificates_id_fk" FOREIGN KEY ("cert_id_a") REFERENCES "public"."ca_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ca_cross_signs" ADD CONSTRAINT "ca_cross_signs_cert_id_b_ca_certificates_id_fk" FOREIGN KEY ("cert_id_b") REFERENCES "public"."ca_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ca_certs_parent_fp" ON "ca_certificates" USING btree ("parent_fingerprint_sha256");--> statement-breakpoint
CREATE INDEX "idx_ca_certs_ski" ON "ca_certificates" USING btree ("subject_key_identifier");--> statement-breakpoint
CREATE INDEX "idx_ca_certs_ca_owner" ON "ca_certificates" USING btree ("ca_owner");--> statement-breakpoint
CREATE INDEX "idx_ca_certs_record_type" ON "ca_certificates" USING btree ("record_type");--> statement-breakpoint
CREATE INDEX "idx_ca_certs_cross_sign_group" ON "ca_certificates" USING btree ("cross_sign_group_id");--> statement-breakpoint
CREATE INDEX "idx_ca_cross_signs_a" ON "ca_cross_signs" USING btree ("cert_id_a");--> statement-breakpoint
CREATE INDEX "idx_ca_cross_signs_b" ON "ca_cross_signs" USING btree ("cert_id_b");--> statement-breakpoint
CREATE INDEX "idx_ct_entries_log_index" ON "ct_log_entries" USING btree ("log_name","index");--> statement-breakpoint
CREATE INDEX "idx_certs_issuer_notbefore" ON "certificates" USING btree ("issuer_org","not_before");--> statement-breakpoint
CREATE INDEX "idx_certificates_subject_org_lower" ON "certificates" USING btree (LOWER("subject_org"));--> statement-breakpoint
CREATE INDEX "idx_certificates_fingerprint_prefix" ON "certificates" USING btree ("fingerprint_sha256");--> statement-breakpoint
CREATE INDEX "idx_certificates_subject_org_slug" ON "certificates" USING btree ("subject_org_slug");--> statement-breakpoint
CREATE INDEX "idx_certificates_industry" ON "certificates" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "idx_certificates_visual_hash" ON "certificates" USING btree ("logotype_visual_hash");--> statement-breakpoint
CREATE INDEX "idx_certs_notability_score" ON "certificates" USING btree ("notability_score");--> statement-breakpoint
CREATE INDEX "idx_certs_notability_null" ON "certificates" USING btree ("id") WHERE "certificates"."notability_score" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_certs_org_notbefore" ON "certificates" USING btree ("subject_org","not_before");--> statement-breakpoint
CREATE INDEX "idx_certs_industry_notbefore" ON "certificates" USING btree ("industry","not_before");--> statement-breakpoint
CREATE INDEX "idx_certs_marktype_notbefore" ON "certificates" USING btree ("mark_type","not_before");--> statement-breakpoint
CREATE INDEX "idx_certs_serial_lower" ON "certificates" USING btree (LOWER("serial_number"));--> statement-breakpoint
CREATE INDEX "idx_domain_bimi_dns_snapshot" ON "domain_bimi_state" USING gin ("dns_snapshot");