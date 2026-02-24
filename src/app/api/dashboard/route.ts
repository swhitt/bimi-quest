import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates, caStats } from "@/lib/db/schema";
import { sql, eq, count, countDistinct, and, gte, lte, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const selectedCA = searchParams.get("ca") || "SSL.com";

  try {
    // Total certificates across all CAs
    const [totalRow] = await db
      .select({ count: count() })
      .from(certificates);
    const totalCerts = totalRow?.count || 0;

    // Certificates for selected CA
    const [caRow] = await db
      .select({ count: count() })
      .from(certificates)
      .where(eq(certificates.issuerOrg, selectedCA));
    const caCerts = caRow?.count || 0;

    // Market share
    const marketShare = totalCerts > 0 ? ((caCerts / totalCerts) * 100).toFixed(1) : "0";

    // CA breakdown (top CAs by cert count)
    const caBreakdown = await db
      .select({
        ca: certificates.issuerOrg,
        total: count(),
        vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
        cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
      })
      .from(certificates)
      .groupBy(certificates.issuerOrg)
      .orderBy(desc(count()));

    // Monthly trend (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
        ca: certificates.issuerOrg,
        count: count(),
      })
      .from(certificates)
      .where(gte(certificates.notBefore, twelveMonthsAgo))
      .groupBy(
        sql`to_char(${certificates.notBefore}, 'YYYY-MM')`,
        certificates.issuerOrg
      )
      .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`);

    // Recent issuances (last 10)
    const recentCerts = await db
      .select({
        id: certificates.id,
        subjectCn: certificates.subjectCn,
        subjectOrg: certificates.subjectOrg,
        issuerOrg: certificates.issuerOrg,
        certType: certificates.certType,
        notBefore: certificates.notBefore,
        subjectCountry: certificates.subjectCountry,
        sanList: certificates.sanList,
      })
      .from(certificates)
      .orderBy(desc(certificates.notBefore))
      .limit(10);

    // Unique domains and orgs for selected CA
    const [caUniques] = await db
      .select({
        uniqueOrgs: countDistinct(certificates.subjectOrg),
      })
      .from(certificates)
      .where(eq(certificates.issuerOrg, selectedCA));

    return NextResponse.json({
      selectedCA,
      totalCerts,
      caCerts,
      marketShare,
      uniqueOrgs: caUniques?.uniqueOrgs || 0,
      caBreakdown,
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
