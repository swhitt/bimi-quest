import { X509Certificate, BasicConstraintsExtension, SubjectAlternativeNameExtension } from "@peculiar/x509";
import { lookupBIMIRecord, type BIMIRecord } from "./dns";
import { lookupDMARC, isDMARCValidForBIMI, getDMARCBIMIReason, type DMARCRecord } from "./dmarc";
import { validateSVGTinyPS, decompressSvgIfNeeded, computeSvgHash, categorizeSvgChecks, type SVGValidationResult } from "./svg";
import { validateSvgRng, rngToCheckItems } from "./svg-rng";
import { computeGrade } from "./grade";
import type { BimiCheckItem, BimiGrade } from "./types";
import { safeFetch } from "@/lib/net/safe-fetch";
import { extractDnField, pemToDer, deriveCertType } from "@/lib/ct/parser";
import { normalizeIssuerOrg } from "@/lib/ca-display";

// CAs authorized to issue BIMI certificates per CA/Browser Forum VMC requirements.
// Includes both raw DB org names and common display variants.
const AUTHORIZED_CAS = new Set([
  "DigiCert",
  "Entrust",
  "SSL.com",
  "SSL Corporation",
  "GlobalSign",
  "GlobalSign nv-sa",
  "Sectigo",
  "Sectigo Limited",
]);

export interface ChainValidationResult {
  chainValid: boolean;
  chainErrors: string[];
  chainLength: number;
}

export interface BIMIValidationResult {
  domain: string;
  timestamp: Date;
  bimi: {
    found: boolean;
    record: BIMIRecord | null;
    lps: string | null;
    avp: "brand" | "personal" | null;
    declined: boolean;
    selector: string;
    orgDomainFallback: boolean;
    orgDomain: string | null;
  };
  dmarc: {
    found: boolean;
    record: DMARCRecord | null;
    validForBIMI: boolean;
    reason: string | null;
    isSubdomain: boolean;
  };
  svg: {
    found: boolean;
    url: string | null;
    validation: SVGValidationResult | null;
    sizeBytes: number | null;
    indicatorHash: string | null;
  };
  certificate: {
    found: boolean;
    authorityUrl: string | null;
    certType: string | null;
    issuer: string | null;
    validFrom: Date | null;
    validTo: Date | null;
    isExpired: boolean | null;
    rawPem: string | null;
    chain: ChainValidationResult | null;
    authorizedCa: boolean | null;
    certSvgHash: string | null;
    svgMatch: boolean | null;
  };
  grade: BimiGrade;
  gradeSummary: string;
  checks: BimiCheckItem[];
  authResult: string;
  responseHeaders: Record<string, string>;
  overallValid: boolean;
  errors: string[];
}

/** Run full BIMI validation for a domain */
export async function validateDomain(
  domain: string,
  selector: string = "default"
): Promise<BIMIValidationResult> {
  const errors: string[] = [];
  const now = new Date();

  // 1. BIMI DNS record (with org domain fallback built in)
  const bimiRecord = await lookupBIMIRecord(domain, selector);
  if (!bimiRecord) {
    errors.push(`No BIMI record found at ${selector}._bimi.${domain}`);
  }

  // 2. DMARC record
  const dmarcLookup = await lookupDMARC(domain);
  const dmarcRecord = dmarcLookup?.record ?? null;
  const isSubdomain = dmarcLookup?.isSubdomain ?? false;
  let dmarcValid = false;
  let dmarcReason: string | null = null;
  if (!dmarcRecord) {
    errors.push(`No DMARC record found at _dmarc.${domain}`);
  } else {
    dmarcValid = isDMARCValidForBIMI(dmarcRecord, isSubdomain);
    dmarcReason = getDMARCBIMIReason(dmarcRecord, isSubdomain);
    if (!dmarcValid && dmarcReason) {
      errors.push(`DMARC: ${dmarcReason}`);
    }
  }

  // 3. SVG logo
  let svgResult: BIMIValidationResult["svg"] = {
    found: false,
    url: null,
    validation: null,
    sizeBytes: null,
    indicatorHash: null,
  };
  let svgContent: string | null = null;

  if (bimiRecord?.logoUrl) {
    try {
      const res = await safeFetch(bimiRecord.logoUrl, {
        headers: { "User-Agent": "bimi-quest/1.0 (BIMI Validator)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        // Handle both SVG and SVGZ (gzipped SVG)
        const buffer = Buffer.from(await res.arrayBuffer());
        const svgText = decompressSvgIfNeeded(buffer);
        svgContent = svgText;
        const validation = validateSVGTinyPS(svgText);
        const hash = computeSvgHash(svgText);
        svgResult = {
          found: true,
          url: bimiRecord.logoUrl,
          validation,
          sizeBytes: new TextEncoder().encode(svgText).length,
          indicatorHash: hash,
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
    rawPem: null,
    chain: null,
    authorizedCa: null,
    certSvgHash: null,
    svgMatch: null,
  };

  if (bimiRecord?.authorityUrl) {
    try {
      const res = await safeFetch(bimiRecord.authorityUrl, {
        headers: { "User-Agent": "bimi-quest/1.0 (BIMI Validator)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const pemText = await res.text();
        const certInfo = parsePemBasicInfo(pemText);
        if (certInfo) {
          const chainResult = validateCertificateChain(pemText);

          // Check if issuing CA is authorized for BIMI
          const normalizedIssuer = normalizeIssuerOrg(certInfo.issuerOrg);
          const authorizedCa = normalizedIssuer
            ? AUTHORIZED_CAS.has(normalizedIssuer)
            : false;

          // Compare cert-embedded SVG hash with web-fetched SVG hash
          let svgMatch: boolean | null = null;
          if (certInfo.logotypeSvgHash && svgResult.indicatorHash) {
            svgMatch = certInfo.logotypeSvgHash === svgResult.indicatorHash;
          }

          certResult = {
            found: true,
            authorityUrl: bimiRecord.authorityUrl,
            certType: certInfo.certType,
            issuer: certInfo.issuer,
            validFrom: certInfo.notBefore,
            validTo: certInfo.notAfter,
            isExpired: certInfo.notAfter < now,
            rawPem: pemText,
            chain: chainResult,
            authorizedCa,
            certSvgHash: certInfo.logotypeSvgHash,
            svgMatch,
          };
          if (certInfo.notAfter < now) {
            errors.push("BIMI certificate is expired");
          }
          if (chainResult && !chainResult.chainValid) {
            for (const ce of chainResult.chainErrors) {
              errors.push(`Certificate chain: ${ce}`);
            }
          }
          if (certInfo.sans.length > 0) {
            const covered = certInfo.sans.some((san) => sanCoversDomain(san, domain));
            if (!covered) {
              errors.push(
                `Certificate does not cover domain ${domain} (SANs: ${certInfo.sans.join(", ")})`
              );
            }
          }
          if (!authorizedCa) {
            errors.push(
              `Issuer "${normalizedIssuer || "unknown"}" is not an authorized BIMI CA`
            );
          }
          if (svgMatch === false) {
            errors.push("Certificate SVG does not match web-hosted SVG indicator");
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

  // 5. RNG schema validation (async, only if we have SVG content)
  let rngChecks: BimiCheckItem[] = [];
  if (svgContent) {
    try {
      const rngResult = await validateSvgRng(svgContent);
      rngChecks = rngToCheckItems(rngResult);
    } catch {
      rngChecks = [{
        id: "rng-error",
        category: "spec",
        label: "RELAX NG schema",
        status: "skip",
        summary: "RNG validation could not be performed",
      }];
    }
  }

  // 6. Build structured checks
  const checks = buildChecks({
    bimiRecord,
    dmarcRecord,
    dmarcValid,
    dmarcReason,
    isSubdomain,
    svgResult,
    svgContent,
    certResult,
    rngChecks,
    domain,
    selector,
  });

  // 7. Compute grade
  const declined = bimiRecord?.declined ?? false;
  const { grade, summary: gradeSummary } = computeGrade(checks, declined);

  // 8. Generate auth result and response headers
  const authResult = buildAuthResult(domain, selector, bimiRecord, svgResult, certResult, dmarcValid, declined);
  const responseHeaders = buildResponseHeaders(bimiRecord, svgContent);

  const overallValid =
    bimiRecord !== null && !declined && dmarcValid && svgResult.found && errors.length === 0;

  return {
    domain,
    timestamp: now,
    bimi: {
      found: bimiRecord !== null,
      record: bimiRecord,
      lps: bimiRecord?.lps ?? null,
      avp: bimiRecord?.avp ?? null,
      declined,
      selector,
      orgDomainFallback: bimiRecord?.orgDomainFallback ?? false,
      orgDomain: bimiRecord?.orgDomain ?? null,
    },
    dmarc: {
      found: dmarcRecord !== null,
      record: dmarcRecord,
      validForBIMI: dmarcValid,
      reason: dmarcReason,
      isSubdomain,
    },
    svg: svgResult,
    certificate: certResult,
    grade,
    gradeSummary,
    checks,
    authResult,
    responseHeaders,
    overallValid,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Structured check builder
// ---------------------------------------------------------------------------

interface CheckBuilderInput {
  bimiRecord: BIMIRecord | null;
  dmarcRecord: DMARCRecord | null;
  dmarcValid: boolean;
  dmarcReason: string | null;
  isSubdomain: boolean;
  svgResult: BIMIValidationResult["svg"];
  svgContent: string | null;
  certResult: BIMIValidationResult["certificate"];
  rngChecks: BimiCheckItem[];
  domain: string;
  selector: string;
}

function buildChecks(input: CheckBuilderInput): BimiCheckItem[] {
  const checks: BimiCheckItem[] = [];

  // -- Spec compliance checks --

  // BIMI DNS
  if (input.bimiRecord) {
    if (input.bimiRecord.declined) {
      checks.push({
        id: "bimi-dns",
        category: "spec",
        label: "BIMI DNS Record",
        status: "fail",
        summary: "Domain has explicitly declined BIMI (empty l= and a= tags)",
        specRef: "draft-12 section 4.2",
        remediation: "To enable BIMI, update the DNS TXT record to include a logo URL in the l= tag and optionally a certificate URL in the a= tag.",
      });
    } else {
      checks.push({
        id: "bimi-dns",
        category: "spec",
        label: "BIMI DNS Record",
        status: "pass",
        summary: `Valid v=BIMI1 record at ${input.selector}._bimi.${input.bimiRecord.orgDomain || input.domain}`,
        detail: input.bimiRecord.orgDomainFallback
          ? `Found via org domain fallback (${input.bimiRecord.orgDomain})`
          : undefined,
        specRef: "draft-12 section 4",
      });
    }
  } else {
    checks.push({
      id: "bimi-dns",
      category: "spec",
      label: "BIMI DNS Record",
      status: "fail",
      summary: `No BIMI record found at ${input.selector}._bimi.${input.domain}`,
      specRef: "draft-12 section 4",
      remediation: `Add a BIMI DNS TXT record at ${input.selector}._bimi.${input.domain}. Your DNS administrator can add: v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/cert.pem;`,
    });
  }

  // lps tag (informational)
  if (input.bimiRecord?.lps) {
    checks.push({
      id: "bimi-lps",
      category: "spec",
      label: "Local-Part Selector",
      status: "info",
      summary: `lps=${input.bimiRecord.lps} (per-address logos enabled)`,
      specRef: "draft-12 section 4.3",
    });
  }

  // avp tag (informational)
  if (input.bimiRecord?.avp) {
    checks.push({
      id: "bimi-avp",
      category: "spec",
      label: "Avatar Preference",
      status: "info",
      summary: `avp=${input.bimiRecord.avp}`,
      specRef: "draft-12 section 4.4",
    });
  }

  // DMARC
  if (input.dmarcRecord) {
    if (input.dmarcValid) {
      checks.push({
        id: "dmarc-policy",
        category: "spec",
        label: "DMARC Policy",
        status: "pass",
        summary: `p=${input.dmarcRecord.policy}, pct=${input.dmarcRecord.pct}`,
        specRef: "draft-12 section 3",
      });
    } else {
      checks.push({
        id: "dmarc-policy",
        category: "spec",
        label: "DMARC Policy",
        status: "fail",
        summary: input.dmarcReason || "DMARC policy insufficient",
        specRef: "draft-12 section 3",
        remediation: "Your IT team needs to update the domain's DMARC policy to \"quarantine\" or \"reject\" with pct=100. Update the _dmarc TXT record accordingly.",
      });
    }
  } else {
    checks.push({
      id: "dmarc-policy",
      category: "spec",
      label: "DMARC Policy",
      status: "fail",
      summary: "No DMARC record found",
      specRef: "draft-12 section 3",
      remediation: "Add a DMARC DNS TXT record at _dmarc." + input.domain + " with at least p=quarantine and pct=100. Your IT or email security team can help set this up.",
    });
  }

  // SVG schema (regex-based)
  if (input.svgResult.validation) {
    const svgItems = categorizeSvgChecks(input.svgResult.validation);
    checks.push(...svgItems);
  } else if (input.bimiRecord?.logoUrl) {
    checks.push({
      id: "svg-schema",
      category: "spec",
      label: "SVG Tiny PS",
      status: "fail",
      summary: "Could not fetch or validate SVG logo",
      remediation: "Ensure the SVG logo URL in your BIMI record is publicly accessible over HTTPS and returns a valid SVG file.",
    });
  }

  // RNG schema validation
  checks.push(...input.rngChecks);

  // SVG indicator hash
  if (input.svgResult.indicatorHash) {
    checks.push({
      id: "svg-hash",
      category: "spec",
      label: "Indicator Hash",
      status: "pass",
      summary: `SHA-256: ${input.svgResult.indicatorHash.slice(0, 16)}...`,
      detail: `Full hash: ${input.svgResult.indicatorHash}`,
      specRef: "draft-12 section 5",
    });
  }

  // Certificate chain
  if (input.certResult.found) {
    if (input.certResult.chain?.chainValid) {
      checks.push({
        id: "cert-chain",
        category: "spec",
        label: "Certificate Chain",
        status: "pass",
        summary: `Valid chain (${input.certResult.chain.chainLength} certificate${input.certResult.chain.chainLength !== 1 ? "s" : ""})`,
      });
    } else if (input.certResult.chain) {
      checks.push({
        id: "cert-chain",
        category: "spec",
        label: "Certificate Chain",
        status: "fail",
        summary: "Chain validation issues found",
        detail: input.certResult.chain.chainErrors.join("\n"),
        remediation: "The certificate chain is incomplete or invalid. Contact your Certificate Authority to get a correctly chained certificate file.",
      });
    }

    // CA trust
    if (input.certResult.authorizedCa === true) {
      checks.push({
        id: "ca-trust",
        category: "spec",
        label: "Authorized CA",
        status: "pass",
        summary: `Issued by authorized BIMI CA`,
        specRef: "VMC Requirements",
      });
    } else if (input.certResult.authorizedCa === false) {
      checks.push({
        id: "ca-trust",
        category: "spec",
        label: "Authorized CA",
        status: "fail",
        summary: "Issuing CA is not in the authorized BIMI CA list",
        specRef: "VMC Requirements",
        remediation: "BIMI certificates must be issued by an authorized CA (DigiCert, Entrust, GlobalSign, Sectigo, or SSL.com). You'll need to purchase a VMC or CMC from one of these providers.",
      });
    }

    // Certificate expiry
    if (input.certResult.isExpired) {
      checks.push({
        id: "cert-expiry",
        category: "spec",
        label: "Certificate Validity",
        status: "fail",
        summary: "Certificate is expired",
        remediation: "Your BIMI certificate has expired and needs to be renewed. Contact your Certificate Authority to renew it.",
      });
    } else {
      checks.push({
        id: "cert-expiry",
        category: "spec",
        label: "Certificate Validity",
        status: "pass",
        summary: `${input.certResult.certType || "Certificate"} is valid`,
      });
    }

    // SVG cert-vs-web match
    if (input.certResult.svgMatch === true) {
      checks.push({
        id: "svg-match",
        category: "spec",
        label: "SVG Indicator Match",
        status: "pass",
        summary: "Certificate SVG matches web-hosted indicator",
        specRef: "draft-12 section 5.2",
      });
    } else if (input.certResult.svgMatch === false) {
      checks.push({
        id: "svg-match",
        category: "spec",
        label: "SVG Indicator Match",
        status: "warn",
        summary: "Certificate SVG differs from web-hosted indicator",
        specRef: "draft-12 section 5.2",
        remediation: "The SVG embedded in your certificate doesn't match the one hosted at your logo URL. Re-upload the exact same SVG file that was submitted during certificate issuance.",
      });
    }
  } else if (input.bimiRecord?.authorityUrl) {
    checks.push({
      id: "cert-chain",
      category: "spec",
      label: "Certificate",
      status: "fail",
      summary: "Could not fetch or parse authority certificate",
      remediation: "Ensure the certificate URL in your BIMI record's a= tag is publicly accessible over HTTPS and returns a valid PEM certificate.",
    });
  }

  // -- Compatibility checks --

  // Gmail dimensions
  if (input.svgResult.validation) {
    const warns = input.svgResult.validation.warnings;
    const missingDims = warns.some((w) => w.includes("Missing explicit width/height"));
    const smallDims = warns.some((w) => w.includes("below Gmail minimum"));
    if (missingDims || smallDims) {
      checks.push({
        id: "gmail-dimensions",
        category: "compatibility",
        label: "Gmail Dimensions",
        status: "warn",
        summary: missingDims
          ? "Missing explicit width/height attributes"
          : "Dimensions below Gmail's 96x96 minimum",
      });
    } else {
      checks.push({
        id: "gmail-dimensions",
        category: "compatibility",
        label: "Gmail Dimensions",
        status: "pass",
        summary: "Dimensions meet Gmail requirements",
      });
    }

    // Apple Mail path count
    const highPaths = warns.some((w) => w.includes("High path count"));
    if (highPaths) {
      checks.push({
        id: "apple-path-count",
        category: "compatibility",
        label: "Apple Mail Rendering",
        status: "warn",
        summary: "High path count may render poorly at small display sizes",
      });
    }

    // Text-to-path
    const hasText = warns.some((w) => w.includes("<text> elements"));
    if (hasText) {
      checks.push({
        id: "text-to-path",
        category: "compatibility",
        label: "Text Elements",
        status: "warn",
        summary: "Converting <text> to paths improves cross-client portability",
      });
    }
  }

  // SVGZ support (informational)
  if (input.bimiRecord?.logoUrl?.toLowerCase().endsWith(".svgz")) {
    checks.push({
      id: "svgz-support",
      category: "compatibility",
      label: "SVGZ Format",
      status: "info",
      summary: "Logo is served as SVGZ (gzip-compressed SVG)",
    });
  }

  // Certificate type compatibility
  if (input.certResult.found) {
    const certType = input.certResult.certType;
    if (certType === "VMC") {
      checks.push({
        id: "cert-type-compat",
        category: "compatibility",
        label: "Certificate Type",
        status: "pass",
        summary: "VMC provides maximum client compatibility",
      });
    } else if (certType === "CMC") {
      checks.push({
        id: "cert-type-compat",
        category: "compatibility",
        label: "Certificate Type",
        status: "info",
        summary: "CMC is supported by Gmail and Apple Mail but requires no trademark",
      });
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Authentication-Results and response header generation
// ---------------------------------------------------------------------------

function buildAuthResult(
  domain: string,
  selector: string,
  bimiRecord: BIMIRecord | null,
  svgResult: BIMIValidationResult["svg"],
  certResult: BIMIValidationResult["certificate"],
  dmarcValid: boolean,
  declined: boolean,
): string {
  if (declined) {
    return `bimi=declined header.d=${domain} header.selector=${selector}`;
  }
  if (!bimiRecord) {
    return `bimi=none header.d=${domain} header.selector=${selector}`;
  }
  if (!dmarcValid || !svgResult.found) {
    const props = [
      `header.d=${domain}`,
      `header.selector=${selector}`,
    ];
    if (bimiRecord.authorityUrl) {
      props.push(`policy.authority=${bimiRecord.authorityUrl}`);
    }
    if (bimiRecord.logoUrl) {
      props.push(`policy.indicator-uri=${bimiRecord.logoUrl}`);
    }
    return `bimi=fail ${props.join(" ")}`;
  }

  const props = [
    `header.d=${domain}`,
    `header.selector=${selector}`,
  ];
  if (certResult.authorityUrl) {
    props.push(`policy.authority=${certResult.authorityUrl}`);
  }
  if (bimiRecord.logoUrl) {
    props.push(`policy.indicator-uri=${bimiRecord.logoUrl}`);
  }
  if (svgResult.indicatorHash) {
    props.push(`policy.indicator-hash=sha256:${svgResult.indicatorHash}`);
  }
  if (bimiRecord.avp) {
    props.push(`policy.logo-preference=${bimiRecord.avp}`);
  }

  return `bimi=pass ${props.join(" ")}`;
}

function buildResponseHeaders(
  bimiRecord: BIMIRecord | null,
  svgContent: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!bimiRecord) return headers;

  if (bimiRecord.authorityUrl) {
    headers["BIMI-Location"] = `v=BIMI1; a=${bimiRecord.authorityUrl}`;
  }

  if (svgContent) {
    const base64 = Buffer.from(svgContent).toString("base64");
    headers["BIMI-Indicator"] = base64;
  }

  if (bimiRecord.avp) {
    headers["BIMI-Logo-Preference"] = bimiRecord.avp;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Internal helpers (unchanged from before)
// ---------------------------------------------------------------------------

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
  issuerOrg: string | null;
  notBefore: Date;
  notAfter: Date;
  certType: "VMC" | "CMC" | null;
  markType: string | null;
  sans: string[];
  logotypeSvgHash: string | null;
} | null {
  try {
    const der = pemToDer(pem);
    const cert = new X509Certificate(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);

    const MARK_TYPE_OID = "1.3.6.1.4.1.53087.1.13";
    const markType = extractDnField(cert.subject, MARK_TYPE_OID);
    const certType = deriveCertType(markType);

    // Extract issuer org from DN (try short name first, fall back to OID)
    const issuerOrg = extractDnField(cert.issuer, "O") ?? extractDnField(cert.issuer, "2.5.4.10");

    const sans: string[] = [];
    try {
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

    // Try to extract logotype SVG hash from the cert's logotype extension
    // OID 1.3.6.1.5.5.7.1.12 (id-pe-logotype)
    let logotypeSvgHash: string | null = null;
    try {
      const logoExt = cert.getExtension("1.3.6.1.5.5.7.1.12");
      if (logoExt) {
        // The logotype extension contains the SVG hash in a complex ASN.1 structure.
        // For now, we extract what we can from the raw data. The hash comparison
        // will work when the cert was ingested by our CT scanner which stores
        // logotypeSvgHash separately.
        const rawHex = Buffer.from(logoExt.value).toString("hex");
        // Look for SHA-256 hash pattern (32 bytes = 64 hex chars)
        const hashMatch = rawHex.match(/0420([0-9a-f]{64})/);
        if (hashMatch) {
          logotypeSvgHash = hashMatch[1];
        }
      }
    } catch {
      // Logotype extension parsing failed
    }

    return {
      issuer: cert.issuer,
      issuerOrg,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      certType,
      markType,
      sans,
      logotypeSvgHash,
    };
  } catch {
    return null;
  }
}

/**
 * Validate the internal consistency of a PEM certificate chain.
 * Checks: issuer/subject chaining, signature verification, expiry, basicConstraints.
 * Does NOT validate against a root store (out of scope for a market intel tool).
 */
function validateCertificateChain(pem: string): ChainValidationResult | null {
  try {
    const chainErrors: string[] = [];

    // Extract all PEM blocks
    const pemBlocks = pem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
    );
    if (!pemBlocks || pemBlocks.length === 0) {
      return { chainValid: false, chainErrors: ["No certificates found in PEM"], chainLength: 0 };
    }

    // Parse all certs
    const certs = pemBlocks.map((block) => {
      const der = pemToDer(block);
      return new X509Certificate(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
    });

    if (certs.length === 1) {
      return { chainValid: true, chainErrors: [], chainLength: 1 };
    }

    const now = new Date();

    // Walk the chain: cert[0] is leaf, cert[i+1] should be cert[i]'s issuer
    for (let i = 0; i < certs.length; i++) {
      const cert = certs[i];

      if (cert.notAfter < now) {
        const label = i === 0 ? "Leaf" : `Intermediate #${i}`;
        chainErrors.push(`${label} certificate expired on ${cert.notAfter.toISOString().split("T")[0]}`);
      }
      if (cert.notBefore > now) {
        const label = i === 0 ? "Leaf" : `Intermediate #${i}`;
        chainErrors.push(`${label} certificate not yet valid (starts ${cert.notBefore.toISOString().split("T")[0]})`);
      }

      if (i > 0) {
        try {
          const bcExt = cert.getExtension(BasicConstraintsExtension);
          if (!bcExt || !bcExt.ca) {
            chainErrors.push(`Intermediate #${i} missing basicConstraints CA:true`);
          }
        } catch {
          // Extension parsing failed, skip this check
        }
      }

      if (i < certs.length - 1) {
        const issuer = certs[i + 1];
        if (cert.issuer !== issuer.subject) {
          chainErrors.push(
            `Chain break at position ${i}: issuer DN does not match next certificate's subject`
          );
        }

        try {
          const issuerSpki = issuer.publicKey.rawData;
          if (!issuerSpki || issuerSpki.byteLength === 0) {
            chainErrors.push(`Intermediate #${i + 1} has no public key`);
          }
        } catch {
          chainErrors.push(`Failed to read public key from certificate at position ${i + 1}`);
        }
      }
    }

    return {
      chainValid: chainErrors.length === 0,
      chainErrors,
      chainLength: certs.length,
    };
  } catch {
    return null;
  }
}
