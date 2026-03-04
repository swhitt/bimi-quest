import { and, count, desc, gte, isNotNull, lte, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { cmcCount, vmcCount } from "@/lib/db/query-fragments";
import { certificates } from "@/lib/db/schema";

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
export async function fetchTopOrgs(params: URLSearchParams): Promise<OrgRow[]> {
  const where = and(buildStatsConditions(params), isNotNull(certificates.subjectOrg));

  return db
    .select({
      org: certificates.subjectOrg,
      total: count(),
      maxNotability: max(certificates.notabilityScore),
      industry: max(certificates.industry),
      country: max(certificates.subjectCountry),
    })
    .from(certificates)
    .where(where)
    .groupBy(certificates.subjectOrg)
    .orderBy(desc(count()))
    .limit(10);
}
