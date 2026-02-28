ALTER TABLE "certificates" ADD COLUMN "industry" text;--> statement-breakpoint
CREATE INDEX "idx_certificates_industry" ON "certificates" USING btree ("industry");