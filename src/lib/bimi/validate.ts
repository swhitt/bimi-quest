import { lookupBIMIRecord, type BIMIRecord } from "./dns";
import { lookupDMARC, isDMARCValidForBIMI, type DMARCRecord } from "./dmarc";
import { validateSVGTinyPS, type SVGValidationResult } from "./svg";
import { isPrivateHostname } from "@/lib/net/hostname";

export interface BIMIValidationResult {
  domain: string;
  timestamp: Date;
  bimi: {
    found: boolean;
    record: BIMIRecord | null;
  };
  dmarc: {
    found: boolean;
    record: DMARCRecord | null;
    validForBIMI: boolean;
  };
  svg: {
    found: boolean;
    url: string | null;
    validation: SVGValidationResult | null;
    sizeBytes: number | null;
  };
  certificate: {
    found: boolean;
    authorityUrl: string | null;
    certType: string | null;
    issuer: string | null;
    validFrom: Date | null;
    validTo: Date | null;
    isExpired: boolean | null;
  };
  overallValid: boolean;
  errors: string[];
}

/** Run full BIMI validation for a domain */
export async function validateDomain(
  domain: string
): Promise<BIMIValidationResult> {
  const errors: string[] = [];
  const now = new Date();

  // 1. BIMI DNS record
  const bimiRecord = await lookupBIMIRecord(domain);
  if (!bimiRecord) {
    errors.push(`No BIMI record found at default._bimi.${domain}`);
  }

  // 2. DMARC record
  const dmarcLookup = await lookupDMARC(domain);
  const dmarcRecord = dmarcLookup?.record ?? null;
  let dmarcValid = false;
  if (!dmarcRecord) {
    errors.push(`No DMARC record found at _dmarc.${domain}`);
  } else {
    dmarcValid = isDMARCValidForBIMI(dmarcRecord, dmarcLookup!.isSubdomain);
    if (!dmarcValid) {
      const effectiveTag = dmarcLookup!.isSubdomain && dmarcRecord.sp
        ? `sp=${dmarcRecord.sp}`
        : `p=${dmarcRecord.policy}`;
      errors.push(
        `DMARC policy does not meet BIMI requirements (need p=quarantine or p=reject with pct=100, got ${effectiveTag} pct=${dmarcRecord.pct})`
      );
    }
  }

  // 3. SVG logo
  let svgResult: {
    found: boolean;
    url: string | null;
    validation: SVGValidationResult | null;
    sizeBytes: number | null;
  } = { found: false, url: null, validation: null, sizeBytes: null };

  if (bimiRecord?.logoUrl) {
    const parsedLogoUrl = new URL(bimiRecord.logoUrl);
    if (isPrivateHostname(parsedLogoUrl.hostname)) {
      errors.push("Refusing to fetch from private/internal host");
    } else {
      try {
        const res = await fetch(bimiRecord.logoUrl, {
          headers: { "User-Agent": "bimi-intel/1.0 (BIMI Validator)" },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const svgText = await res.text();
          const validation = validateSVGTinyPS(svgText);
          svgResult = {
            found: true,
            url: bimiRecord.logoUrl,
            validation,
            sizeBytes: new TextEncoder().encode(svgText).length,
          };
          if (!validation.valid) {
            errors.push(
              `SVG validation failed: ${validation.errors.join("; ")}`
            );
          }
        } else {
          errors.push(
            `Failed to fetch SVG logo: HTTP ${res.status} from ${bimiRecord.logoUrl}`
          );
        }
      } catch (err) {
        errors.push(
          `Failed to fetch SVG logo: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }
  }

  // 4. Authority certificate (VMC/CMC)
  let certResult: BIMIValidationResult["certificate"] = {
    found: false,
    authorityUrl: null,
    certType: null,
    issuer: null,
    validFrom: null,
    validTo: null,
    isExpired: null,
  };

  if (bimiRecord?.authorityUrl) {
    const parsedAuthUrl = new URL(bimiRecord.authorityUrl);
    if (isPrivateHostname(parsedAuthUrl.hostname)) {
      errors.push("Refusing to fetch from private/internal host");
    } else {
      try {
        const res = await fetch(bimiRecord.authorityUrl, {
          headers: { "User-Agent": "bimi-intel/1.0 (BIMI Validator)" },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const pemText = await res.text();
          // Basic PEM parsing to extract validity info
          const certInfo = parsePemBasicInfo(pemText);
          if (certInfo) {
            certResult = {
              found: true,
              authorityUrl: bimiRecord.authorityUrl,
              certType: certInfo.certType,
              issuer: certInfo.issuer,
              validFrom: certInfo.notBefore,
              validTo: certInfo.notAfter,
              isExpired: certInfo.notAfter < now,
            };
            if (certInfo.notAfter < now) {
              errors.push("BIMI certificate is expired");
            }
            // Verify the certificate's SANs actually cover the domain
            if (certInfo.sans.length > 0) {
              const covered = certInfo.sans.some((san) => sanCoversDomain(san, domain));
              if (!covered) {
                errors.push(
                  `Certificate does not cover domain ${domain} (SANs: ${certInfo.sans.join(", ")})`
                );
              }
            }
          }
        } else {
          errors.push(
            `Failed to fetch authority certificate: HTTP ${res.status}`
          );
        }
      } catch (err) {
        errors.push(
          `Failed to fetch authority certificate: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }
  }

  const overallValid =
    bimiRecord !== null && dmarcValid && svgResult.found && errors.length === 0;

  return {
    domain,
    timestamp: now,
    bimi: { found: bimiRecord !== null, record: bimiRecord },
    dmarc: { found: dmarcRecord !== null, record: dmarcRecord, validForBIMI: dmarcValid },
    svg: svgResult,
    certificate: certResult,
    overallValid,
    errors,
  };
}

/** Check if a certificate SAN covers the given domain (exact or wildcard match) */
function sanCoversDomain(san: string, domain: string): boolean {
  const sanLower = san.toLowerCase();
  const domLower = domain.toLowerCase();

  if (sanLower === domLower) return true;

  // Wildcard: *.example.com matches mail.example.com but not example.com
  // or sub.mail.example.com (only one level)
  if (sanLower.startsWith("*.")) {
    const sanBase = sanLower.slice(2);
    const dotIdx = domLower.indexOf(".");
    if (dotIdx !== -1 && domLower.slice(dotIdx + 1) === sanBase) {
      return true;
    }
  }

  return false;
}

/** Extract basic info from a PEM certificate (best effort, no full parser) */
function parsePemBasicInfo(
  pem: string
): {
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  certType: string | null;
  markType: string | null;
  sans: string[];
} | null {
  try {
    const { X509Certificate } = require("@peculiar/x509");
    const b64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const der = Buffer.from(b64, "base64");
    const cert = new X509Certificate(der);

    // Mark type is a subject DN field, not a standalone extension
    const MARK_TYPE_OID = "1.3.6.1.4.1.53087.1.13";
    const markType = extractDnField(cert.subject, MARK_TYPE_OID);

    let certType: string | null = null;
    if (markType) {
      const vmcTypes = ["Registered Mark", "Government Mark"];
      certType = vmcTypes.some((t) => markType.includes(t)) ? "VMC" : "CMC";
    }

    // Extract Subject Alternative Names (DNS names)
    const sans: string[] = [];
    try {
      const { SubjectAlternativeNameExtension } = require("@peculiar/x509");
      const sanExt = cert.getExtension(SubjectAlternativeNameExtension);
      if (sanExt) {
        for (const name of sanExt.names.items) {
          if (name.type === "dns") {
            sans.push(name.value);
          }
        }
      }
    } catch {
      // SAN parsing failed, leave empty
    }

    return {
      issuer: cert.issuer,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      certType,
      markType,
      sans,
    };
  } catch {
    return null;
  }
}

function extractDnField(dn: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|,)\\s*${escaped}=((?:[^,\\\\]|\\\\.)*)`, "i");
  const match = dn.match(regex);
  if (!match) return null;
  return match[1].replace(/\\(.)/g, "$1").trim();
}
