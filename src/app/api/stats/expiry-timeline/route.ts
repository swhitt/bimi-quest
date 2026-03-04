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

    const monthTrunc = sql`date_trunc('month', ${certificates.notAfter})`;
    const monthLabel = sql<string>`to_char(date_trunc('month', ${certificates.notAfter}), 'YYYY-MM')`;

    const data = await db
      .select({
        month: monthLabel.as("month"),
        ca: certificates.issuerOrg,
        total: count(),
      })
      .from(certificates)
      .where(where)
      .groupBy(monthTrunc, certificates.issuerOrg)
      .orderBy(monthTrunc, desc(count()));

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
