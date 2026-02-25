import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates, ingestionCursors } from "@/lib/db/schema";
import { sql, eq, count, countDistinct, and, gte, lte, desc, or } from "drizzle-orm";
import { buildPrecertCondition } from "@/lib/db/filters";

function buildBaseConditions(params: URLSearchParams) {
  const conditions = [buildPrecertCondition(params.get("precert"))];
  const certType = params.get("type");
  const from = params.get("from");
  const to = params.get("to");
  const validity = params.get("validity");

  if (certType) conditions.push(eq(certificates.certType, certType));
  if (from) conditions.push(gte(certificates.notBefore, new Date(from)));
  if (to) conditions.push(lte(certificates.notBefore, new Date(to)));
  if (validity === "valid")
    conditions.push(gte(certificates.notAfter, new Date()));
  if (validity === "expired")
    conditions.push(lte(certificates.notAfter, new Date()));

  return conditions;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const selectedCA = searchParams.get("ca") || null;

  try {
    const baseConditions = buildBaseConditions(searchParams);
    const baseWhere =
      baseConditions.length > 0 ? and(...baseConditions) : undefined;

    // CA filter matches on root_ca_org OR issuer_org so clicking
    // "SSL.com" in the pie chart catches both SSL.com-direct and Sectigo-via-SSL.com
    const caConditions = selectedCA
      ? [
          ...baseConditions,
          or(
            eq(certificates.rootCaOrg, selectedCA),
            eq(certificates.issuerOrg, selectedCA)
          ),
        ]
      : baseConditions;
    const caWhere =
      caConditions.length > 0 ? and(...caConditions) : undefined;

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const trendConditions = [
      ...baseConditions,
      gte(certificates.notBefore, twelveMonthsAgo),
    ];

    // Run all independent queries in parallel
    const [
      [totalRow],
      [caRow],
      caBreakdown,
      monthlyTrend,
      recentCerts,
      [uniques],
      [expiringRow],
      markTypeBreakdown,
      [newLast30dRow],
      [caNewLast30dRow],
      [lastUpdatedRow],
      [activeCertsRow],
    ] = await Promise.all([
      // Total certificates (base filters, no CA filter)
      db
        .select({ count: count() })
        .from(certificates)
        .where(baseWhere),

      // Certificates for selected CA (or all if no CA selected)
      db
        .select({ count: count() })
        .from(certificates)
        .where(caWhere),

      // CA breakdown grouped by root CA (base filters)
      db
        .select({
          ca: certificates.rootCaOrg,
          total: count(),
          vmcCount: count(
            sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`
          ),
          cmcCount: count(
            sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`
          ),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(certificates.rootCaOrg)
        .orderBy(desc(count())),

      // Monthly trend (last 12 months, grouped by root CA)
      db
        .select({
          month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
          ca: certificates.rootCaOrg,
          count: count(),
        })
        .from(certificates)
        .where(and(...trendConditions))
        .groupBy(
          sql`to_char(${certificates.notBefore}, 'YYYY-MM')`,
          certificates.rootCaOrg
        )
        .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`),

      // Recent issuances: excludeDuplicatePrecerts (in caConditions) already
      // keeps orphan precerts and hides precerts that have a matching final cert.
      db
        .select({
          id: certificates.id,
          serialNumber: certificates.serialNumber,
          subjectCn: certificates.subjectCn,
          subjectOrg: certificates.subjectOrg,
          issuerOrg: certificates.issuerOrg,
          rootCaOrg: certificates.rootCaOrg,
          certType: certificates.certType,
          notBefore: certificates.notBefore,
          subjectCountry: certificates.subjectCountry,
          sanList: certificates.sanList,
          logotypeSvg: certificates.logotypeSvg,
          isPrecert: certificates.isPrecert,
        })
        .from(certificates)
        .where(caWhere)
        .orderBy(desc(certificates.notBefore))
        .limit(10),

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
        .where(
          and(
            ...(caConditions.length > 0 ? caConditions : []),
            gte(certificates.notAfter, new Date()),
            lte(certificates.notAfter, thirtyDaysFromNow)
          )
        ),

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

      // New certs in last 30 days (base filters, for delta)
      db
        .select({ count: count() })
        .from(certificates)
        .where(
          and(
            ...(baseConditions.length > 0 ? baseConditions : []),
            gte(certificates.notBefore, thirtyDaysAgo)
          )
        ),

      // New certs in last 30 days (CA filters, for delta)
      db
        .select({ count: count() })
        .from(certificates)
        .where(
          and(
            ...(caConditions.length > 0 ? caConditions : []),
            gte(certificates.notBefore, thirtyDaysAgo)
          )
        ),

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
        .where(
          and(
            ...(caConditions.length > 0 ? caConditions : []),
            gte(certificates.notAfter, new Date())
          )
        ),
    ]);

    const totalCerts = totalRow?.count || 0;
    const caCerts = caRow?.count || 0;

    const marketShare =
      selectedCA && totalCerts > 0
        ? ((caCerts / totalCerts) * 100).toFixed(1)
        : "100.0";

    return NextResponse.json(
      {
        selectedCA: selectedCA || "All CAs",
        totalCerts,
        caCerts,
        marketShare,
        uniqueOrgs: uniques?.uniqueOrgs || 0,
        caBreakdown,
        monthlyTrend,
        recentCerts,
        expiringCount: expiringRow?.count || 0,
        markTypeBreakdown,
        newLast30d: newLast30dRow?.count || 0,
        caNewLast30d: caNewLast30dRow?.count || 0,
        activeCerts: activeCertsRow?.count || 0,
        lastUpdated: lastUpdatedRow?.lastRun?.toISOString() || null,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
