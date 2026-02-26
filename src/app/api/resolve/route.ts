import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { asc, desc, sql } from "drizzle-orm";

/**
 * Resolve a domain to its newest certificate, or fall back to validate.
 * Returns { url: "/certificates/abc123..." } or { url: "/validate?domain=..." }
 */
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain")?.trim();
  if (!domain) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }

  const [cert] = await db
    .select({
      fingerprintSha256: certificates.fingerprintSha256,
    })
    .from(certificates)
    .where(
      sql`EXISTS (SELECT 1 FROM unnest(${certificates.sanList}) AS s WHERE lower(s) = ${domain.toLowerCase()})`
    )
    .orderBy(desc(certificates.notBefore), asc(certificates.isPrecert))
    .limit(1);

  if (cert) {
    return NextResponse.json({
      url: `/certificates/${cert.fingerprintSha256.slice(0, 12)}`,
      found: true,
    });
  }

  return NextResponse.json({
    url: `/validate?domain=${encodeURIComponent(domain)}`,
    found: false,
  });
}
