import { type AnyColumn, asc, desc, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { certificates } from "@/lib/db/schema";

const VALID_SORT_COLUMNS = ["notBefore", "notAfter", "ctLogTimestamp", "subjectCn", "issuerOrg", "subjectOrg"] as const;

const certificatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(VALID_SORT_COLUMNS).default("notBefore"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const parsed = certificatesQuerySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    sort: params.get("sort") ?? undefined,
    dir: params.get("dir") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.issues }, { status: 400 });
  }

  const { page, limit, sort: sortBy, dir: sortDir } = parsed.data;
  const offset = (page - 1) * limit;

  try {
    const where = buildCertificateConditions(params);

    const sortColumns: Record<string, AnyColumn> = {
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      ctLogTimestamp: certificates.ctLogTimestamp,
      subjectCn: certificates.subjectCn,
      issuerOrg: certificates.issuerOrg,
      subjectOrg: certificates.subjectOrg,
    } as const;
    const sortCol = sortColumns[sortBy];
    const orderFn = sortDir === "asc" ? asc : desc;

    // Single query with count(*) OVER() window function to avoid a separate
    // count round-trip. hasLogo is derived from logotype_svg_hash presence
    // instead of fetching the full SVG body (5-100KB per row).
    const rows = await db
      .select({
        id: certificates.id,
        serialNumber: certificates.serialNumber,
        fingerprintSha256: certificates.fingerprintSha256,
        subjectCn: certificates.subjectCn,
        subjectOrg: certificates.subjectOrg,
        subjectCountry: certificates.subjectCountry,
        issuerOrg: certificates.issuerOrg,
        rootCaOrg: certificates.rootCaOrg,
        certType: certificates.certType,
        markType: certificates.markType,
        notBefore: certificates.notBefore,
        notAfter: certificates.notAfter,
        sanList: certificates.sanList,
        ctLogTimestamp: certificates.ctLogTimestamp,
        logotypeSvgHash: certificates.logotypeSvgHash,
        hasLogo: sql<boolean>`${certificates.logotypeSvg} IS NOT NULL`.as("has_logo"),
        isPrecert: certificates.isPrecert,
        notabilityScore: certificates.notabilityScore,
        companyDescription: certificates.companyDescription,
        industry: certificates.industry,
        createdAt: certificates.createdAt,
        _total: sql<number>`count(*) OVER()`.as("_total"),
      })
      .from(certificates)
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset(offset);

    const total = rows.length > 0 ? rows[0]._total : 0;

    // logoBg was previously computed from the full SVG body. Since we no
    // longer fetch the SVG, we return null and let the client use its own
    // default. A precomputed logo_bg column could be added to the schema
    // for a per-row value without the query cost.
    const data = rows.map(({ _total: _, ...rest }) => ({ ...rest, logoBg: null as string | null }));

    return NextResponse.json(
      {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT },
      },
    );
  } catch (error) {
    return apiError(error, "certificates.api.failed", "/api/certificates", "Failed to fetch certificates");
  }
}
