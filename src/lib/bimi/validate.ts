import { lookupBIMIRecord, type BIMIRecord } from "./dns";
import { lookupDMARC, isDMARCValidForBIMI, type DMARCRecord } from "./dmarc";
import { validateSVGTinyPS, type SVGValidationResult } from "./svg";

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
  const dmarcRecord = await lookupDMARC(domain);
  let dmarcValid = false;
  if (!dmarcRecord) {
    errors.push(`No DMARC record found at _dmarc.${domain}`);
  } else {
    dmarcValid = isDMARCValidForBIMI(dmarcRecord);
    if (!dmarcValid) {
      errors.push(
        `DMARC policy does not meet BIMI requirements (need p=quarantine or p=reject with pct=100, got p=${dmarcRecord.policy} pct=${dmarcRecord.pct})`
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
    try {
      const res = await fetch(bimiRecord.logoUrl, {
        headers: { "User-Agent": "bimi-intel/1.0 (BIMI Validator)" },
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
    try {
      const res = await fetch(bimiRecord.authorityUrl, {
        headers: { "User-Agent": "bimi-intel/1.0 (BIMI Validator)" },
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

/** Extract basic info from a PEM certificate (best effort, no full parser) */
function parsePemBasicInfo(
  pem: string
): {
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  certType: string | null;
} | null {
  try {
    // Use @peculiar/x509 if available in the context
    const { X509Certificate } = require("@peculiar/x509");
    const b64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const der = Buffer.from(b64, "base64");
    const cert = new X509Certificate(der);

    // Check for BIMI mark type OID
    const markTypeExt = cert.extensions.find(
      (e: { type: string }) => e.type === "1.3.6.1.4.1.53087.1.13"
    );
    let certType: string | null = null;
    if (markTypeExt) certType = "VMC";
    else if (
      cert.extensions.some(
        (e: { type: string }) => e.type === "1.3.6.1.5.5.7.1.12"
      )
    ) {
      certType = "CMC";
    }

    return {
      issuer: cert.issuer,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      certType,
    };
  } catch {
    return null;
  }
}
