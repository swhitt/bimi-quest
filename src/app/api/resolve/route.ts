import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { certificates } from "@/lib/db/schema";
import { asc, desc, sql } from "drizzle-orm";
import { log } from "@/lib/logger";

/**
 * Resolve a domain to its newest certificate, or fall back to validate.
 * Returns { url: "/certificates/abc123..." } or { url: "/validate?domain=..." }
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`resolve:${ip}`, { windowMs: 60_000, max: 60 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  const domain = request.nextUrl.searchParams.get("domain")?.trim();
  if (!domain) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }

  try {
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
  } catch (err) {
    log('error', 'resolve.api.failed', { error: String(err), route: '/api/resolve' });
    return NextResponse.json(
      { error: "Failed to resolve domain" },
      { status: 500 }
    );
  }
}
