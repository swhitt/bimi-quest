import { promises as dns } from "dns";
import { getOrgDomain } from "./dmarc";

export interface BIMIRecord {
  raw: string;
  version: string;
  logoUrl: string | null;
  authorityUrl: string | null;
  lps: string | null;
  avp: "brand" | "personal" | null;
  declined: boolean;
  selector: string;
  orgDomainFallback: boolean;
  orgDomain: string | null;
}

/** Look up the BIMI TXT record for a domain under the given selector,
 *  falling back to the org domain if no record is found. */
export async function lookupBIMIRecord(
  domain: string,
  selector: string = "default"
): Promise<BIMIRecord | null> {
  // Try the exact domain first
  const record = await lookupBIMIRecordAt(domain, selector);
  if (record) return record;

  // Fall back to organizational domain
  const orgDomain = getOrgDomain(domain);
  if (!orgDomain) return null;

  const orgRecord = await lookupBIMIRecordAt(orgDomain, selector);
  if (orgRecord) {
    orgRecord.orgDomainFallback = true;
    orgRecord.orgDomain = orgDomain;
  }
  return orgRecord;
}

async function lookupBIMIRecordAt(
  domain: string,
  selector: string
): Promise<BIMIRecord | null> {
  try {
    const records = await dns.resolveTxt(`${selector}._bimi.${domain}`);
    // TXT records can be split across multiple strings, concatenate them
    for (const record of records) {
      const txt = record.join("");
      if (txt.toLowerCase().startsWith("v=bimi1")) {
        return parseBIMIRecord(txt, selector);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse a BIMI TXT record string into structured data */
export function parseBIMIRecord(
  txt: string,
  selector: string = "default"
): BIMIRecord {
  const tags: Record<string, string> = {};
  // Track which tags were explicitly present (even if empty)
  const presentTags = new Set<string>();
  const parts = txt.split(";").map((s) => s.trim());

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim().toLowerCase();
    const value = part.substring(eqIdx + 1).trim();
    tags[key] = value;
    presentTags.add(key);
  }

  // Declination: both l= and a= explicitly present but empty
  const declined =
    presentTags.has("l") &&
    presentTags.has("a") &&
    tags["l"] === "" &&
    tags["a"] === "";

  const avpRaw = tags["avp"]?.toLowerCase();
  const avp: "brand" | "personal" | null =
    avpRaw === "brand" || avpRaw === "personal" ? avpRaw : null;

  return {
    raw: txt,
    version: tags["v"] || "BIMI1",
    logoUrl: tags["l"] || null,
    authorityUrl: tags["a"] || null,
    lps: presentTags.has("lps") ? (tags["lps"] || null) : null,
    avp,
    declined,
    selector,
    orgDomainFallback: false,
    orgDomain: null,
  };
}
