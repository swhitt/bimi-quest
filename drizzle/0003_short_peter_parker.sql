ALTER TABLE "certificates" ADD COLUMN "is_superseded" boolean DEFAULT false;--> statement-breakpoint
UPDATE certificates SET is_superseded = true
WHERE is_precert = true
  AND serial_number IN (
    SELECT serial_number FROM certificates WHERE is_precert = false
  );