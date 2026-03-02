import { and, count, desc, isNotNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const where = and(buildStatsConditions(params), isNotNull(certificates.industry));

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
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(
      error,
      "industry-breakdown.api.failed",
      "/api/stats/industry-breakdown",
      "Failed to fetch industry breakdown",
    );
  }
}
