import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { count, desc, isNotNull } from "drizzle-orm";
import { log } from "@/lib/logger";

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

    return NextResponse.json(
      { industries: rows },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    log("error", "industries.api.failed", { error: String(error), route: "/api/stats/industries" });
    return NextResponse.json({ error: "Failed to fetch industries" }, { status: 500 });
  }
}
