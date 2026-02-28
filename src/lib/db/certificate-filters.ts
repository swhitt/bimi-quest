import { eq, and, gte, lte, ilike, sql, or, like } from "drizzle-orm";
import { certificates } from "./schema";
import { buildPrecertCondition, parseDate } from "./filters";

function normalizeHex(input: string): string {
  return input.replace(/[:\-.\s]/g, "").toLowerCase();
}

export function buildCertificateConditions(params: URLSearchParams) {
  const ca = params.get("ca");
  const root = params.get("root");
  const certType = params.get("type");
  const mark = params.get("mark");
  const from = params.get("from");
  const to = params.get("to");
  const expiresFrom = params.get("expiresFrom");
  const expiresTo = params.get("expiresTo");
  const country = params.get("country");
  const search = params.get("search");
  const host = params.get("host");
  const org = params.get("org");
  const validity = params.get("validity");
  const serialParam = params.get("serial");
  const fingerprintParam = params.get("fingerprint");
  const industry = params.get("industry");

  const conditions = [buildPrecertCondition(params.get("precert"))];

  if (ca) conditions.push(eq(certificates.issuerOrg, ca));
  if (root) conditions.push(eq(certificates.rootCaOrg, root));
  if (certType) conditions.push(eq(certificates.certType, certType));
  if (mark) conditions.push(eq(certificates.markType, mark));

  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (fromDate) conditions.push(gte(certificates.notBefore, fromDate));
  if (toDate) conditions.push(lte(certificates.notBefore, toDate));
  const expiresFromDate = parseDate(expiresFrom);
  const expiresToDate = parseDate(expiresTo);
  if (expiresFromDate) conditions.push(gte(certificates.notAfter, expiresFromDate));
  if (expiresToDate) conditions.push(lte(certificates.notAfter, expiresToDate));
  if (country) conditions.push(eq(certificates.subjectCountry, country));
  if (host) conditions.push(sql`${certificates.sanList} @> ARRAY[${host.toLowerCase()}]::text[]`);
  if (org) conditions.push(sql`LOWER(${certificates.subjectOrg}) = LOWER(${org})`);
  if (industry) conditions.push(eq(certificates.industry, industry));

  if (serialParam) {
    const normalized = normalizeHex(serialParam).replace(/^0+/, "");
    if (normalized.length >= 1) {
      conditions.push(
        sql`LOWER(LTRIM(${certificates.serialNumber}, '0')) = LOWER(LTRIM(${normalized}, '0'))`
      );
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
        sql`EXISTS (SELECT 1 FROM unnest(${certificates.sanList}) AS s WHERE s ILIKE ${`%${search}%`})`
      )!
    );
  }

  if (validity === "valid") {
    conditions.push(gte(certificates.notAfter, new Date()));
  } else if (validity === "expired") {
    conditions.push(lte(certificates.notAfter, new Date()));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
