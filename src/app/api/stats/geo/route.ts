import { count, desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { cmcCount, vmcCount } from "@/lib/db/query-fragments";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const where = buildStatsConditions(params);

    const geoData = await db
      .select({
        country: certificates.subjectCountry,
        total: count(),
        vmcCount,
        cmcCount,
      })
      .from(certificates)
      .where(where)
      .groupBy(certificates.subjectCountry)
      .orderBy(desc(count()));

    return NextResponse.json(
      { geoData },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(error, "geo-stats.api.failed", "/api/stats/geo", "Failed to fetch geo data");
  }
}
