import { promises as dns } from "dns";
import { errorMessage } from "@/lib/utils";
import { getOrgDomain } from "./dmarc";
import { parseTxtTagList } from "./txt-tags";

const DNS_TIMEOUT_MS = 10_000;

function withDnsTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`DNS timed out after ${DNS_TIMEOUT_MS}ms`), { code: "ETIMEOUT" })),
      DNS_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
export async function lookupBIMIRecord(domain: string, selector: string = "default"): Promise<BIMIRecord | null> {
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

async function lookupBIMIRecordAt(domain: string, selector: string): Promise<BIMIRecord | null> {
  try {
    const records = await withDnsTimeout(dns.resolveTxt(`${selector}._bimi.${domain}`));
    // TXT records can be split across multiple strings, concatenate them
    for (const record of records) {
      const txt = record.join("");
      if (txt.toLowerCase().startsWith("v=bimi1")) {
        return parseBIMIRecord(txt, selector);
      }
    }
    return null;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return null;
    throw new Error(`DNS lookup failed for ${selector}._bimi.${domain}: ${code ?? errorMessage(err)}`);
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
