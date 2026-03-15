import { type AnyColumn, asc, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { certificates } from "@/lib/db/schema";

const VALID_SORT_COLUMNS = ["notBefore", "notAfter", "ctLogTimestamp", "subjectCn", "issuerOrg", "subjectOrg"] as const;
type SortColumn = (typeof VALID_SORT_COLUMNS)[number];

function isValidSortColumn(s: string): s is SortColumn {
  return (VALID_SORT_COLUMNS as readonly string[]).includes(s);
}

export interface CertificatesQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  dir?: string;
}

export interface CertificateRow {
  id: number;
  serialNumber: string;
  fingerprintSha256: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  subjectCountry: string | null;
  issuerOrg: string | null;
  rootCaOrg: string | null;
  certType: string | null;
  markType: string | null;
  notBefore: Date;
  notAfter: Date;
  sanList: string[];
  ctLogTimestamp: Date | null;
  logotypeSvgHash: string | null;
  isPrecert: boolean | null;
  notabilityScore: number | null;
  companyDescription: string | null;
  industry: string | null;
  createdAt: Date | null;
  hasLogo: boolean;
}

export interface CertificatesResult {
  data: CertificateRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Core certificates list query logic, shared between the Server Component and the API route.
 * Accepts a URLSearchParams for filter conditions plus pagination/sort params.
 */
export async function fetchCertificates(
  filterParams: URLSearchParams,
  queryParams: CertificatesQueryParams = {},
): Promise<CertificatesResult> {
  const page = Math.max(1, queryParams.page ?? 1);
  const limit = Math.min(100, Math.max(1, queryParams.limit ?? 50));
  const sortBy: SortColumn = queryParams.sort && isValidSortColumn(queryParams.sort) ? queryParams.sort : "notBefore";
  const sortDir = queryParams.dir === "asc" ? "asc" : "desc";
  const offset = (page - 1) * limit;

  const where = buildCertificateConditions(filterParams);

  const sortColumns = {
    notBefore: certificates.notBefore,
    notAfter: certificates.notAfter,
    ctLogTimestamp: certificates.ctLogTimestamp,
    subjectCn: certificates.subjectCn,
    issuerOrg: certificates.issuerOrg,
    subjectOrg: certificates.subjectOrg,
  } satisfies Record<SortColumn, AnyColumn>;
  const sortCol = sortColumns[sortBy];
  const orderFn = sortDir === "asc" ? asc : desc;

  // Single query with count(*) OVER() window function to avoid a separate
  // count round-trip. hasLogo is derived from logotype_svg_hash presence
  // instead of fetching the full SVG body (5-100KB per row).
  const rows = await db
    .select({
      id: certificates.id,
      serialNumber: certificates.serialNumber,
      fingerprintSha256: certificates.fingerprintSha256,
      subjectCn: certificates.subjectCn,
      subjectOrg: certificates.subjectOrg,
      subjectCountry: certificates.subjectCountry,
      issuerOrg: certificates.issuerOrg,
      rootCaOrg: certificates.rootCaOrg,
      certType: certificates.certType,
      markType: certificates.markType,
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      sanList: certificates.sanList,
      ctLogTimestamp: certificates.ctLogTimestamp,
      logotypeSvgHash: certificates.logotypeSvgHash,
      hasLogo: sql<boolean>`${certificates.logotypeSvgHash} IS NOT NULL`.as("has_logo"),
      isPrecert: certificates.isPrecert,
      notabilityScore: certificates.notabilityScore,
      companyDescription: certificates.companyDescription,
      industry: certificates.industry,
      createdAt: certificates.createdAt,
      _total: sql<number>`count(*) OVER()`.as("_total"),
    })
    .from(certificates)
    .where(where)
    .orderBy(orderFn(sortCol))
    .limit(limit)
    .offset(offset);

  const total = rows.length > 0 ? rows[0]._total : 0;

  const data = rows.map(({ _total: _, ...rest }) => rest);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
