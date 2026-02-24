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

/** Look up the DMARC TXT record for a domain */
export async function lookupDMARC(
  domain: string
): Promise<DMARCRecord | null> {
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

/** Check if a DMARC record meets BIMI requirements */
export function isDMARCValidForBIMI(record: DMARCRecord): boolean {
  // BIMI requires p=quarantine or p=reject
  if (record.policy !== "quarantine" && record.policy !== "reject") {
    return false;
  }
  // pct must be 100 (default if not specified)
  if (record.pct !== 100) {
    return false;
  }
  return true;
}
