import { and, count, desc, gte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildStatsConditions } from "@/lib/db/filters";
import { cmcCount, vmcCount } from "@/lib/db/query-fragments";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const months = Math.max(1, parseInt(params.get("months") ?? "", 10) || 12);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  try {
    const where = buildStatsConditions(params);

    const monthTrunc = sql`date_trunc('month', ${certificates.notBefore})`;
    const monthLabel = sql<string>`to_char(date_trunc('month', ${certificates.notBefore}), 'YYYY-MM')`;

    const [trends, topCAs] = await Promise.all([
      db
        .select({
          month: monthLabel.as("month"),
          ca: certificates.rootCaOrg,
          total: count(),
          vmcCount,
          cmcCount,
        })
        .from(certificates)
        .where(and(where, gte(certificates.notBefore, cutoff)))
        .groupBy(monthTrunc, certificates.rootCaOrg)
        .orderBy(monthTrunc),

      // Top CAs by volume (grouped by root)
      db
        .select({
          ca: certificates.rootCaOrg,
          total: count(),
        })
        .from(certificates)
        .where(where)
        .groupBy(certificates.rootCaOrg)
        .orderBy(desc(count()))
        .limit(10),
    ]);

    return NextResponse.json(
      { trends, topCAs },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(error, "ca-trends.api.failed", "/api/stats/ca-trends", "Failed to fetch trends");
  }
}
