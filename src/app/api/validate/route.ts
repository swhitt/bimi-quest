import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestFromPem } from "@/lib/bimi/ingest-from-pem";
import { validateDomain } from "@/lib/bimi/validate";
import { db } from "@/lib/db";
import { domainBimiState } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";

// Vercel serverless function timeout — validation does multiple external fetches
// (DNS, SVG, certificate) so it needs more than the default 10s.
export const maxDuration = 30;

const validateBodySchema = z.object({
  domain: z.string().trim().toLowerCase(),
  selector: z.string().trim().toLowerCase().default("default"),
  localPart: z.string().trim().toLowerCase().optional(),
  receiverDomains: z.array(z.string().trim().toLowerCase()).max(10).optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`validate:${ip}`, { windowMs: 60_000, max: 10 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: rl.headers });
    }
    const parsed = validateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400, headers: rl.headers },
      );
    }
    let { domain } = parsed.data;
    const { selector, receiverDomains } = parsed.data;
    let { localPart } = parsed.data;

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    // Accept email addresses by extracting the domain and local-part
    if (domain.includes("@")) {
      const parts = domain.split("@");
      if (!localPart && parts.length === 2 && parts[0]) {
        localPart = parts[0];
      }
      domain = parts.pop() || "";
    }

    // Domain format validation: max 253 chars, each label checked individually to avoid ReDoS
    if (domain.length > 253) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }
    const labels = domain.split(".");
    const labelPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (labels.length < 2 || labels.some((l) => l.length === 0 || l.length > 63 || !labelPattern.test(l))) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const result = await validateDomain({ domain, selector, localPart, receiverDomains });

    // If we found a valid cert, try to ingest it (fire-and-forget)
    if (result.certificate.found && result.certificate.rawPem) {
      ingestFromPem(result.certificate.rawPem, "validation").catch((err) => console.warn("ingestFromPem failed:", err));
    }

    // Persist DNS snapshot and validation state (fire-and-forget)
    db.insert(domainBimiState)
      .values({
        domain: result.domain,
        bimiRecordRaw: result.bimi.record?.raw ?? null,
        bimiVersion: result.bimi.record?.version ?? null,
        bimiLogoUrl: result.bimi.record?.logoUrl ?? null,
        bimiAuthorityUrl: result.bimi.record?.authorityUrl ?? null,
        bimiLpsTag: result.bimi.lps,
        bimiAvpTag: result.bimi.avp,
        bimiDeclination: result.bimi.declined,
        bimiSelector: result.bimi.selector,
        bimiOrgDomainFallback: result.bimi.orgDomainFallback,
        dmarcRecordRaw: result.dmarc.record?.raw ?? null,
        dmarcPolicy: result.dmarc.record?.policy ?? null,
        dmarcPct: result.dmarc.record?.pct ?? null,
        dmarcValid: result.dmarc.validForBIMI,
        svgFetched: result.svg.found,
        svgSizeBytes: result.svg.sizeBytes,
        svgTinyPsValid: result.svg.validation?.valid ?? null,
        svgValidationErrors: result.svg.validation?.errors ?? null,
        svgIndicatorHash: result.svg.indicatorHash,
        bimiGrade: result.grade,
        dnsSnapshot: result.dnsSnapshot,
        lastChecked: result.timestamp,
      })
      .onConflictDoUpdate({
        target: domainBimiState.domain,
        set: {
          bimiRecordRaw: result.bimi.record?.raw ?? null,
          bimiVersion: result.bimi.record?.version ?? null,
          bimiLogoUrl: result.bimi.record?.logoUrl ?? null,
          bimiAuthorityUrl: result.bimi.record?.authorityUrl ?? null,
          bimiLpsTag: result.bimi.lps,
          bimiAvpTag: result.bimi.avp,
          bimiDeclination: result.bimi.declined,
          bimiSelector: result.bimi.selector,
          bimiOrgDomainFallback: result.bimi.orgDomainFallback,
          dmarcRecordRaw: result.dmarc.record?.raw ?? null,
          dmarcPolicy: result.dmarc.record?.policy ?? null,
          dmarcPct: result.dmarc.record?.pct ?? null,
          dmarcValid: result.dmarc.validForBIMI,
          svgFetched: result.svg.found,
          svgSizeBytes: result.svg.sizeBytes,
          svgTinyPsValid: result.svg.validation?.valid ?? null,
          svgValidationErrors: result.svg.validation?.errors ?? null,
          svgIndicatorHash: result.svg.indicatorHash,
          bimiGrade: result.grade,
          dnsSnapshot: result.dnsSnapshot,
          lastChecked: result.timestamp,
          updatedAt: sql`now()`,
        },
      })
      .catch((err) => console.warn("domainBimiState upsert failed:", err));

    // Strip rawPem from the response (internal use only)
    const { rawPem: _, ...certWithoutPem } = result.certificate;
    return NextResponse.json({ ...result, certificate: certWithoutPem }, { headers: rl.headers });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Validation failed: ${error.message}`
        : "Validation failed due to an unexpected internal error";
    log("error", "validate.api.failed", { error: String(error), route: "/api/validate" });
    return NextResponse.json({ error: message }, { status: 500, headers: rl.headers });
  }
}
