import { and, count, countDistinct, desc, eq, gte, lte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildCommonFilterConditions } from "@/lib/db/filters";
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

    // Run all independent queries in parallel
    const [
      [totalRow],
      [caRow],
      caBreakdown,
      monthlyTrend,
      [uniques],
      [expiringRow],
      markTypeBreakdown,
      [newLast30dRow],
      [caNewLast30dRow],
      [lastUpdatedRow],
      [activeCertsRow],
    ] = await Promise.all([
      // Total certificates (global filters only, no CA/root filter - used as denominator for market share)
      db.select({ count: count() }).from(certificates).where(globalWhere),

      // Certificates for selected CA (or all if no CA selected)
      db.select({ count: count() }).from(certificates).where(caWhere),

      // CA breakdown grouped by issuing CA (base filters)
      db
        .select({
          ca: certificates.issuerOrg,
          total: count(),
          vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
          cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(certificates.issuerOrg)
        .orderBy(desc(count())),

      // Monthly trend (last 12 months, grouped by issuing CA)
      db
        .select({
          month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
          ca: certificates.issuerOrg,
          count: count(),
        })
        .from(certificates)
        .where(and(...trendConditions))
        .groupBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`, certificates.issuerOrg)
        .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`),

      // Unique orgs (with all filters)
      db
        .select({
          uniqueOrgs: countDistinct(certificates.subjectOrg),
        })
        .from(certificates)
        .where(caWhere),

      // Certs expiring in the next 30 days
      db
        .select({ count: count() })
        .from(certificates)
        .where(and(...caConditions, gte(certificates.notAfter, now), lte(certificates.notAfter, thirtyDaysFromNow))),

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

      // New certs in last 30 days (global filters, for delta denominator)
      db
        .select({ count: count() })
        .from(certificates)
        .where(and(...globalConditions, gte(certificates.notBefore, thirtyDaysAgo))),

      // New certs in last 30 days (CA filters, for delta)
      db
        .select({ count: count() })
        .from(certificates)
        .where(and(...caConditions, gte(certificates.notBefore, thirtyDaysAgo))),

      // Last ingestion run timestamp
      db
        .select({ lastRun: ingestionCursors.lastRun })
        .from(ingestionCursors)
        .orderBy(desc(ingestionCursors.lastRun))
        .limit(1),

      // Currently valid certificates (notAfter >= now, with CA filters)
      db
        .select({ count: count() })
        .from(certificates)
        .where(and(...caConditions, gte(certificates.notAfter, now))),
    ]);

    const totalCerts = totalRow?.count || 0;
    const caCerts = caRow?.count || 0;

    const hasCAFilter = selectedCA || selectedRoot;
    const marketShare = hasCAFilter && totalCerts > 0 ? parseFloat(((caCerts / totalCerts) * 100).toFixed(1)) : null;

    return NextResponse.json(
      {
        selectedCA: selectedCA || "All Issuers",
        totalCerts,
        caCerts,
        marketShare,
        uniqueOrgs: uniques?.uniqueOrgs || 0,
        caBreakdown,
        monthlyTrend,
        expiringCount: expiringRow?.count || 0,
        markTypeBreakdown,
        newLast30d: newLast30dRow?.count || 0,
        caNewLast30d: caNewLast30dRow?.count || 0,
        activeCerts: activeCertsRow?.count || 0,
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
