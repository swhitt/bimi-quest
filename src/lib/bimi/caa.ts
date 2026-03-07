import { promises as dns } from "dns";
import { errorMessage } from "@/lib/utils";
import { isDnsNotFoundError, withDnsTimeout } from "./dns-utils";

export interface CAAEntry {
  critical: number;
  tag: string;
  value: string;
}

export type CAAStatus = "permissive" | "standard_only" | "vmc_authorized";

export interface CAAResult {
  status: CAAStatus;
  entries: CAAEntry[];
  issueVmcEntries: CAAEntry[];
  authorizedCAs: string[];
}

// Maps issuevmc domain values to display-friendly CA org names
const VMC_CA_DOMAINS: Record<string, string> = {
  "digicert.com": "DigiCert",
  "entrust.net": "Entrust",
  "globalsign.com": "GlobalSign",
  "sectigo.com": "Sectigo",
  "ssl.com": "SSL.com",
};

// Known CAA property tag names that Node.js dns.resolveCaa() uses as object keys
const CAA_TAG_KEYS = ["issue", "issuewild", "iodef", "contactemail", "contactphone", "issuevmc"] as const;

/** Convert a Node.js CaaRecord (which uses the tag name as a property key) to our flat CAAEntry format */
function parseCaaRecord(record: Record<string, unknown>): CAAEntry {
  const critical = (record.critical as number) ?? 0;
  for (const key of CAA_TAG_KEYS) {
    if (key in record) {
      return { critical, tag: key, value: String(record[key]) };
    }
  }
  // Fallback: look for any non-critical property
  for (const [key, value] of Object.entries(record)) {
    if (key !== "critical" && typeof value === "string") {
      return { critical, tag: key, value };
    }
  }
  return { critical, tag: "unknown", value: "" };
}

/** Look up CAA records for a domain and extract issuevmc entries */
export async function lookupCAA(domain: string): Promise<CAAResult> {
  let entries: CAAEntry[];
  try {
    const records = await withDnsTimeout(dns.resolveCaa(domain));
    entries = records.map((r) => parseCaaRecord(r as unknown as Record<string, unknown>));
  } catch (err: unknown) {
    if (isDnsNotFoundError(err)) {
      return { status: "permissive", entries: [], issueVmcEntries: [], authorizedCAs: [] };
    }
    throw new Error(`CAA lookup failed for ${domain}: ${errorMessage(err)}`);
  }

  if (entries.length === 0) {
    return { status: "permissive", entries: [], issueVmcEntries: [], authorizedCAs: [] };
  }

  const issueVmcEntries = entries.filter((e) => e.tag === "issuevmc");

  if (issueVmcEntries.length === 0) {
    return { status: "standard_only", entries, issueVmcEntries: [], authorizedCAs: [] };
  }

  const authorizedCAs = issueVmcEntries
    .map((e) => {
      const caDomain = e.value.split(";")[0].trim().toLowerCase();
      return VMC_CA_DOMAINS[caDomain] || caDomain;
    })
    .filter(Boolean);

  return { status: "vmc_authorized", entries, issueVmcEntries, authorizedCAs };
}

/** Check if a certificate issuer is authorized by the domain's CAA issuevmc records */
export function isIssuerAuthorizedByCAA(issuerOrg: string | null, authorizedCAs: string[]): boolean | null {
  if (authorizedCAs.length === 0) return null;
  if (!issuerOrg) return false;
  const normalized = issuerOrg.toLowerCase();
  return authorizedCAs.some((ca) => ca.toLowerCase() === normalized);
}
