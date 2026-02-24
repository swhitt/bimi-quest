import { sql } from "drizzle-orm";
import { certificates } from "./schema";

/**
 * Exclude precertificates that have a matching final certificate (same serial number).
 * Orphan precerts (where the final cert hasn't been logged yet) are kept.
 */
export function excludeDuplicatePrecerts() {
  return sql`NOT (
    ${certificates.isPrecert} = true
    AND EXISTS (
      SELECT 1 FROM certificates c2
      WHERE c2.serial_number = ${certificates.serialNumber}
        AND c2.id != ${certificates.id}
        AND c2.is_precert = false
    )
  )`;
}
