import { sql, eq, like } from "drizzle-orm";
import { db } from "./index";
import { certificates } from "./schema";

const HEX_RE = /^[0-9a-f]+$/i;
const MIN_HASH_PREFIX = 8;

/**
 * Resolve a certificate URL param (numeric ID or SHA-256 fingerprint prefix) to a row ID.
 * Returns { id, error } where error is { message, status } on failure.
 */
export async function resolveCertParam(
  param: string
): Promise<{ id: number | null; error: { message: string; status: number } | null }> {
  if (/^\d+$/.test(param)) {
    return { id: parseInt(param), error: null };
  }

  if (HEX_RE.test(param) && param.length >= MIN_HASH_PREFIX) {
    const prefix = param.toLowerCase();
    if (prefix.length === 64) {
      const [row] = await db
        .select({ id: certificates.id })
        .from(certificates)
        .where(eq(certificates.fingerprintSha256, prefix))
        .limit(1);
      return row ? { id: row.id, error: null } : { id: null, error: null };
    }
    const matches = await db
      .select({ id: certificates.id })
      .from(certificates)
      .where(like(certificates.fingerprintSha256, `${prefix}%`))
      .limit(2);
    if (matches.length === 1) return { id: matches[0].id, error: null };
    if (matches.length > 1)
      return { id: null, error: { message: "Ambiguous hash prefix, please provide more characters", status: 400 } };
    return { id: null, error: null };
  }

  return { id: null, error: { message: "Invalid certificate ID or hash", status: 400 } };
}

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

/**
 * Build precert filter condition based on the "precert" query param.
 * - "cert": only final certificates
 * - "precert": only precertificates
 * - "both" or unset: default dedup behavior (exclude precerts that have a matching final)
 */
export function buildPrecertCondition(precertParam: string | null) {
  if (precertParam === "cert") return eq(certificates.isPrecert, false);
  if (precertParam === "precert") return eq(certificates.isPrecert, true);
  return excludeDuplicatePrecerts();
}
