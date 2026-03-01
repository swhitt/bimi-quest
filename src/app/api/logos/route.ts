import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, and, isNotNull, gte, lte } from "drizzle-orm";
import { log } from "@/lib/logger";
import { CACHE_PRESETS } from "@/lib/cache";
import { serverTiming } from "@/lib/server-timing";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`gallery:${ip}`, { windowMs: 60_000, max: 60 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "", 10) || 1);
  const limit = Math.min(
    300,
    Math.max(1, parseInt(params.get("limit") ?? "", 10) || 200)
  );
  const offset = (page - 1) * limit;
  const sortRaw = params.get("sort");
  const sort = sortRaw === "recent" ? "recent" : sortRaw === "quality" ? "quality" : "score";
  const minScore = Math.max(0, Math.min(10, parseInt(params.get("minScore") ?? "", 10) || 1));
  const maxScoreRaw = params.get("maxScore");
  const maxScore = maxScoreRaw ? Math.max(0, Math.min(10, parseInt(maxScoreRaw, 10))) : null;
  const minColorRichnessRaw = params.get("minColorRichness");
  const minColorRichness = minColorRichnessRaw ? Math.max(1, Math.min(10, parseInt(minColorRichnessRaw, 10))) : null;
  const minLogoQualityRaw = params.get("minLogoQuality");
  const minLogoQuality = minLogoQualityRaw ? Math.max(1, Math.min(10, parseInt(minLogoQualityRaw, 10))) : null;
  const dedupSvg = params.get("dedupSvg") === "true";

  const timing = serverTiming();
  try {
    const globalFilters = buildCertificateConditions(params);
    const baseWhere = and(
      isNotNull(certificates.logotypeSvgHash),
      isNotNull(certificates.logotypeSvg),
      isNotNull(certificates.subjectOrg),
      gte(certificates.notabilityScore, minScore),
      ...(maxScore !== null ? [lte(certificates.notabilityScore, maxScore)] : []),
      ...(minColorRichness !== null ? [gte(certificates.logoColorRichness, minColorRichness)] : []),
      ...(minLogoQuality !== null ? [gte(certificates.logoQualityScore, minLogoQuality)] : []),
      globalFilters
    );

    // Group by org name or SVG hash depending on dedup mode.
    // Default groups by org (different orgs sharing the same SVG appear as separate rows).
    // dedupSvg groups by SVG hash (only one row per unique visual logo).
    const groupExpr = dedupSvg
      ? sql`COALESCE(${certificates.logotypeVisualHash}, ${certificates.logotypeSvgHash})`
      : sql`lower(trim(${certificates.subjectOrg}))`;

    const orderClause = sort === "recent"
      ? sql`max(${certificates.notBefore}) desc`
      : sort === "quality"
      ? sql`max(${certificates.logoQualityScore}) desc nulls last, max(${certificates.notabilityScore}) desc nulls last`
      : sql`max(${certificates.notabilityScore}) desc nulls last, max(${certificates.notBefore}) desc`;

    // Determines which cert is "representative" within each org group
    const pickOrder = sort === "recent"
      ? sql`${certificates.notBefore} DESC, ${certificates.notabilityScore} DESC NULLS LAST`
      : sort === "quality"
      ? sql`${certificates.logoQualityScore} DESC NULLS LAST, ${certificates.notabilityScore} DESC NULLS LAST`
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
          logoQuality: sql<number>`(array_agg(${certificates.logoQualityScore} ORDER BY ${pickOrder}))[1]`.as("logo_quality"),
          ctLogTimestamp: sql<string>`(array_agg(${certificates.ctLogTimestamp} ORDER BY ${pickOrder}))[1]`.as("ct_log_timestamp"),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(groupExpr)
        .orderBy(orderClause)
        .limit(limit)
        .offset(offset),
      db
        .select({
          total: sql<number>`count(distinct ${groupExpr})::int`,
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
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM, "Server-Timing": timing.header("db") },
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
