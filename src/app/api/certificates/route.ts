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
import { buildPrecertCondition, parseDate } from "@/lib/db/filters";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "", 10) || 50));
  const offset = (page - 1) * limit;

  const ca = params.get("ca");
  const root = params.get("root");
  const certType = params.get("type");
  const mark = params.get("mark");
  const from = params.get("from");
  const to = params.get("to");
  const country = params.get("country");
  const search = params.get("search");
  const host = params.get("host");
  const org = params.get("org");
  const sortBy = params.get("sort") || "notBefore";
  const sortDir = params.get("dir") || "desc";
  const validity = params.get("validity");

  try {
    const conditions = [buildPrecertCondition(params.get("precert"))];

    if (ca) conditions.push(eq(certificates.issuerOrg, ca));
    if (root) conditions.push(eq(certificates.rootCaOrg, root));
    if (certType) conditions.push(eq(certificates.certType, certType));
    if (mark) conditions.push(eq(certificates.markType, mark));
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (fromDate) conditions.push(gte(certificates.notBefore, fromDate));
    if (toDate) conditions.push(lte(certificates.notBefore, toDate));
    if (country) conditions.push(eq(certificates.subjectCountry, country));
    if (host) conditions.push(sql`${certificates.sanList} @> ARRAY[${host.toLowerCase()}]::text[]`);
    if (org) conditions.push(sql`LOWER(${certificates.subjectOrg}) = LOWER(${org})`);

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
          // TODO: logotypeSvg is large and should be lazy-loaded per-row in the future
          logotypeSvg: certificates.logotypeSvg,
          isPrecert: certificates.isPrecert,
          notabilityScore: certificates.notabilityScore,
          companyDescription: certificates.companyDescription,
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
    log('error', 'certificates.api.failed', { error: String(error), route: '/api/certificates' });
    return NextResponse.json(
      { error: "Failed to fetch certificates" },
      { status: 500 }
    );
  }
}
