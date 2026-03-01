import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates, domainBimiState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateSVGTinyPS } from "@/lib/bimi/svg";
import { lookupBIMIRecord } from "@/lib/bimi/dns";
import { lookupDMARC, isDMARCValidForBIMI } from "@/lib/bimi/dmarc";
import { safeFetch } from "@/lib/net/safe-fetch";
import { resolveCertParam } from "@/lib/db/filters";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIP(_request);
  const rl = await checkRateLimit(`bimi-check:${ip}`, { windowMs: 60_000, max: 20 }, _request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);
  const { id: rawId } = await params;

  try {
    const { id: certId, error } = await resolveCertParam(rawId);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });
    if (!certId) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

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

          // If no cached state, do live DNS lookups
          if (!cachedState) {
            const [bimiRecord, dmarcLookup] = await Promise.all([lookupBIMIRecord(domain), lookupDMARC(domain)]);

            if (bimiRecord) {
              bimiRecordRaw = bimiRecord.raw;
              logoUrl = bimiRecord.logoUrl;
              authorityUrl = bimiRecord.authorityUrl;
            }

            if (dmarcLookup) {
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
                webSvgContent = await res.text();
                if (webSvgContent.includes("<svg") || webSvgContent.includes("<SVG")) {
                  webSvgValidation = validateSVGTinyPS(webSvgContent);
                  if (cert.logotypeSvg && webSvgContent) {
                    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
                    svgMatch = normalize(cert.logotypeSvg) === normalize(webSvgContent);
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
            dmarcRecord: dmarcRecordRaw,
            logoUrl,
            authorityUrl,
            dmarcPolicy,
            dmarcValid,
            webSvgFound: !!webSvgContent,
            webSvgValidation,
            webSvgSizeBytes: webSvgContent ? new TextEncoder().encode(webSvgContent).length : null,
            svgMatch,
            // Include web SVG source on mismatch so the client can render a diff
            webSvgSource: svgMatch === false ? webSvgContent : null,
          };
        } catch {
          return {
            domain,
            bimiRecord: null,
            dmarcRecord: null,
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
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    log("error", "bimi-check.api.failed", { error: String(error), route: "/api/certificates/[id]/bimi-check" });
    return NextResponse.json({ error: "Failed to run BIMI check" }, { status: 500 });
  }
}
