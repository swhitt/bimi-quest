import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { desc, asc, count } from "drizzle-orm";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "", 10) || 50));
  const offset = (page - 1) * limit;

  const sortBy = params.get("sort") || "notBefore";
  const sortDir = params.get("dir") || "desc";

  try {
    const where = buildCertificateConditions(params);

    // Sort column mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      ctLogTimestamp: certificates.ctLogTimestamp,
      subjectCn: certificates.subjectCn,
      issuerOrg: certificates.issuerOrg,
      subjectOrg: certificates.subjectOrg,
    };
    const sortCol = sortColumns[sortBy] || certificates.notBefore;
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
          logotypeSvg: certificates.logotypeSvg,
          isPrecert: certificates.isPrecert,
          notabilityScore: certificates.notabilityScore,
          companyDescription: certificates.companyDescription,
          industry: certificates.industry,
        })
        .from(certificates)
        .where(where)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(certificates).where(where),
    ]);

    const total = totalRow?.count || 0;

    return NextResponse.json(
      {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    log("error", "certificates.api.failed", { error: String(error), route: "/api/certificates" });
    return NextResponse.json({ error: "Failed to fetch certificates" }, { status: 500 });
  }
}
