import { type AnyColumn, asc, count, desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { certificates } from "@/lib/db/schema";
import { stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";

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

    const [rows, [totalRow]] = await Promise.all([
      db
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
          logotypeSvg: certificates.logotypeSvg,
          isPrecert: certificates.isPrecert,
          notabilityScore: certificates.notabilityScore,
          companyDescription: certificates.companyDescription,
          industry: certificates.industry,
          createdAt: certificates.createdAt,
        })
        .from(certificates)
        .where(where)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(certificates).where(where),
    ]);

    const total = totalRow?.count || 0;

    const data = rows.map(({ logotypeSvg, ...rest }) => {
      const hasLogo = logotypeSvg != null;
      const stripped = logotypeSvg ? stripWhiteSvgBg(logotypeSvg) : null;
      const logoBg = stripped ? tileBgForSvg(stripped) : null;
      return { ...rest, hasLogo, logoBg };
    });

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
