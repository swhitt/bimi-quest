import { and, eq, ilike, like, or, sql } from "drizzle-orm";
import { buildCommonFilterConditions } from "./filters";
import { certificates } from "./schema";

function normalizeHex(input: string): string {
  return input.replace(/[:\-.\s]/g, "").toLowerCase();
}

/**
 * Build filter conditions for the certificates list endpoint.
 * Delegates shared filters (type, mark, country, industry, from, to, expiresFrom,
 * expiresTo, validity, precert) to `buildCommonFilterConditions`, then layers on
 * certificate-specific filters (ca, root, search, host, org, serial, fingerprint).
 */
export function buildCertificateConditions(params: URLSearchParams) {
  const conditions = buildCommonFilterConditions(params);

  const ca = params.get("ca");
  const root = params.get("root");
  const search = params.get("search");
  const host = params.get("host");
  const org = params.get("org");
  const serialParam = params.get("serial");
  const fingerprintParam = params.get("fingerprint");

  if (ca) conditions.push(eq(certificates.issuerOrg, ca));
  if (root) conditions.push(eq(certificates.rootCaOrg, root));
  if (host) conditions.push(sql`${certificates.sanList} @> ARRAY[${host.toLowerCase()}]::text[]`);
  if (org) conditions.push(sql`LOWER(${certificates.subjectOrg}) = LOWER(${org})`);

  if (serialParam) {
    const normalized = normalizeHex(serialParam).replace(/^0+/, "");
    if (normalized.length >= 1) {
      conditions.push(sql`LOWER(LTRIM(${certificates.serialNumber}, '0')) = LOWER(LTRIM(${normalized}, '0'))`);
    }
  }

  if (fingerprintParam) {
    const normalized = normalizeHex(fingerprintParam);
    if (normalized.length >= 8) {
      if (normalized.length === 64) {
        conditions.push(eq(certificates.fingerprintSha256, normalized));
      } else {
        conditions.push(like(certificates.fingerprintSha256, `${normalized}%`));
      }
    }
  }

  if (search) {
    conditions.push(
      or(
        ilike(certificates.subjectCn, `%${search}%`),
        ilike(certificates.subjectOrg, `%${search}%`),
        sql`EXISTS (SELECT 1 FROM unnest(${certificates.sanList}) AS s WHERE s ILIKE ${`%${search}%`})`,
      )!,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
