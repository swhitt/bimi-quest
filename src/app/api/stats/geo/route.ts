import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, eq, count, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const ca = request.nextUrl.searchParams.get("ca");

  try {
    const conditions = ca ? eq(certificates.issuerOrg, ca) : undefined;

    const geoData = await db
      .select({
        country: certificates.subjectCountry,
        total: count(),
        vmcCount: count(
          sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`
        ),
        cmcCount: count(
          sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`
        ),
      })
      .from(certificates)
      .where(conditions)
      .groupBy(certificates.subjectCountry)
      .orderBy(desc(count()));

    return NextResponse.json({ geoData });
  } catch (error) {
    console.error("Geo stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch geo data" },
      { status: 500 }
    );
  }
}
