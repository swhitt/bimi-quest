import { promises as dns } from "dns";
import { getDomain } from "tldts";
import { errorMessage } from "@/lib/utils";
import { isDnsNotFoundError, withDnsTimeout } from "./dns-utils";
import { parseTxtTagList } from "./txt-tags";

export interface DMARCRecord {
  raw: string;
  version: string;
  policy: "none" | "quarantine" | "reject";
  pct: number;
  rua: string | null;
  ruf: string | null;
  sp: string | null;
  /** DKIM alignment mode: "r" (relaxed, default) or "s" (strict) */
  adkim: string | null;
  /** SPF alignment mode: "r" (relaxed, default) or "s" (strict) */
  aspf: string | null;
  /** Failure reporting options: "0" (default), "1", "d", "s", or colon-delimited combo */
  fo: string | null;
}

/** Extract organizational domain (registered domain) from a full domain
 *  using Mozilla's Public Suffix List via tldts. */
export function getOrgDomain(domain: string): string | null {
  const orgDomain = getDomain(domain);
  // Return null if tldts can't parse it or it's already the org domain
  if (!orgDomain || orgDomain === domain) return null;
  return orgDomain;
}

export interface DMARCLookupResult {
  record: DMARCRecord;
  /** True when the record was found at the org domain, not the queried domain */
  isSubdomain: boolean;
}

/** Look up the DMARC TXT record for a domain, falling back to the
 *  organizational domain per RFC 7489 section 6.6.3 */
export async function lookupDMARC(domain: string): Promise<DMARCLookupResult | null> {
  // Try exact domain first
  const record = await lookupDMARCAt(domain);
  if (record) return { record, isSubdomain: false };

  // Fall back to organizational domain per RFC 7489 section 6.6.3
  const orgDomain = getOrgDomain(domain);
  if (orgDomain && orgDomain !== domain) {
    const orgRecord = await lookupDMARCAt(orgDomain);
    if (orgRecord) return { record: orgRecord, isSubdomain: true };
  }

  return null;
}

async function lookupDMARCAt(domain: string): Promise<DMARCRecord | null> {
  try {
    const records = await withDnsTimeout(dns.resolveTxt(`_dmarc.${domain}`));
    const dmarcRecords = records.map((r) => r.join("")).filter((txt) => txt.toLowerCase().startsWith("v=dmarc1"));

    // RFC 7489 Section 6.6.3: if more than one DMARC record is found,
    // the result MUST be treated as if no record was published.
    if (dmarcRecords.length > 1) {
      throw new Error(`Multiple DMARC records found at _dmarc.${domain} (RFC 7489 \u00a76.6.3 violation)`);
    }

    if (dmarcRecords.length === 0) return null;
    return parseDMARCRecord(dmarcRecords[0]);
  } catch (err: unknown) {
    if (isDnsNotFoundError(err)) return null;
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(`DNS lookup failed for _dmarc.${domain}: ${code ?? errorMessage(err)}`);
  }
}

/** Parse a DMARC TXT record string */
export function parseDMARCRecord(txt: string): DMARCRecord {
  const { tags } = parseTxtTagList(txt);

  // Lowercase policy values for case-insensitive comparison (DNS TXT records
  // may have inconsistent casing, e.g. "Reject" or "QUARANTINE").
  const policy = (tags["p"]?.toLowerCase() || "none") as "none" | "quarantine" | "reject";
  const sp = tags["sp"]?.toLowerCase() || null;
  const adkim = tags["adkim"]?.toLowerCase() || null;
  const aspf = tags["aspf"]?.toLowerCase() || null;
  const fo = tags["fo"] || null;

  return {
    raw: txt,
    version: tags["v"] || "DMARC1",
    policy,
    pct: tags["pct"] ? parseInt(tags["pct"], 10) : 100,
    rua: tags["rua"] || null,
    ruf: tags["ruf"] || null,
    sp,
    adkim,
    aspf,
    fo,
  };
}

/** Check if a DMARC record meets BIMI requirements.
 *  When checking a subdomain, the sp= tag (subdomain policy) takes
 *  precedence over p= if present. */
export function isDMARCValidForBIMI(record: DMARCRecord, isSubdomain = false): boolean {
  return getDMARCBIMIReason(record, isSubdomain) === null;
}

/** Returns null if the DMARC record is valid for BIMI, or a specific reason string if not.
 *  When checking a subdomain, the sp= tag (subdomain policy) takes
 *  precedence over p= if present. */
export function getDMARCBIMIReason(record: DMARCRecord, isSubdomain = false): string | null {
  const effectivePolicy = isSubdomain && record.sp ? record.sp : record.policy;

  if (effectivePolicy !== "quarantine" && effectivePolicy !== "reject") {
    if (isSubdomain && record.sp === "none") {
      return "sp=none explicitly blocks BIMI for subdomains";
    }
    return `Policy is '${effectivePolicy}', must be 'quarantine' or 'reject'`;
  }
  // pct must be 100 (default if not specified)
  if (record.pct !== 100) {
    return `pct=${record.pct}, must be 100`;
  }
  return null;
}
