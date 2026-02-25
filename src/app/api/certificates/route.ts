import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import {
  eq,
  and,
  gte,
  lte,
  desc,
  asc,
  ilike,
  count,
  sql,
  or,
} from "drizzle-orm";
import { excludeDuplicatePrecerts } from "@/lib/db/filters";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const page = parseInt(params.get("page") || "1");
  const limit = Math.min(parseInt(params.get("limit") || "50"), 100);
  const offset = (page - 1) * limit;

  const ca = params.get("ca");
  const certType = params.get("type");
  const from = params.get("from");
  const to = params.get("to");
  const country = params.get("country");
  const search = params.get("search");
  const sortBy = params.get("sort") || "notBefore";
  const sortDir = params.get("dir") || "desc";
  const validity = params.get("validity");

  try {
    const conditions = [excludeDuplicatePrecerts()];

    if (ca) {
      conditions.push(
        or(
          eq(certificates.rootCaOrg, ca),
          eq(certificates.issuerOrg, ca)
        )!
      );
    }
    if (certType) conditions.push(eq(certificates.certType, certType));
    if (from) conditions.push(gte(certificates.notBefore, new Date(from)));
    if (to) conditions.push(lte(certificates.notBefore, new Date(to)));
    if (country) conditions.push(eq(certificates.subjectCountry, country));

    if (search) {
      conditions.push(
        or(
          ilike(certificates.subjectCn, `%${search}%`),
          ilike(certificates.subjectOrg, `%${search}%`),
          sql`EXISTS (SELECT 1 FROM unnest(${certificates.sanList}) AS s WHERE s ILIKE ${`%${search}%`})`
        )!
      );
    }

    if (validity === "valid") {
      conditions.push(gte(certificates.notAfter, new Date()));
    } else if (validity === "expired") {
      conditions.push(lte(certificates.notAfter, new Date()));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Sort column mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
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
        })
        .from(certificates)
        .where(where)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(certificates).where(where),
    ]);

    const total = totalRow?.count || 0;

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Certificates API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch certificates" },
      { status: 500 }
    );
  }
}
