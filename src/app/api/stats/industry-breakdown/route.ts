import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, and, eq, count, desc, isNotNull } from "drizzle-orm";
import { buildCommonFilterConditions } from "@/lib/db/filters";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ca = params.get("ca");
  const root = params.get("root");

  try {
    const conditions = buildCommonFilterConditions(params);
    conditions.push(isNotNull(certificates.industry));
    if (ca) conditions.push(eq(certificates.issuerOrg, ca));
    if (root) conditions.push(eq(certificates.rootCaOrg, root));

    const where = and(...conditions);

    const data = await db
      .select({
        industry: certificates.industry,
        total: count(),
        vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
        cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
      })
      .from(certificates)
      .where(where)
      .groupBy(certificates.industry)
      .orderBy(desc(count()))
      .limit(15);

    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
      },
    );
  } catch (error) {
    log("error", "industry-breakdown.api.failed", { error: String(error), route: "/api/stats/industry-breakdown" });
    return NextResponse.json({ error: "Failed to fetch industry breakdown" }, { status: 500 });
  }
}
