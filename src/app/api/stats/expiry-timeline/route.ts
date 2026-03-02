import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, and, eq, gte, lte, count, desc } from "drizzle-orm";
import { buildCommonFilterConditions } from "@/lib/db/filters";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ca = params.get("ca");
  const root = params.get("root");

  try {
    const now = new Date();
    const twelveMonthsFromNow = new Date(now);
    twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);

    const conditions = buildCommonFilterConditions(params);
    conditions.push(gte(certificates.notAfter, now));
    conditions.push(lte(certificates.notAfter, twelveMonthsFromNow));
    if (ca) conditions.push(eq(certificates.issuerOrg, ca));
    if (root) conditions.push(eq(certificates.rootCaOrg, root));

    const where = and(...conditions);

    const data = await db
      .select({
        month: sql<string>`to_char(${certificates.notAfter}, 'YYYY-MM')`,
        ca: certificates.issuerOrg,
        total: count(),
      })
      .from(certificates)
      .where(where)
      .groupBy(sql`to_char(${certificates.notAfter}, 'YYYY-MM')`, certificates.issuerOrg)
      .orderBy(sql`to_char(${certificates.notAfter}, 'YYYY-MM')`, desc(count()));

    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
      },
    );
  } catch (error) {
    log("error", "expiry-timeline.api.failed", { error: String(error), route: "/api/stats/expiry-timeline" });
    return NextResponse.json({ error: "Failed to fetch expiry timeline" }, { status: 500 });
  }
}
