import { promises as dns } from "dns";

export interface DMARCRecord {
  raw: string;
  version: string;
  policy: "none" | "quarantine" | "reject";
  pct: number;
  rua: string | null;
  ruf: string | null;
  sp: string | null;
}

/** Extract organizational domain (registered domain) from a full domain.
 *  Handles common two-part TLDs like co.uk, com.au, co.jp, etc. */
function getOrgDomain(domain: string): string | null {
  const parts = domain.split(".");
  if (parts.length <= 2) return null; // already at org level

  const TWO_PART_TLDS = new Set([
    "co.uk", "org.uk", "ac.uk", "gov.uk",
    "com.au", "net.au", "org.au", "edu.au",
    "co.jp", "or.jp", "ne.jp", "ac.jp",
    "co.nz", "net.nz", "org.nz",
    "co.za", "org.za", "web.za",
    "com.br", "net.br", "org.br",
    "co.in", "net.in", "org.in",
    "co.kr", "or.kr", "ne.kr",
    "com.cn", "net.cn", "org.cn",
    "com.tw", "net.tw", "org.tw",
    "com.mx", "net.mx", "org.mx",
    "com.sg", "net.sg", "org.sg",
    "co.il", "org.il", "net.il",
    "com.tr", "net.tr", "org.tr",
  ]);

  const lastTwo = parts.slice(-2).join(".");
  if (TWO_PART_TLDS.has(lastTwo) && parts.length > 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

/** Look up the DMARC TXT record for a domain, falling back to the
 *  organizational domain per RFC 7489 section 6.6.3 */
export async function lookupDMARC(
  domain: string
): Promise<DMARCRecord | null> {
  // Try exact domain first
  const record = await lookupDMARCAt(domain);
  if (record) return record;

  // Fall back to organizational domain per RFC 7489 section 6.6.3
  const orgDomain = getOrgDomain(domain);
  if (orgDomain && orgDomain !== domain) {
    return lookupDMARCAt(orgDomain);
  }

  return null;
}

async function lookupDMARCAt(domain: string): Promise<DMARCRecord | null> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    for (const record of records) {
      const txt = record.join("");
      if (txt.toLowerCase().startsWith("v=dmarc1")) {
        return parseDMARCRecord(txt);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse a DMARC TXT record string */
export function parseDMARCRecord(txt: string): DMARCRecord {
  const tags: Record<string, string> = {};
  const parts = txt.split(";").map((s) => s.trim());

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim().toLowerCase();
    const value = part.substring(eqIdx + 1).trim();
    tags[key] = value;
  }

  const policy = tags["p"] as "none" | "quarantine" | "reject";

  return {
    raw: txt,
    version: tags["v"] || "DMARC1",
    policy: policy || "none",
    pct: tags["pct"] ? parseInt(tags["pct"], 10) : 100,
    rua: tags["rua"] || null,
    ruf: tags["ruf"] || null,
    sp: tags["sp"] || null,
  };
}

/** Check if a DMARC record meets BIMI requirements.
 *  When checking a subdomain, the sp= tag (subdomain policy) takes
 *  precedence over p= if present. */
export function isDMARCValidForBIMI(record: DMARCRecord, isSubdomain = false): boolean {
  const effectivePolicy = isSubdomain && record.sp
    ? record.sp
    : record.policy;

  if (effectivePolicy !== "quarantine" && effectivePolicy !== "reject") {
    return false;
  }
  // pct must be 100 (default if not specified)
  if (record.pct !== 100) {
    return false;
  }
  return true;
}
