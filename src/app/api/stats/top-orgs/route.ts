import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { and, eq, count, desc, max, isNotNull } from "drizzle-orm";
import { buildCommonFilterConditions } from "@/lib/db/filters";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ca = params.get("ca");
  const root = params.get("root");

  try {
    const conditions = buildCommonFilterConditions(params);
    conditions.push(isNotNull(certificates.subjectOrg));
    if (ca) conditions.push(eq(certificates.issuerOrg, ca));
    if (root) conditions.push(eq(certificates.rootCaOrg, root));

    const where = and(...conditions);

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
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
      },
    );
  } catch (error) {
    log("error", "top-orgs.api.failed", { error: String(error), route: "/api/stats/top-orgs" });
    return NextResponse.json({ error: "Failed to fetch top organizations" }, { status: 500 });
  }
}
