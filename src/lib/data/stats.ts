import { and, count, desc, gte, isNotNull, lte, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { parseDate } from "@/lib/db/filters";
import { cmcCount, vmcCount } from "@/lib/db/query-fragments";
import { certificates, domainBimiState } from "@/lib/db/schema";

export interface HeatmapCell {
  dow: number; // 1=Mon..7=Sun (ISO day of week)
  hour: number; // 0-23
  count: number;
}

export type HeatmapMetric = "issuance" | "ctlog";

/**
 * Fetch day-of-week × hour-of-day issuance counts.
 * `metric=ctlog` uses ct_log_timestamp; default uses not_before.
 */
export async function fetchHeatmapData(
  params: URLSearchParams,
): Promise<{ data: HeatmapCell[]; metric: HeatmapMetric }> {
  const metric = params.get("metric") === "ctlog" ? "ctlog" : "issuance";
  const col = metric === "ctlog" ? certificates.ctLogTimestamp : certificates.notBefore;

  const baseConditions = buildStatsConditions(params);
  const where = metric === "ctlog" ? and(baseConditions, isNotNull(certificates.ctLogTimestamp)) : baseConditions;

  const dow = sql<number>`EXTRACT(ISODOW FROM ${col})::int`;
  const hour = sql<number>`EXTRACT(HOUR FROM ${col})::int`;

  const rows = await db
    .select({
      dow: dow.as("dow"),
      hour: hour.as("hour"),
      count: count().as("count"),
    })
    .from(certificates)
    .where(where)
    .groupBy(dow, hour)
    .orderBy(dow, hour);

  return { data: rows, metric };
}

export interface IndustryRow {
  industry: string | null;
  total: number;
  vmcCount: number;
  cmcCount: number;
}

export interface ExpiryRow {
  month: string;
  ca: string | null;
  total: number;
}

export interface OrgRow {
  org: string | null;
  total: number;
  maxNotability: number | null;
  industry: string | null;
  country: string | null;
}

/**
 * Fetch industry breakdown data.
 * Shared between the Server Component and the /api/stats/industry-breakdown route.
 */
export async function fetchIndustryBreakdown(params: URLSearchParams): Promise<IndustryRow[]> {
  const where = and(buildStatsConditions(params), isNotNull(certificates.industry));

  return db
    .select({
      industry: certificates.industry,
      total: count(),
      vmcCount,
      cmcCount,
    })
    .from(certificates)
    .where(where)
    .groupBy(certificates.industry)
    .orderBy(desc(count()))
    .limit(15);
}

/**
 * Fetch expiry timeline data.
 * Shared between the Server Component and the /api/stats/expiry-timeline route.
 */
export async function fetchExpiryTimeline(params: URLSearchParams): Promise<ExpiryRow[]> {
  const now = new Date();
  const twelveMonthsFromNow = new Date(now);
  twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);

  const where = and(
    buildStatsConditions(params),
    gte(certificates.notAfter, now),
    lte(certificates.notAfter, twelveMonthsFromNow),
  );

  // Use date_trunc for GROUP BY (index-friendly) and to_char in SELECT for formatting
  const monthTrunc = sql`date_trunc('month', ${certificates.notAfter})`;
  const monthLabel = sql<string>`to_char(date_trunc('month', ${certificates.notAfter}), 'YYYY-MM')`;

  return db
    .select({
      month: monthLabel.as("month"),
      ca: certificates.issuerOrg,
      total: count(),
    })
    .from(certificates)
    .where(where)
    .groupBy(monthTrunc, certificates.issuerOrg)
    .orderBy(monthTrunc, desc(count()));
}

/**
 * Fetch top organizations data.
 * Shared between the Server Component and the /api/stats/top-orgs route.
 */
export async function fetchTopOrgs(
  params: URLSearchParams,
  opts?: { page?: number; limit?: number },
): Promise<{ data: OrgRow[]; totalPages: number }> {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 15;
  const where = and(buildStatsConditions(params), isNotNull(certificates.subjectOrg));

  const rows = await db
    .select({
      org: certificates.subjectOrg,
      total: count(),
      maxNotability: max(certificates.notabilityScore),
      industry: max(certificates.industry),
      country: max(certificates.subjectCountry),
      _groupCount: sql<number>`count(*) over()`,
    })
    .from(certificates)
    .where(where)
    .groupBy(certificates.subjectOrg)
    .orderBy(desc(count()))
    .limit(limit)
    .offset((page - 1) * limit);

  const totalGroups = rows[0]?._groupCount ?? 0;
  const data = rows.map(({ _groupCount, ...rest }) => rest);

  return { data, totalPages: Math.ceil(totalGroups / limit) };
}

export interface DmarcPolicyRow {
  policy: string;
  count: number;
}

/**
 * Fetch DMARC policy distribution from domain_bimi_state.
 * Groups by dmarc_policy, coalescing NULL to "unknown".
 * Applies global filter params (ca, type, from, to) when present.
 */
export async function fetchDmarcPolicyDistribution(params: URLSearchParams): Promise<DmarcPolicyRow[]> {
  const conditions: ReturnType<typeof sql>[] = [];

  const caFilter = params.get("ca")?.trim();
  const typeFilter = params.get("type")?.trim();
  const fromDate = parseDate(params.get("from"));
  const toDate = parseDate(params.get("to"));

  if (caFilter) {
    conditions.push(sql`${domainBimiState.dnsSnapshot}->'certificate'->>'issuer' ILIKE ${"%" + caFilter + "%"}`);
  }
  if (typeFilter === "VMC" || typeFilter === "CMC") {
    conditions.push(sql`${domainBimiState.dnsSnapshot}->'certificate'->>'certType' = ${typeFilter}`);
  }
  if (fromDate) conditions.push(sql`${domainBimiState.lastChecked} >= ${fromDate}`);
  if (toDate) conditions.push(sql`${domainBimiState.lastChecked} <= ${toDate}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const policyCol = sql<string>`COALESCE(LOWER(${domainBimiState.dmarcPolicy}), 'unknown')`;

  const rows = await db
    .select({
      policy: policyCol.as("policy"),
      count: count(),
    })
    .from(domainBimiState)
    .where(where)
    .groupBy(policyCol)
    .orderBy(desc(count()));

  return rows;
}
