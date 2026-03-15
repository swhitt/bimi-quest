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
        country: certificates.subjectCountry,
        count: count(),
      })
      .from(certificates)
      .where(isNotNull(certificates.subjectCountry))
      .groupBy(certificates.subjectCountry)
      .orderBy(desc(count()));

    return NextResponse.json({ countries: rows }, { headers: { "Cache-Control": CACHE_PRESETS.MEDIUM_LONG } });
  } catch (error) {
    return apiError(error, "countries.api.failed", "/api/stats/countries", "Failed to fetch countries");
  }
}
