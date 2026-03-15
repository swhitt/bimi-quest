import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { escapeLike } from "@/lib/db/certificate-filters";
import { dnsRecordChanges } from "@/lib/db/schema";

export interface DnsChangeRow {
  id: number;
  domain: string;
  recordType: string;
  changeType: string;
  previousRecord: Record<string, string> | null;
  newRecord: Record<string, string> | null;
  detectedAt: string | null;
}

export interface DnsChangesResult {
  data: DnsChangeRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DnsChangesQueryParams {
  page?: number;
  limit?: number;
}

/**
 * Fetch DNS record changes with server-side pagination and filtering.
 * Follows the same pattern as fetchCertificates.
 */
export async function fetchDnsChanges(
  filterParams: URLSearchParams,
  queryParams: DnsChangesQueryParams = {},
): Promise<DnsChangesResult> {
  const page = Math.max(1, queryParams.page ?? 1);
  const limit = Math.min(100, Math.max(1, queryParams.limit ?? 25));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];

  const recordType = filterParams.get("recordType");
  const changeType = filterParams.get("changeType");
  const search = filterParams.get("search");

  if (recordType) conditions.push(eq(dnsRecordChanges.recordType, recordType));
  if (changeType) conditions.push(eq(dnsRecordChanges.changeType, changeType));
  if (search) {
    conditions.push(ilike(dnsRecordChanges.domain, `%${escapeLike(search)}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const VALID_SORT_COLUMNS = {
    domain: dnsRecordChanges.domain,
    changeType: dnsRecordChanges.changeType,
    detectedAt: dnsRecordChanges.detectedAt,
  } as const;

  const sortCol =
    VALID_SORT_COLUMNS[filterParams.get("sort") as keyof typeof VALID_SORT_COLUMNS] ?? dnsRecordChanges.detectedAt;
  const sortDir = filterParams.get("dir") === "asc" ? asc : desc;

  const rows = await db
    .select({
      id: dnsRecordChanges.id,
      domain: dnsRecordChanges.domain,
      recordType: dnsRecordChanges.recordType,
      changeType: dnsRecordChanges.changeType,
      previousRecord: dnsRecordChanges.previousRecord,
      newRecord: dnsRecordChanges.newRecord,
      detectedAt: dnsRecordChanges.detectedAt,
      _total: sql<number>`count(*) OVER()`.as("_total"),
    })
    .from(dnsRecordChanges)
    .where(where)
    .orderBy(sortDir(sortCol))
    .limit(limit)
    .offset(offset);

  const total = rows.length > 0 ? rows[0]._total : 0;

  const data: DnsChangeRow[] = rows.map(({ _total: _, ...rest }) => ({
    ...rest,
    detectedAt: rest.detectedAt?.toISOString() ?? null,
  }));

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
