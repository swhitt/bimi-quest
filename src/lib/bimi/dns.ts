import { promises as dns } from "dns";
import { errorMessage } from "@/lib/utils";
import { getOrgDomain } from "./dmarc";
import { isDnsNotFoundError, withDnsTimeout } from "./dns-utils";
import { parseTxtTagList } from "./txt-tags";

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

export interface BIMILookupResult {
  record: BIMIRecord | null;
  recordCount: number;
}

/** Look up the BIMI TXT record for a domain under the given selector,
 *  falling back to the org domain if no record is found. */
export async function lookupBIMIRecord(domain: string, selector: string = "default"): Promise<BIMILookupResult> {
  // Try the exact domain first
  const result = await lookupBIMIRecordAt(domain, selector);
  if (result.record) return result;

  // Fall back to organizational domain
  const orgDomain = getOrgDomain(domain);
  if (!orgDomain) return result;

  const orgResult = await lookupBIMIRecordAt(orgDomain, selector);
  if (orgResult.record) {
    orgResult.record.orgDomainFallback = true;
    orgResult.record.orgDomain = orgDomain;
  }
  // Return whichever has the higher count (captures ambiguous records at either level)
  return orgResult.recordCount > result.recordCount ? orgResult : { ...orgResult, recordCount: result.recordCount };
}

export async function lookupBIMIRecordAt(domain: string, selector: string): Promise<BIMILookupResult> {
  try {
    const records = await withDnsTimeout(dns.resolveTxt(`${selector}._bimi.${domain}`));
    const bimiRecords = records.map((r) => r.join("")).filter((txt) => txt.toLowerCase().startsWith("v=bimi1"));

    // Per BIMI spec, multiple BIMI records for the same selector is an error
    // condition — treat as if no record was published.
    if (bimiRecords.length > 1) {
      return { record: null, recordCount: bimiRecords.length };
    }

    if (bimiRecords.length === 0) return { record: null, recordCount: 0 };
    return { record: parseBIMIRecord(bimiRecords[0], selector), recordCount: 1 };
  } catch (err: unknown) {
    if (isDnsNotFoundError(err)) return { record: null, recordCount: 0 };
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(code ?? errorMessage(err));
  }
}

/** Parse a BIMI TXT record string into structured data */
export function parseBIMIRecord(txt: string, selector: string = "default"): BIMIRecord {
  const { tags, presentTags } = parseTxtTagList(txt);

  // Declination: both l= and a= explicitly present but empty
  const declined = presentTags.has("l") && presentTags.has("a") && tags["l"] === "" && tags["a"] === "";

  const avpRaw = tags["avp"]?.toLowerCase();
  const avp: "brand" | "personal" | null = avpRaw === "brand" || avpRaw === "personal" ? avpRaw : null;

  return {
    raw: txt,
    version: tags["v"] || "BIMI1",
    logoUrl: tags["l"] || null,
    authorityUrl: tags["a"] || null,
    lps: presentTags.has("lps") ? tags["lps"] || null : null,
    avp,
    declined,
    selector,
    orgDomainFallback: false,
    orgDomain: null,
  };
}
