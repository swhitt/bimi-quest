import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, eq, count, countDistinct, and, gte, lte, desc, or } from "drizzle-orm";
import { excludeDuplicatePrecerts } from "@/lib/db/filters";

function buildBaseConditions(params: URLSearchParams) {
  const conditions = [excludeDuplicatePrecerts()];
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

    // Total certificates (with base filters, no CA filter)
    const [totalRow] = await db
      .select({ count: count() })
      .from(certificates)
      .where(baseWhere);
    const totalCerts = totalRow?.count || 0;

    // Certificates for selected CA (or all if no CA selected)
    const [caRow] = await db
      .select({ count: count() })
      .from(certificates)
      .where(caWhere);
    const caCerts = caRow?.count || 0;

    // Market share
    const marketShare =
      selectedCA && totalCerts > 0
        ? ((caCerts / totalCerts) * 100).toFixed(1)
        : "100.0";

    // CA breakdown grouped by root CA (with base filters)
    const caBreakdown = await db
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
      .orderBy(desc(count()));

    // Issuer breakdown within root CA (for drill-down)
    const issuerBreakdown = await db
      .select({
        rootCa: certificates.rootCaOrg,
        issuer: certificates.issuerOrg,
        total: count(),
      })
      .from(certificates)
      .where(baseWhere)
      .groupBy(certificates.rootCaOrg, certificates.issuerOrg)
      .orderBy(desc(count()));

    // Monthly trend (last 12 months, grouped by root CA)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const trendConditions = [
      ...baseConditions,
      gte(certificates.notBefore, twelveMonthsAgo),
    ];

    const monthlyTrend = await db
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
      .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`);

    // Recent issuances: prefer final certs over precerts for the display list.
    // Precerts at the ingestion frontier haven't had their final cert arrive yet,
    // so we skip them here to avoid showing transient entries.
    const recentConditions = caConditions.length > 0
      ? [...caConditions, eq(certificates.isPrecert, false)]
      : [eq(certificates.isPrecert, false)];
    const recentCerts = await db
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
      .where(and(...recentConditions))
      .orderBy(desc(certificates.notBefore))
      .limit(10);

    // Unique orgs (with all filters)
    const [uniques] = await db
      .select({
        uniqueOrgs: countDistinct(certificates.subjectOrg),
      })
      .from(certificates)
      .where(caWhere);

    return NextResponse.json({
      selectedCA: selectedCA || "All CAs",
      totalCerts,
      caCerts,
      marketShare,
      uniqueOrgs: uniques?.uniqueOrgs || 0,
      caBreakdown,
      issuerBreakdown,
      monthlyTrend,
      recentCerts,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
