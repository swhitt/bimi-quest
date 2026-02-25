import { promises as dns } from "dns";

export interface BIMIRecord {
  raw: string;
  version: string;
  logoUrl: string | null;
  authorityUrl: string | null;
}

/** Look up the BIMI TXT record for a domain under the given selector */
export async function lookupBIMIRecord(
  domain: string,
  selector: string = "default"
): Promise<BIMIRecord | null> {
  try {
    const records = await dns.resolveTxt(`${selector}._bimi.${domain}`);
    // TXT records can be split across multiple strings, concatenate them
    for (const record of records) {
      const txt = record.join("");
      if (txt.toLowerCase().startsWith("v=bimi1")) {
        return parseBIMIRecord(txt);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse a BIMI TXT record string into structured data */
export function parseBIMIRecord(txt: string): BIMIRecord {
  const tags: Record<string, string> = {};
  const parts = txt.split(";").map((s) => s.trim());

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim().toLowerCase();
    const value = part.substring(eqIdx + 1).trim();
    tags[key] = value;
  }

  return {
    raw: txt,
    version: tags["v"] || "BIMI1",
    logoUrl: tags["l"] || null,
    authorityUrl: tags["a"] || null,
  };
}
