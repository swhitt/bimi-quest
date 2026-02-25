import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, eq, and, gte, lte, count, desc } from "drizzle-orm";
import { buildPrecertCondition } from "@/lib/db/filters";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ca = params.get("ca");
  const root = params.get("root");
  const certType = params.get("type");
  const from = params.get("from");
  const to = params.get("to");
  const validity = params.get("validity");

  try {
    const conditions = [buildPrecertCondition(params.get("precert"))];

    if (ca) conditions.push(eq(certificates.issuerOrg, ca));
    if (root) conditions.push(eq(certificates.rootCaOrg, root));
    if (certType) conditions.push(eq(certificates.certType, certType));
    if (from) conditions.push(gte(certificates.notBefore, new Date(from)));
    if (to) conditions.push(lte(certificates.notBefore, new Date(to)));
    if (validity === "valid")
      conditions.push(gte(certificates.notAfter, new Date()));
    if (validity === "expired")
      conditions.push(lte(certificates.notAfter, new Date()));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
      .where(where)
      .groupBy(certificates.subjectCountry)
      .orderBy(desc(count()));

    return NextResponse.json({ geoData }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("Geo stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch geo data" },
      { status: 500 }
    );
  }
}
