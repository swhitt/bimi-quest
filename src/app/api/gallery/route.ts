import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, and, isNotNull, gte } from "drizzle-orm";
import { log } from "@/lib/logger";
import { CACHE_PRESETS } from "@/lib/cache";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = checkRateLimit(`gallery:${ip}`, { windowMs: 60_000, max: 60 });
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "", 10) || 1);
  const limit = Math.min(
    300,
    Math.max(1, parseInt(params.get("limit") ?? "", 10) || 200)
  );
  const offset = (page - 1) * limit;
  const sort = params.get("sort") === "recent" ? "recent" : "score";
  const minScore = Math.max(0, Math.min(10, parseInt(params.get("minScore") ?? "", 10) || 3));

  try {
    const baseWhere = and(
      isNotNull(certificates.logotypeSvgHash),
      isNotNull(certificates.logotypeSvg),
      isNotNull(certificates.subjectOrg),
      gte(certificates.notabilityScore, minScore)
    );

    // Group by normalized org name (lowercase, trimmed) to deduplicate.
    // Pick the logo and details from the highest-scored certificate per org.
    const normOrg = sql`lower(trim(${certificates.subjectOrg}))`;

    const orderClause = sort === "recent"
      ? sql`max(${certificates.notBefore}) desc`
      : sql`max(${certificates.notabilityScore}) desc nulls last, max(${certificates.notBefore}) desc`;

    // When sorting by recency, pick the most recent cert per org group;
    // when sorting by score, pick the highest-scored cert.
    const pickOrder = sort === "recent"
      ? sql`${certificates.notBefore} DESC, ${certificates.notabilityScore} DESC NULLS LAST`
      : sql`${certificates.notabilityScore} DESC NULLS LAST, ${certificates.notBefore} DESC`;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          fingerprint: sql<string>`(array_agg(${certificates.fingerprintSha256} ORDER BY ${pickOrder}))[1]`.as("fingerprint"),
          svgHash: sql<string>`(array_agg(${certificates.logotypeSvgHash} ORDER BY ${pickOrder}))[1]`.as("svg_hash"),
          svg: sql<string>`(array_agg(${certificates.logotypeSvg} ORDER BY ${pickOrder}))[1]`.as("svg"),
          org: sql<string>`(array_agg(${certificates.subjectOrg} ORDER BY ${pickOrder}))[1]`.as("org"),
          domain: sql<string>`(array_agg(${certificates.sanList}[1] ORDER BY ${pickOrder}))[1]`.as("domain"),
          certType: sql<string>`(array_agg(${certificates.certType} ORDER BY ${pickOrder}))[1]`.as("cert_type"),
          issuer: sql<string>`(array_agg(${certificates.issuerOrg} ORDER BY ${pickOrder}))[1]`.as("issuer"),
          rootCa: sql<string>`(array_agg(${certificates.rootCaOrg} ORDER BY ${pickOrder}))[1]`.as("root_ca"),
          count: sql<number>`count(*)::int`.as("count"),
          score: sql<number>`max(${certificates.notabilityScore})`.as("score"),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(normOrg)
        .orderBy(orderClause)
        .limit(limit)
        .offset(offset),
      db
        .select({
          total: sql<number>`count(distinct ${normOrg})::int`,
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
