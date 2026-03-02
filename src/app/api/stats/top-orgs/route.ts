import { and, count, desc, isNotNull, max } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const where = and(buildStatsConditions(params), isNotNull(certificates.subjectOrg));

    const data = await db
      .select({
        org: certificates.subjectOrg,
        total: count(),
        maxNotability: max(certificates.notabilityScore),
        industry: max(certificates.industry),
        country: max(certificates.subjectCountry),
      })
      .from(certificates)
      .where(where)
      .groupBy(certificates.subjectOrg)
      .orderBy(desc(count()))
      .limit(10);

    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(error, "top-orgs.api.failed", "/api/stats/top-orgs", "Failed to fetch top organizations");
  }
}
