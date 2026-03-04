import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildCommonFilterConditions } from "@/lib/db/filters";
import { cmcCount, vmcCount } from "@/lib/db/query-fragments";
import { certificates, ingestionCursors } from "@/lib/db/schema";
import { serverTiming } from "@/lib/server-timing";

const dashboardQuerySchema = z.object({
  ca: z.string().optional(),
  root: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const parsed = dashboardQuerySchema.safeParse({
    ca: searchParams.get("ca") ?? undefined,
    root: searchParams.get("root") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.issues }, { status: 400 });
  }

  const selectedCA = parsed.data.ca ?? null;
  const selectedRoot = parsed.data.root ?? null;

  const timing = serverTiming();
  try {
    // Global conditions: all common filters (type, mark, country, etc.) but no CA/root
    const globalConditions = buildCommonFilterConditions(searchParams);
    const globalWhere = globalConditions.length > 0 ? and(...globalConditions) : undefined;

    // Base conditions: global + root CA
    const baseConditions = [...globalConditions];
    if (selectedRoot) baseConditions.push(eq(certificates.rootCaOrg, selectedRoot));
    const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;

    // CA conditions: base + issuer CA
    const caConditions = selectedCA ? [...baseConditions, eq(certificates.issuerOrg, selectedCA)] : baseConditions;
    const caWhere = caConditions.length > 0 ? and(...caConditions) : undefined;

    const now = new Date();

    // Fetch 13 months so the client can drop the partial first month
    const thirteenMonthsAgo = new Date(now);
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const trendConditions = [...baseConditions, gte(certificates.notBefore, thirteenMonthsAgo)];

    // Run all independent queries in parallel, consolidating count queries that share filter conditions
    const [[totalRow], [caOverview], caBreakdown, monthlyTrend, markTypeBreakdown, [lastUpdatedRow]] =
      await Promise.all([
        // Total certificates (global filters only, no CA/root filter - used as denominator for market share)
        db.select({ count: count() }).from(certificates).where(globalWhere),

        // Consolidated CA-filtered counts: total, active, expiring, new last 30d, unique orgs
        db
          .select({
            total: count(),
            activeCerts: count(sql`CASE WHEN ${certificates.notAfter} >= NOW() THEN 1 END`),
            expiringSoon: count(
              sql`CASE WHEN ${certificates.notAfter} >= NOW() AND ${certificates.notAfter} <= ${thirtyDaysFromNow} THEN 1 END`,
            ),
            newLast30d: count(sql`CASE WHEN ${certificates.notBefore} >= ${thirtyDaysAgo} THEN 1 END`),
            uniqueOrgs: countDistinct(certificates.subjectOrg),
          })
          .from(certificates)
          .where(caWhere),

        // CA breakdown grouped by issuing CA (base filters)
        db
          .select({
            ca: certificates.issuerOrg,
            total: count(),
            vmcCount,
            cmcCount,
          })
          .from(certificates)
          .where(baseWhere)
          .groupBy(certificates.issuerOrg)
          .orderBy(desc(count())),

        // Monthly trend (last 12 months, grouped by issuing CA)
        // Use date_trunc for GROUP BY (index-friendly) and to_char in SELECT for formatting
        (() => {
          const monthTrunc = sql`date_trunc('month', ${certificates.notBefore})`;
          const monthLabel = sql<string>`to_char(date_trunc('month', ${certificates.notBefore}), 'YYYY-MM')`;
          return db
            .select({
              month: monthLabel.as("month"),
              ca: certificates.issuerOrg,
              count: count(),
            })
            .from(certificates)
            .where(and(...trendConditions))
            .groupBy(monthTrunc, certificates.issuerOrg)
            .orderBy(monthTrunc);
        })(),

        // Mark type breakdown (base filters)
        db
          .select({
            markType: certificates.markType,
            count: count(),
          })
          .from(certificates)
          .where(baseWhere)
          .groupBy(certificates.markType)
          .orderBy(desc(count())),

        // Last ingestion run timestamp
        db
          .select({ lastRun: ingestionCursors.lastRun })
          .from(ingestionCursors)
          .orderBy(desc(ingestionCursors.lastRun))
          .limit(1),
      ]);

    const totalCerts = totalRow?.count || 0;
    const caCerts = caOverview?.total || 0;

    const hasCAFilter = selectedCA || selectedRoot;
    const marketShare = hasCAFilter && totalCerts > 0 ? parseFloat(((caCerts / totalCerts) * 100).toFixed(1)) : null;

    return NextResponse.json(
      {
        selectedCA: selectedCA || "All Issuers",
        totalCerts,
        caCerts,
        marketShare,
        uniqueOrgs: caOverview?.uniqueOrgs || 0,
        caBreakdown,
        monthlyTrend,
        expiringCount: caOverview?.expiringSoon || 0,
        markTypeBreakdown,
        caNewLast30d: caOverview?.newLast30d || 0,
        activeCerts: caOverview?.activeCerts || 0,
        lastUpdated: lastUpdatedRow?.lastRun?.toISOString() || null,
        activeFilters: {
          type: searchParams.get("type") || null,
          mark: searchParams.get("mark") || null,
          industry: searchParams.get("industry") || null,
          country: searchParams.get("country") || null,
        },
      },
      {
        headers: {
          "Cache-Control": CACHE_PRESETS.SHORT,
          "Server-Timing": timing.header("db"),
        },
      },
    );
  } catch (error) {
    return apiError(error, "dashboard.api.failed", "/api/dashboard", "Failed to fetch dashboard data");
  }
}
