import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { dmarcPolicyChanges } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));

  try {
    const rows = await db
      .select({
        domain: dmarcPolicyChanges.domain,
        previousPolicy: dmarcPolicyChanges.previousPolicy,
        newPolicy: dmarcPolicyChanges.newPolicy,
        previousPct: dmarcPolicyChanges.previousPct,
        newPct: dmarcPolicyChanges.newPct,
        detectedAt: dmarcPolicyChanges.detectedAt,
      })
      .from(dmarcPolicyChanges)
      .orderBy(desc(dmarcPolicyChanges.detectedAt))
      .limit(limit);

    return NextResponse.json(
      {
        data: rows.map((r) => ({
          domain: r.domain,
          previousPolicy: r.previousPolicy,
          newPolicy: r.newPolicy,
          previousPct: r.previousPct,
          newPct: r.newPct,
          detectedAt: r.detectedAt?.toISOString() ?? null,
        })),
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT },
      },
    );
  } catch (error) {
    return apiError(error, "dmarc-drift.api.failed", "/api/stats/dmarc-drift", "Failed to fetch DMARC policy changes");
  }
}
