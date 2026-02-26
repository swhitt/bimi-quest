import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, isNotNull } from "drizzle-orm";
import { log } from "@/lib/logger";
import { CACHE_PRESETS } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "", 10) || 1);
  const limit = Math.min(
    120,
    Math.max(1, parseInt(params.get("limit") ?? "", 10) || 60)
  );
  const offset = (page - 1) * limit;

  try {
    const baseWhere = isNotNull(certificates.logotypeSvgHash);

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          svgHash: certificates.logotypeSvgHash,
          svg: sql<string>`min(${certificates.logotypeSvg})`.as("svg"),
          org: sql<string>`min(${certificates.subjectOrg})`.as("org"),
          domain: sql<string>`min(${certificates.sanList}[1])`.as("domain"),
          certType: sql<string>`min(${certificates.certType})`.as("cert_type"),
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(certificates.logotypeSvgHash)
        .orderBy(sql`count(*) desc`)
        .limit(limit)
        .offset(offset),
      db
        .select({
          total: sql<number>`count(distinct ${certificates.logotypeSvgHash})::int`,
        })
        .from(certificates)
        .where(baseWhere),
    ]);

    const total = totalRow?.total || 0;

    return NextResponse.json(
      {
        logos: rows,
        total,
        page,
        limit,
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      }
    );
  } catch (error) {
    log("error", "gallery.api.failed", {
      error: String(error),
      route: "/api/gallery",
    });
    return NextResponse.json(
      { error: "Failed to fetch gallery" },
      { status: 500 }
    );
  }
}
