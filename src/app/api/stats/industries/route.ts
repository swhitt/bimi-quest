import { count, desc, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";

export async function GET() {
  try {
    const rows = await db
      .select({
        industry: certificates.industry,
        count: count(),
      })
      .from(certificates)
      .where(isNotNull(certificates.industry))
      .groupBy(certificates.industry)
      .orderBy(desc(count()));

    return NextResponse.json({ industries: rows }, { headers: { "Cache-Control": CACHE_PRESETS.MEDIUM_LONG } });
  } catch (error) {
    return apiError(error, "industries.api.failed", "/api/stats/industries", "Failed to fetch industries");
  }
}
