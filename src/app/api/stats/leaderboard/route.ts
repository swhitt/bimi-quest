import { and, count, desc, isNotNull, max, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { cmcCount, vmcCount } from "@/lib/db/query-fragments";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));
  const offset = (page - 1) * limit;

  try {
    const where = and(buildStatsConditions(params), isNotNull(certificates.subjectOrg));

    const rows = await db
      .select({
        org: certificates.subjectOrg,
        total: count(),
        vmcCount,
        cmcCount,
        activeCerts: count(sql`CASE WHEN ${certificates.notAfter} > NOW() THEN 1 END`),
        industry: max(certificates.industry),
        country: max(certificates.subjectCountry),
        maxNotability: max(certificates.notabilityScore),
        _groupCount: sql<number>`count(*) OVER()`,
      })
      .from(certificates)
      .where(where)
      .groupBy(certificates.subjectOrg)
      .orderBy(desc(count()))
      .limit(limit)
      .offset(offset);

    const totalGroups = rows[0]?._groupCount ?? 0;
    const data = rows.map(({ _groupCount, ...rest }) => rest);

    return NextResponse.json(
      {
        data,
        pagination: {
          total: totalGroups,
          page,
          totalPages: Math.ceil(totalGroups / limit),
          limit,
        },
      },
      { headers: { "Cache-Control": CACHE_PRESETS.MEDIUM } },
    );
  } catch (error) {
    return apiError(error, "leaderboard.api.failed", "/api/stats/leaderboard", "Failed to fetch leaderboard");
  }
}
