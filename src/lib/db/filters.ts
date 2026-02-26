import { sql, eq, like } from "drizzle-orm";
import { db } from "./index";
import { certificates } from "./schema";

/**
 * Safely parse a date string, returning null for invalid/missing values.
 */
export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const HEX_RE = /^[0-9a-f]+$/i;
const MIN_HASH_PREFIX = 8;

interface ResolvedCert {
  id: number | null;
  fingerprint: string | null;
  error: { message: string; status: number } | null;
}

/**
 * Resolve a certificate URL param (numeric ID or SHA-256 fingerprint prefix) to a row ID + fingerprint.
 */
export async function resolveCertParam(param: string): Promise<ResolvedCert> {
  const cols = { id: certificates.id, fingerprint: certificates.fingerprintSha256 };

  if (/^\d+$/.test(param)) {
    const [row] = await db.select(cols).from(certificates).where(eq(certificates.id, parseInt(param))).limit(1);
    return row
      ? { id: row.id, fingerprint: row.fingerprint, error: null }
      : { id: null, fingerprint: null, error: null };
  }

  if (HEX_RE.test(param) && param.length >= MIN_HASH_PREFIX) {
    const prefix = param.toLowerCase();
    if (prefix.length === 64) {
      const [row] = await db.select(cols).from(certificates).where(eq(certificates.fingerprintSha256, prefix)).limit(1);
      return row
        ? { id: row.id, fingerprint: row.fingerprint, error: null }
        : { id: null, fingerprint: null, error: null };
    }
    const matches = await db.select(cols).from(certificates).where(like(certificates.fingerprintSha256, `${prefix}%`)).limit(2);
    if (matches.length === 1) return { id: matches[0].id, fingerprint: matches[0].fingerprint, error: null };
    if (matches.length > 1)
      return { id: null, fingerprint: null, error: { message: "Ambiguous hash prefix, please provide more characters", status: 400 } };
    return { id: null, fingerprint: null, error: null };
  }

  return { id: null, fingerprint: null, error: { message: "Invalid certificate ID or hash", status: 400 } };
}

/**
 * Exclude precertificates that have a matching final certificate (same serial number).
 * Orphan precerts (where the final cert hasn't been logged yet) are kept.
 */
export function excludeDuplicatePrecerts() {
  return sql`NOT (
    ${certificates.isPrecert} = true
    AND ${certificates.serialNumber} IN (
      SELECT serial_number FROM certificates WHERE is_precert = false
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
