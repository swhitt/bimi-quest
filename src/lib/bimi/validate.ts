import { BasicConstraintsExtension, X509Certificate } from "@peculiar/x509";
import { normalizeIssuerOrg } from "@/lib/ca-display";
import { parseCertBasicInfo, pemToDer } from "@/lib/ct/parser";
import { safeFetch } from "@/lib/net/safe-fetch";
import { toArrayBuffer } from "@/lib/pem";
import { errorMessage } from "@/lib/utils";
import { type CAAResult, isIssuerAuthorizedByCAA, lookupCAA } from "./caa";
import { type DMARCRecord, getDMARCBIMIReason, isDMARCValidForBIMI, lookupDMARC } from "./dmarc";
import { type BIMIRecord, lookupBIMIRecord } from "./dns";
import { computeGrade } from "./grade";
import { type LpsTieredResult, tieredLpsLookup } from "./lps";
import { lookupReceiverTrust, type ReceiverTrustResult } from "./receiver-trust";
import {
  categorizeSvgChecks,
  computeSvgHash,
  decompressSvgIfNeeded,
  type SVGValidationResult,
  validateSVGTinyPS,
} from "./svg";
import { rngToCheckItems, validateSvgRng } from "./svg-rng";
import type { BimiCheckItem, BimiGrade } from "./types";

// CAs authorized to issue BIMI certificates per CA/Browser Forum VMC requirements.
// Values match what normalizeIssuerOrg() produces from raw certificate DNs.
const AUTHORIZED_CAS = new Set(["DigiCert", "Entrust", "SSL Corporation", "GlobalSign nv-sa", "Sectigo Limited"]);

export interface ChainValidationResult {
  chainValid: boolean;
  chainErrors: string[];
  chainLength: number;
}

export interface ValidateDomainOptions {
  domain: string;
  selector?: string;
  localPart?: string;
  receiverDomains?: string[];
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
  caa: CAAResult | null;
  lpsTrace: LpsTieredResult | null;
  receiverTrust: ReceiverTrustResult | null;
  grade: BimiGrade;
  gradeSummary: string;
  checks: BimiCheckItem[];
  authResult: string;
  responseHeaders: Record<string, string>;
  overallValid: boolean;
  errors: string[];
}

/** Run full BIMI validation for a domain.
 *  Uses AbortSignal.timeout to cap external fetches at 25s total, leaving
 *  headroom for the Vercel function's 30s limit. */
export async function validateDomain(options: ValidateDomainOptions): Promise<BIMIValidationResult> {
  const { domain, selector = "default", localPart, receiverDomains } = options;
  const errors: string[] = [];
  const now = new Date();

  // Overall timeout signal — individual fetch timeouts are shorter, but this
  // guards against accumulated latency from sequential steps.
  const signal = AbortSignal.timeout(25_000);

  // 1 & 2. BIMI + DMARC + CAA DNS lookups (independent, run in parallel)
  // Each lookup may throw on resolver errors (SERVFAIL, timeouts, etc.) while
  // returning null for genuine "record not found" (ENOTFOUND/ENODATA).
  // When a localPart is provided, use tiered LPS lookup instead of standard BIMI lookup.
  const bimiLookup = localPart
    ? tieredLpsLookup(domain, selector, localPart).catch((err: unknown) => err as Error)
    : lookupBIMIRecord(domain, selector).catch((err: unknown) => err as Error);

  const [bimiResult, dmarcResult, caaResult, receiverTrustResult] = await Promise.all([
    bimiLookup,
    lookupDMARC(domain).catch((err: unknown) => err as Error),
    lookupCAA(domain).catch((err: unknown) => err as Error),
    receiverDomains?.length
      ? lookupReceiverTrust(receiverDomains, selector).catch((err: unknown) => err as Error)
      : Promise.resolve(null),
  ]);

  // Extract BIMI record — may come from standard lookup or tiered LPS result
  let lpsTrace: LpsTieredResult | null = null;
  let bimiRecord: BIMIRecord | null = null;
  if (bimiResult instanceof Error) {
    errors.push(`BIMI DNS lookup failed (resolver error): ${errorMessage(bimiResult)}`);
  } else if (bimiResult && "steps" in bimiResult) {
    // Tiered LPS result
    lpsTrace = bimiResult;
    bimiRecord = bimiResult.finalRecord;
    if (!bimiRecord) {
      errors.push(`No BIMI record found at ${selector}._bimi.${domain}`);
    }
  } else {
    bimiRecord = bimiResult;
    if (!bimiRecord) {
      errors.push(`No BIMI record found at ${selector}._bimi.${domain}`);
    }
  }

  const receiverTrust = receiverTrustResult instanceof Error ? null : receiverTrustResult;
  if (receiverTrustResult instanceof Error) {
    errors.push(`Receiver trust lookup failed: ${errorMessage(receiverTrustResult)}`);
  }

  const dmarcLookup = dmarcResult instanceof Error ? null : dmarcResult;
  const dmarcRecord = dmarcLookup?.record ?? null;
  const isSubdomain = dmarcLookup?.isSubdomain ?? false;
  let dmarcValid = false;
  let dmarcReason: string | null = null;
  if (dmarcResult instanceof Error) {
    errors.push(`DMARC DNS lookup failed (resolver error): ${errorMessage(dmarcResult)}`);
  } else if (!dmarcRecord) {
    errors.push(`No DMARC record found at _dmarc.${domain}`);
  } else {
    dmarcValid = isDMARCValidForBIMI(dmarcRecord, isSubdomain);
    dmarcReason = getDMARCBIMIReason(dmarcRecord, isSubdomain);
    if (!dmarcValid && dmarcReason) {
      errors.push(`DMARC: ${dmarcReason}`);
    }
  }

  const caa = caaResult instanceof Error ? null : caaResult;
  if (caaResult instanceof Error) {
    errors.push(`CAA DNS lookup failed (resolver error): ${errorMessage(caaResult)}`);
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
        signal,
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
          errors.push(`SVG validation failed: ${validation.errors.join("; ")}`);
        }
      } else {
        errors.push(`Failed to fetch SVG logo: HTTP ${res.status} from ${bimiRecord.logoUrl}`);
      }
    } catch (err) {
      errors.push(`Failed to fetch SVG logo: ${errorMessage(err)}`);
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
        signal,
      });
      if (res.ok) {
        const pemText = await res.text();
        const certInfo = parseCertBasicInfo(pemText);
        if (certInfo) {
          const chainResult = await validateCertificateChain(pemText);

          // Check if intermediate CA is authorized for BIMI
          const normalizedIssuer = normalizeIssuerOrg(certInfo.issuerOrg);
          const authorizedCa = normalizedIssuer ? AUTHORIZED_CAS.has(normalizedIssuer) : false;

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
              errors.push(`Certificate does not cover domain ${domain} (SANs: ${certInfo.sans.join(", ")})`);
            }
          }
          if (!authorizedCa) {
            errors.push(`Issuer "${normalizedIssuer || "unknown"}" is not an authorized BIMI CA`);
          }
          if (svgMatch === false) {
            errors.push("Certificate SVG does not match web-hosted SVG indicator");
          }
        }
      } else {
        errors.push(`Failed to fetch authority certificate: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Failed to fetch authority certificate: ${errorMessage(err)}`);
    }
  }

  // 5. RNG schema validation (async, only if we have SVG content)
  let rngChecks: BimiCheckItem[] = [];
  if (svgContent) {
    try {
      const rngResult = await validateSvgRng(svgContent);
      rngChecks = rngToCheckItems(rngResult);
    } catch {
      rngChecks = [
        {
          id: "rng-error",
          category: "spec",
          label: "RELAX NG schema",
          status: "skip",
          summary: "RNG validation could not be performed",
        },
      ];
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
    caa,
    lpsTrace,
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

  const overallValid = bimiRecord !== null && !declined && dmarcValid && svgResult.found && errors.length === 0;

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
    caa,
    lpsTrace,
    receiverTrust,
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
  caa: CAAResult | null;
  lpsTrace: LpsTieredResult | null;
  rngChecks: BimiCheckItem[];
  domain: string;
  selector: string;
}

/** Shorthand factory to reduce boilerplate in buildChecks.
 *  Optional fields (specRef, remediation, detail) are passed via opts. */
function check(
  id: string,
  category: BimiCheckItem["category"],
  label: string,
  status: BimiCheckItem["status"],
  summary: string,
  opts?: Partial<BimiCheckItem>,
): BimiCheckItem {
  return { id, category, label, status, summary, ...opts };
}

function buildChecks(input: CheckBuilderInput): BimiCheckItem[] {
  const checks: BimiCheckItem[] = [];

  // -- Spec compliance checks --

  // BIMI DNS
  if (input.bimiRecord) {
    if (input.bimiRecord.declined) {
      checks.push(
        check(
          "bimi-dns",
          "spec",
          "BIMI DNS Record",
          "fail",
          "Domain has explicitly declined BIMI (empty l= and a= tags)",
          {
            specRef: "draft-12 section 4.2",
            remediation:
              "To enable BIMI, update the DNS TXT record to include a logo URL in the l= tag and optionally a certificate URL in the a= tag.",
          },
        ),
      );
    } else {
      checks.push(
        check(
          "bimi-dns",
          "spec",
          "BIMI DNS Record",
          "pass",
          `Valid v=BIMI1 record at ${input.selector}._bimi.${input.bimiRecord.orgDomain || input.domain}`,
          {
            detail: input.bimiRecord.orgDomainFallback
              ? `Found via org domain fallback (${input.bimiRecord.orgDomain})`
              : undefined,
            specRef: "draft-12 section 4",
          },
        ),
      );
    }
  } else {
    checks.push(
      check(
        "bimi-dns",
        "spec",
        "BIMI DNS Record",
        "fail",
        `No BIMI record found at ${input.selector}._bimi.${input.domain}`,
        {
          specRef: "draft-12 section 4",
          remediation: `Add a BIMI DNS TXT record at ${input.selector}._bimi.${input.domain}. Your DNS administrator can add: v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/cert.pem;`,
        },
      ),
    );
  }

  // lps tag (informational)
  if (input.bimiRecord?.lps) {
    checks.push(
      check(
        "bimi-lps",
        "spec",
        "Local-Part Selector",
        "info",
        `lps=${input.bimiRecord.lps} (per-address logos enabled)`,
        {
          specRef: "draft-12 section 4.3",
        },
      ),
    );
  }

  // LPS tiered lookup trace (informational)
  if (input.lpsTrace) {
    const matchInfo = input.lpsTrace.matchedPrefix
      ? `Prefix "${input.lpsTrace.matchedPrefix}" matched for "${input.lpsTrace.normalizedLocalPart}"`
      : `No prefix match for "${input.lpsTrace.normalizedLocalPart}"`;
    checks.push(
      check("lps-lookup", "spec", "LPS Tiered Lookup", "info", matchInfo, {
        specRef: "draft-12 section 4.5",
        detail: input.lpsTrace.steps.map((s) => `Step ${s.step}: ${s.description} [${s.result}]`).join("\n"),
      }),
    );
  }

  // avp tag (informational)
  if (input.bimiRecord?.avp) {
    checks.push(
      check("bimi-avp", "spec", "Avatar Preference", "info", `avp=${input.bimiRecord.avp}`, {
        specRef: "draft-12 section 4.4",
      }),
    );
  }

  // DMARC
  if (input.dmarcRecord) {
    if (input.dmarcValid) {
      checks.push(
        check(
          "dmarc-policy",
          "spec",
          "DMARC Policy",
          "pass",
          `p=${input.dmarcRecord.policy}, pct=${input.dmarcRecord.pct}`,
          {
            specRef: "draft-12 section 3",
          },
        ),
      );
    } else {
      checks.push(
        check("dmarc-policy", "spec", "DMARC Policy", "fail", input.dmarcReason || "DMARC policy insufficient", {
          specRef: "draft-12 section 3",
          remediation:
            'Your IT team needs to update the domain\'s DMARC policy to "quarantine" or "reject" with pct=100. Update the _dmarc TXT record accordingly.',
        }),
      );
    }
  } else {
    checks.push(
      check("dmarc-policy", "spec", "DMARC Policy", "fail", "No DMARC record found", {
        specRef: "draft-12 section 3",
        remediation:
          "Add a DMARC DNS TXT record at _dmarc." +
          input.domain +
          " with at least p=quarantine and pct=100. Your IT or email security team can help set this up.",
      }),
    );
  }

  // SVG schema (regex-based)
  if (input.svgResult.validation) {
    const svgItems = categorizeSvgChecks(input.svgResult.validation);
    checks.push(...svgItems);
  } else if (input.bimiRecord?.logoUrl) {
    checks.push(
      check("svg-schema", "spec", "SVG Tiny PS", "fail", "Could not fetch or validate SVG logo", {
        remediation:
          "Ensure the SVG logo URL in your BIMI record is publicly accessible over HTTPS and returns a valid SVG file.",
      }),
    );
  }

  // RNG schema validation
  checks.push(...input.rngChecks);

  // SVG indicator hash
  if (input.svgResult.indicatorHash) {
    checks.push(
      check("svg-hash", "spec", "Indicator Hash", "pass", `SHA-256: ${input.svgResult.indicatorHash.slice(0, 16)}...`, {
        detail: `Full hash: ${input.svgResult.indicatorHash}`,
        specRef: "draft-12 section 5",
      }),
    );
  }

  // Certificate chain
  if (input.certResult.found) {
    if (input.certResult.chain?.chainValid) {
      const hasWarnings = input.certResult.chain.chainErrors.length > 0;
      checks.push(
        check(
          "cert-chain",
          "spec",
          "Certificate Chain",
          hasWarnings ? "warn" : "pass",
          hasWarnings
            ? input.certResult.chain.chainErrors[0]
            : `Valid chain (${input.certResult.chain.chainLength} certificate${input.certResult.chain.chainLength !== 1 ? "s" : ""})`,
          {
            detail:
              hasWarnings && input.certResult.chain.chainErrors.length > 1
                ? input.certResult.chain.chainErrors.slice(1).join("\n")
                : undefined,
          },
        ),
      );
    } else if (input.certResult.chain) {
      checks.push(
        check("cert-chain", "spec", "Certificate Chain", "fail", "Chain validation issues found", {
          detail: input.certResult.chain.chainErrors.join("\n"),
          remediation:
            "The certificate chain is incomplete or invalid. Contact your Certificate Authority to get a correctly chained certificate file.",
        }),
      );
    }

    // CA trust
    if (input.certResult.authorizedCa === true) {
      checks.push(
        check("ca-trust", "spec", "Authorized CA", "pass", "Issued by authorized BIMI CA", {
          specRef: "VMC Requirements",
        }),
      );
    } else if (input.certResult.authorizedCa === false) {
      checks.push(
        check("ca-trust", "spec", "Authorized CA", "fail", "Intermediate CA is not in the authorized BIMI CA list", {
          specRef: "VMC Requirements",
          remediation:
            "BIMI certificates must be issued by an authorized CA (DigiCert, Entrust, GlobalSign, Sectigo, or SSL.com). You'll need to purchase a VMC or CMC from one of these providers.",
        }),
      );
    }

    // Certificate expiry
    if (input.certResult.isExpired) {
      checks.push(
        check("cert-expiry", "spec", "Certificate Validity", "fail", "Certificate is expired", {
          remediation:
            "Your BIMI certificate has expired and needs to be renewed. Contact your Certificate Authority to renew it.",
        }),
      );
    } else {
      checks.push(
        check(
          "cert-expiry",
          "spec",
          "Certificate Validity",
          "pass",
          `${input.certResult.certType || "Certificate"} is valid`,
        ),
      );
    }

    // SVG cert-vs-web match
    if (input.certResult.svgMatch === true) {
      checks.push(
        check("svg-match", "spec", "SVG Indicator Match", "pass", "Certificate SVG matches web-hosted indicator", {
          specRef: "draft-12 section 5.2",
        }),
      );
    } else if (input.certResult.svgMatch === false) {
      checks.push(
        check("svg-match", "spec", "SVG Indicator Match", "warn", "Certificate SVG differs from web-hosted indicator", {
          specRef: "draft-12 section 5.2",
          remediation:
            "The SVG embedded in your certificate doesn't match the one hosted at your logo URL. Re-upload the exact same SVG file that was submitted during certificate issuance.",
        }),
      );
    }
  } else if (input.bimiRecord?.authorityUrl) {
    checks.push(
      check("cert-chain", "spec", "Certificate", "fail", "Could not fetch or parse authority certificate", {
        remediation:
          "Ensure the certificate URL in your BIMI record's a= tag is publicly accessible over HTTPS and returns a valid PEM certificate.",
      }),
    );
  }

  // CAA issuevmc
  if (input.caa) {
    if (input.caa.status === "vmc_authorized") {
      checks.push(
        check(
          "caa-issuevmc",
          "spec",
          "CAA issuevmc",
          "pass",
          `issuevmc authorized: ${input.caa.authorizedCAs.join(", ")}`,
        ),
      );
      // Check if the cert issuer matches an authorized CA
      if (input.certResult.found && input.certResult.issuer) {
        const issuerNormalized = normalizeIssuerOrg(input.certResult.issuer);
        const authorized = isIssuerAuthorizedByCAA(issuerNormalized, input.caa.authorizedCAs);
        if (authorized === false) {
          checks.push(
            check(
              "caa-issuer-mismatch",
              "spec",
              "CAA Issuer Match",
              "warn",
              `Certificate issuer "${issuerNormalized}" not in issuevmc authorized CAs`,
              {
                remediation:
                  "The certificate was issued by a CA not listed in your domain's CAA issuevmc records. " +
                  "Either add the CA to your CAA records or obtain a certificate from an authorized CA.",
              },
            ),
          );
        } else if (authorized === true) {
          checks.push(
            check("caa-issuer-mismatch", "spec", "CAA Issuer Match", "pass", "Certificate issuer matches CAA issuevmc"),
          );
        }
      }
    } else if (input.caa.status === "standard_only") {
      checks.push(
        check("caa-issuevmc", "spec", "CAA issuevmc", "info", "CAA records exist but no issuevmc tag found", {
          remediation:
            "Add a CAA record with the issuevmc property tag to explicitly authorize CAs for VMC issuance. " +
            'Example: 0 issuevmc "digicert.com"',
        }),
      );
    } else {
      checks.push(
        check("caa-issuevmc", "spec", "CAA issuevmc", "info", "No CAA records found (any CA may issue certificates)"),
      );
    }
  }

  // -- Compatibility checks --

  // Gmail dimensions
  if (input.svgResult.validation) {
    const warns = input.svgResult.validation.warnings;
    const missingDims = warns.some((w) => w.includes("Missing explicit width/height"));
    const smallDims = warns.some((w) => w.includes("below Gmail minimum"));
    if (missingDims || smallDims) {
      checks.push(
        check(
          "gmail-dimensions",
          "compatibility",
          "Gmail Dimensions",
          "warn",
          missingDims ? "Missing explicit width/height attributes" : "Dimensions below Gmail's 96x96 minimum",
        ),
      );
    } else {
      checks.push(
        check("gmail-dimensions", "compatibility", "Gmail Dimensions", "pass", "Dimensions meet Gmail requirements"),
      );
    }

    // Apple Mail path count
    const highPaths = warns.some((w) => w.includes("High path count"));
    if (highPaths) {
      checks.push(
        check(
          "apple-path-count",
          "compatibility",
          "Apple Mail Rendering",
          "warn",
          "High path count may render poorly at small display sizes",
        ),
      );
    }

    // Text-to-path
    const hasText = warns.some((w) => w.includes("<text> elements"));
    if (hasText) {
      checks.push(
        check(
          "text-to-path",
          "compatibility",
          "Text Elements",
          "warn",
          "Converting <text> to paths improves cross-client portability",
        ),
      );
    }
  }

  // SVGZ support (informational)
  if (input.bimiRecord?.logoUrl?.toLowerCase().endsWith(".svgz")) {
    checks.push(
      check("svgz-support", "compatibility", "SVGZ Format", "info", "Logo is served as SVGZ (gzip-compressed SVG)"),
    );
  }

  // Certificate type compatibility
  if (input.certResult.found) {
    const certType = input.certResult.certType;
    if (certType === "VMC") {
      checks.push(
        check(
          "cert-type-compat",
          "compatibility",
          "Certificate Type",
          "pass",
          "VMC provides maximum client compatibility",
        ),
      );
    } else if (certType === "CMC") {
      checks.push(
        check(
          "cert-type-compat",
          "compatibility",
          "Certificate Type",
          "info",
          "CMC is supported by Gmail and Apple Mail but requires no trademark",
        ),
      );
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
    const props = [`header.d=${domain}`, `header.selector=${selector}`];
    if (bimiRecord.authorityUrl) {
      props.push(`policy.authority=${bimiRecord.authorityUrl}`);
    }
    if (bimiRecord.logoUrl) {
      props.push(`policy.indicator-uri=${bimiRecord.logoUrl}`);
    }
    return `bimi=fail ${props.join(" ")}`;
  }

  const props = [`header.d=${domain}`, `header.selector=${selector}`];
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

function buildResponseHeaders(bimiRecord: BIMIRecord | null, svgContent: string | null): Record<string, string> {
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
// Internal helpers
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

/**
 * Validate the internal consistency of a PEM certificate chain.
 * Checks: issuer/subject chaining, signature verification, expiry, basicConstraints.
 * Does NOT validate against a root store (out of scope for a market intel tool).
 */
async function validateCertificateChain(pem: string): Promise<ChainValidationResult | null> {
  try {
    const chainErrors: string[] = [];

    // Extract all PEM blocks
    const pemBlocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!pemBlocks || pemBlocks.length === 0) {
      return { chainValid: false, chainErrors: ["No certificates found in PEM"], chainLength: 0 };
    }

    // Parse all certs
    const certs = pemBlocks.map((block) => {
      const der = pemToDer(block);
      return new X509Certificate(toArrayBuffer(der));
    });

    if (certs.length === 1) {
      return {
        chainValid: true,
        chainErrors: [
          "Only the leaf certificate was found. Include the intermediate CA certificate for a complete chain.",
        ],
        chainLength: 1,
      };
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
          chainErrors.push(`Chain break at position ${i}: issuer DN does not match next certificate's subject`);
        }

        try {
          const issuerSpki = issuer.publicKey.rawData;
          if (!issuerSpki || issuerSpki.byteLength === 0) {
            chainErrors.push(`Intermediate #${i + 1} has no public key`);
          }
        } catch {
          chainErrors.push(`Failed to read public key from certificate at position ${i + 1}`);
        }

        // Cryptographic signature verification: confirm cert[i] was signed by cert[i+1].
        // Treated as a warning only — some algorithms may not be supported by the runtime.
        try {
          const verified = await certs[i].verify({ publicKey: certs[i + 1].publicKey });
          if (!verified) {
            chainErrors.push(
              `Signature verification failed at position ${i}: certificate was not signed by the next certificate in the chain`,
            );
          }
        } catch {
          // Algorithm not supported — not a chain validation error
        }
      }
    }

    return {
      chainValid: chainErrors.length === 0,
      chainErrors,
      chainLength: certs.length,
    };
  } catch (err) {
    return {
      chainValid: false,
      chainErrors: [`Chain parsing failed: ${errorMessage(err)}`],
      chainLength: 0,
    };
  }
}
