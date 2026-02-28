DROP INDEX "idx_certificates_not_after";--> statement-breakpoint
DROP INDEX "idx_certificates_root_ca_org";--> statement-breakpoint
DROP INDEX "idx_certificates_cert_type";--> statement-breakpoint
DROP INDEX "idx_certificates_is_precert";--> statement-breakpoint
DROP INDEX "idx_certificates_industry";--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "logo_quality_score" integer;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "logo_quality_reason" text;--> statement-breakpoint
CREATE INDEX "idx_certificates_svg_hash" ON "certificates" USING btree ("logotype_svg_hash");--> statement-breakpoint
CREATE INDEX "idx_certs_active_notbefore" ON "certificates" USING btree ("not_before") WHERE "certificates"."is_superseded" = false;