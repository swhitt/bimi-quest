import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, eq, gte, and, count, desc } from "drizzle-orm";
import { buildPrecertCondition } from "@/lib/db/filters";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const months = Math.max(1, parseInt(params.get("months") ?? "", 10) || 12);
  const ca = params.get("ca");
  const root = params.get("root");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  try {
    const baseConditions = [buildPrecertCondition(params.get("precert"))];
    if (ca) baseConditions.push(eq(certificates.issuerOrg, ca));
    if (root) baseConditions.push(eq(certificates.rootCaOrg, root));

    const [trends, topCAs] = await Promise.all([
      db
        .select({
          month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
          ca: certificates.rootCaOrg,
          total: count(),
          vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
          cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
        })
        .from(certificates)
        .where(and(...baseConditions, gte(certificates.notBefore, cutoff)))
        .groupBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`, certificates.rootCaOrg)
        .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`),

      // Top CAs by volume (grouped by root)
      db
        .select({
          ca: certificates.rootCaOrg,
          total: count(),
        })
        .from(certificates)
        .where(and(...baseConditions))
        .groupBy(certificates.rootCaOrg)
        .orderBy(desc(count()))
        .limit(10),
    ]);

    return NextResponse.json(
      { trends, topCAs },
      {
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
      },
    );
  } catch (error) {
    log("error", "ca-trends.api.failed", { error: String(error), route: "/api/stats/ca-trends" });
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 });
  }
}
