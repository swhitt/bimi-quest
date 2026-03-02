import { and, eq, gte, like, lte, type SQL } from "drizzle-orm";
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
    const [row] = await db
      .select(cols)
      .from(certificates)
      .where(eq(certificates.id, parseInt(param)))
      .limit(1);
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
    const matches = await db
      .select(cols)
      .from(certificates)
      .where(like(certificates.fingerprintSha256, `${prefix}%`))
      .limit(2);
    if (matches.length === 1) return { id: matches[0].id, fingerprint: matches[0].fingerprint, error: null };
    if (matches.length > 1)
      return {
        id: null,
        fingerprint: null,
        error: { message: "Ambiguous hash prefix, please provide more characters", status: 400 },
      };
    return { id: null, fingerprint: null, error: null };
  }

  return { id: null, fingerprint: null, error: { message: "Invalid certificate ID or hash", status: 400 } };
}

/**
 * Exclude precertificates that have been superseded by their matching final certificate.
 * Uses the materialized `is_superseded` column set during ingestion, avoiding
 * a correlated subquery on every read.
 */
export function excludeDuplicatePrecerts() {
  return eq(certificates.isSuperseded, false);
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

/**
 * Shared filter conditions for all list/stats endpoints.
 * Handles: type, mark, from, to, expiresFrom, expiresTo, validity,
 * precert, country, industry.
 * Deliberately excludes `ca` and `root` so callers can layer those
 * on for market-share semantics (global → base → CA tiers).
 */
export function buildCommonFilterConditions(params: URLSearchParams): SQL[] {
  const conditions: SQL[] = [buildPrecertCondition(params.get("precert"))];

  const certType = params.get("type");
  const mark = params.get("mark");
  const country = params.get("country");
  const industry = params.get("industry");
  const validity = params.get("validity");
  const fromDate = parseDate(params.get("from"));
  const toDate = parseDate(params.get("to"));
  const expiresFromDate = parseDate(params.get("expiresFrom"));
  const expiresToDate = parseDate(params.get("expiresTo"));

  if (certType) conditions.push(eq(certificates.certType, certType));
  if (mark) conditions.push(eq(certificates.markType, mark));
  if (country) conditions.push(eq(certificates.subjectCountry, country));
  if (industry) conditions.push(eq(certificates.industry, industry));
  if (fromDate) conditions.push(gte(certificates.notBefore, fromDate));
  if (toDate) conditions.push(lte(certificates.notBefore, toDate));
  if (expiresFromDate) conditions.push(gte(certificates.notAfter, expiresFromDate));
  if (expiresToDate) conditions.push(lte(certificates.notAfter, expiresToDate));
  if (validity === "valid") conditions.push(gte(certificates.notAfter, new Date()));
  if (validity === "expired") conditions.push(lte(certificates.notAfter, new Date()));

  return conditions;
}

/**
 * Build combined filter conditions for stats endpoints.
 * Applies all common filters plus the `ca` (issuerOrg) and `root` (rootCaOrg)
 * params that stats routes consistently need.
 * Returns a single SQL expression ready for a `.where()` clause, or undefined
 * when no filters are active.
 */
export function buildStatsConditions(params: URLSearchParams): ReturnType<typeof and> {
  const conditions = buildCommonFilterConditions(params);

  const ca = params.get("ca");
  const root = params.get("root");
  if (ca) conditions.push(eq(certificates.issuerOrg, ca));
  if (root) conditions.push(eq(certificates.rootCaOrg, root));

  return conditions.length > 0 ? and(...conditions) : undefined;
}
