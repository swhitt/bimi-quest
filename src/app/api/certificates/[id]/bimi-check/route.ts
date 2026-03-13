import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, resolveOrError } from "@/lib/api-utils";
import { isDMARCValidForBIMI, lookupDMARC } from "@/lib/bimi/dmarc";
import { lookupBIMIRecord } from "@/lib/bimi/dns";
import { computeSvgHash, validateSVGTinyPS } from "@/lib/bimi/svg";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { certificates, domainBimiState } from "@/lib/db/schema";
import { safeFetch } from "@/lib/net/safe-fetch";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIP(_request);
  const rl = await checkRateLimit(`bimi-check:${ip}`, { windowMs: 60_000, max: 20 }, _request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);
  const { id: rawId } = await params;

  try {
    const result = await resolveOrError(rawId);
    if (result instanceof NextResponse) return result;
    const certId = result;

    const [cert] = await db
      .select({
        id: certificates.id,
        sanList: certificates.sanList,
        subjectCn: certificates.subjectCn,
        logotypeSvg: certificates.logotypeSvg,
        logotypeSvgHash: certificates.logotypeSvgHash,
        notBefore: certificates.notBefore,
        notAfter: certificates.notAfter,
        markType: certificates.markType,
        certType: certificates.certType,
      })
      .from(certificates)
      .where(eq(certificates.id, certId))
      .limit(1);

    if (!cert) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    const domains = cert.sanList.length > 0 ? cert.sanList : cert.subjectCn ? [cert.subjectCn] : [];

    // Validate cert-embedded SVG
    let certSvgValidation = null;
    if (cert.logotypeSvg) {
      certSvgValidation = validateSVGTinyPS(cert.logotypeSvg);
    }

    // Check cert validity
    const now = new Date();
    const certValidity = {
      isExpired: cert.notAfter < now,
      isNotYetValid: cert.notBefore > now,
      daysRemaining: Math.ceil((cert.notAfter.getTime() - now.getTime()) / 86400_000),
      markType: cert.markType,
      certType: cert.certType,
    };

    // Check BIMI DNS records for each domain (limit to first 5 to avoid slow responses)
    const domainChecks = await Promise.all(
      domains.slice(0, 5).map(async (domain) => {
        try {
          // Check cached state first
          const [cachedState] = await db
            .select()
            .from(domainBimiState)
            .where(eq(domainBimiState.domain, domain))
            .limit(1);

          let bimiRecordRaw: string | null = cachedState?.bimiRecordRaw || null;
          let logoUrl: string | null = cachedState?.bimiLogoUrl || null;
          let authorityUrl: string | null = cachedState?.bimiAuthorityUrl || null;
          let dmarcPolicy: string | null = cachedState?.dmarcPolicy || null;
          let dmarcValid: boolean | null = cachedState?.dmarcValid ?? null;
          let dmarcRecordRaw: string | null = cachedState?.dmarcRecordRaw || null;
          let bimiRecordCount: number | null = cachedState?.bimiRecordCount ?? null;
          let dmarcRecordCount: number | null = cachedState?.dmarcRecordCount ?? null;

          // If no cached state, do live DNS lookups
          if (!cachedState) {
            const [bimiLookup, dmarcLookup] = await Promise.all([lookupBIMIRecord(domain), lookupDMARC(domain)]);

            bimiRecordCount = bimiLookup.recordCount;
            dmarcRecordCount = dmarcLookup.recordCount;

            if (bimiLookup.record) {
              bimiRecordRaw = bimiLookup.record.raw;
              logoUrl = bimiLookup.record.logoUrl;
              authorityUrl = bimiLookup.record.authorityUrl;
            }

            if (dmarcLookup.record) {
              dmarcRecordRaw = dmarcLookup.record.raw;
              dmarcPolicy = dmarcLookup.record.policy;
              dmarcValid = isDMARCValidForBIMI(dmarcLookup.record, dmarcLookup.isSubdomain);
            }
          }

          let webSvgContent: string | null = null;
          let webSvgValidation = null;
          let svgMatch: boolean | null = null;

          // Fetch and validate the web SVG if we have a logo URL
          if (logoUrl) {
            try {
              const res = await safeFetch(logoUrl, {
                headers: {
                  "User-Agent": "bimi-quest/1.0 (BIMI Validator)",
                  Accept: "image/svg+xml",
                },
                signal: AbortSignal.timeout(10_000),
              });
              if (res.ok) {
                // Handle SVGZ (gzipped SVG) responses
                const rawBuf = Buffer.from(await res.arrayBuffer());
                if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
                  // Gzip magic bytes detected — decompress
                  const { gunzipSync } = await import("node:zlib");
                  webSvgContent = gunzipSync(rawBuf).toString("utf-8");
                } else {
                  webSvgContent = rawBuf.toString("utf-8");
                }
                if (webSvgContent.includes("<svg") || webSvgContent.includes("<SVG")) {
                  webSvgValidation = validateSVGTinyPS(webSvgContent);
                  // Hash-based comparison: consistent with validate.ts SHA-256 approach
                  if (cert.logotypeSvgHash && webSvgContent) {
                    const webSvgHash = computeSvgHash(webSvgContent);
                    svgMatch = cert.logotypeSvgHash === webSvgHash;
                  }
                }
              }
            } catch {
              // Timeout or fetch error
            }
          }

          return {
            domain,
            bimiRecord: bimiRecordRaw,
            bimiRecordCount,
            dmarcRecord: dmarcRecordRaw,
            dmarcRecordCount,
            logoUrl,
            authorityUrl,
            dmarcPolicy,
            dmarcValid,
            webSvgFound: !!webSvgContent,
            webSvgValidation,
            webSvgSizeBytes: webSvgContent ? new TextEncoder().encode(webSvgContent).length : null,
            svgMatch,
            webSvgSource: svgMatch === false ? webSvgContent : null,
          };
        } catch {
          return {
            domain,
            bimiRecord: null,
            bimiRecordCount: null,
            dmarcRecord: null,
            dmarcRecordCount: null,
            logoUrl: null,
            authorityUrl: null,
            dmarcPolicy: null,
            dmarcValid: null,
            webSvgFound: false,
            webSvgValidation: null,
            webSvgSizeBytes: null,
            svgMatch: null,
            webSvgSource: null,
          };
        }
      }),
    );

    return NextResponse.json(
      {
        certSvgValidation,
        certValidity,
        certSvgHash: cert.logotypeSvgHash,
        certSvgSizeBytes: cert.logotypeSvg ? new TextEncoder().encode(cert.logotypeSvg).length : null,
        domains: domainChecks,
      },
      {
        headers: {
          ...rl.headers,
          "Cache-Control": CACHE_PRESETS.MEDIUM_LONG,
        },
      },
    );
  } catch (error) {
    return apiError(error, "bimi-check.api.failed", "/api/certificates/[id]/bimi-check", "Failed to run BIMI check");
  }
}
