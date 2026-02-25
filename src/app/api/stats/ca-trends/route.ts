import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, gte, and, count, desc } from "drizzle-orm";
import { excludeDuplicatePrecerts } from "@/lib/db/filters";

export async function GET(request: NextRequest) {
  const months = parseInt(request.nextUrl.searchParams.get("months") || "12");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  try {
    const trends = await db
      .select({
        month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
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
      .where(and(excludeDuplicatePrecerts(), gte(certificates.notBefore, cutoff)))
      .groupBy(
        sql`to_char(${certificates.notBefore}, 'YYYY-MM')`,
        certificates.rootCaOrg
      )
      .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`);

    // Top CAs by volume (grouped by root)
    const topCAs = await db
      .select({
        ca: certificates.rootCaOrg,
        total: count(),
      })
      .from(certificates)
      .where(excludeDuplicatePrecerts())
      .groupBy(certificates.rootCaOrg)
      .orderBy(desc(count()))
      .limit(10);

    return NextResponse.json({ trends, topCAs }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("CA trends API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
