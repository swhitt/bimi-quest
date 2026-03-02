import { and, count, desc, gte, lte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const now = new Date();
    const twelveMonthsFromNow = new Date(now);
    twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);

    const where = and(
      buildStatsConditions(params),
      gte(certificates.notAfter, now),
      lte(certificates.notAfter, twelveMonthsFromNow),
    );

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
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(
      error,
      "expiry-timeline.api.failed",
      "/api/stats/expiry-timeline",
      "Failed to fetch expiry timeline",
    );
  }
}
