import { getOrgDomain } from "./dmarc";
import { type BIMIRecord, lookupBIMIRecordAt } from "./dns";

export interface LpsLookupStep {
  step: number;
  description: string;
  dnsName: string;
  result: "found" | "not_found" | "skipped";
  record?: BIMIRecord;
}

export interface LpsTieredResult {
  normalizedLocalPart: string;
  steps: LpsLookupStep[];
  finalRecord: BIMIRecord | null;
  matchedPrefix: string | null;
}

/**
 * Normalize a local-part per draft-12 section 4.5:
 * 1. Strip subaddress (after +)
 * 2. Replace _ and . with -
 * 3. Collapse consecutive dashes, strip leading/trailing dashes
 * 4. Lowercase, max 63 chars
 * 5. Validate [a-z0-9-] only
 */
export function normalizeLocalPart(localPart: string): string {
  // Strip subaddress
  let normalized = localPart.split("+")[0];
  // Replace _ and . with -
  normalized = normalized.replace(/[_.]/g, "-");
  // Collapse consecutive dashes
  normalized = normalized.replace(/-{2,}/g, "-");
  // Strip leading/trailing dashes
  normalized = normalized.replace(/^-+|-+$/g, "");
  // Lowercase
  normalized = normalized.toLowerCase();
  // Truncate to 63 chars
  normalized = normalized.slice(0, 63);
  // Validate: only [a-z0-9-]
  if (!/^[a-z0-9-]*$/.test(normalized)) {
    return "";
  }
  return normalized;
}

/** Check if a normalized local-part matches any prefix in a comma-separated lps value */
export function matchesLpsPrefix(normalized: string, lpsValue: string): string | null {
  const prefixes = lpsValue.split(",").map((p) => p.trim().toLowerCase());
  for (const prefix of prefixes) {
    if (prefix && normalized.startsWith(prefix)) {
      return prefix;
    }
  }
  return null;
}

/**
 * Execute the LPS tiered DNS lookup sequence per draft-12 section 4.5:
 * 1. Query [selector]._bimi.[domain] for default record
 * 2. If record has lps=, prefix-match normalized local-part
 * 3. If match → query [normalized-local-part].[selector]._bimi.[domain]
 * 4. If specific record found → use it; else fallback to default
 * 5. If nothing at subdomain → try org domain (same sequence)
 */
export async function tieredLpsLookup(domain: string, selector: string, localPart: string): Promise<LpsTieredResult> {
  const normalized = normalizeLocalPart(localPart);
  const steps: LpsLookupStep[] = [];
  let stepNum = 1;

  const result = await tryLpsOnDomain(domain, selector, normalized, steps, stepNum);
  if (result.finalRecord) {
    return result;
  }

  // Try org domain fallback
  const orgDomain = getOrgDomain(domain);
  if (orgDomain) {
    stepNum = result.steps.length + 1;
    const orgResult = await tryLpsOnDomain(orgDomain, selector, normalized, steps, stepNum);
    if (orgResult.finalRecord) {
      orgResult.finalRecord.orgDomainFallback = true;
      orgResult.finalRecord.orgDomain = orgDomain;
    }
    return { ...orgResult, normalizedLocalPart: normalized };
  }

  return { normalizedLocalPart: normalized, steps, finalRecord: null, matchedPrefix: null };
}

async function tryLpsOnDomain(
  domain: string,
  selector: string,
  normalized: string,
  steps: LpsLookupStep[],
  startStep: number,
): Promise<LpsTieredResult> {
  let stepNum = startStep;
  const defaultDns = `${selector}._bimi.${domain}`;

  // Step: Look up default record
  const { record: defaultRecord } = await lookupBIMIRecordAt(domain, selector);
  steps.push({
    step: stepNum++,
    description: `Default BIMI record at ${domain}`,
    dnsName: defaultDns,
    result: defaultRecord ? "found" : "not_found",
    record: defaultRecord ?? undefined,
  });

  if (!defaultRecord) {
    return { normalizedLocalPart: normalized, steps, finalRecord: null, matchedPrefix: null };
  }

  // If no lps tag, just return the default
  if (!defaultRecord.lps) {
    steps.push({
      step: stepNum++,
      description: "No lps= tag in default record, skipping per-address lookup",
      dnsName: defaultDns,
      result: "skipped",
    });
    return { normalizedLocalPart: normalized, steps, finalRecord: defaultRecord, matchedPrefix: null };
  }

  // Check for prefix match
  const matchedPrefix = matchesLpsPrefix(normalized, defaultRecord.lps);
  if (!matchedPrefix) {
    steps.push({
      step: stepNum++,
      description: `No LPS prefix match for "${normalized}" in lps=${defaultRecord.lps}`,
      dnsName: defaultDns,
      result: "skipped",
    });
    return { normalizedLocalPart: normalized, steps, finalRecord: defaultRecord, matchedPrefix: null };
  }

  // Prefix matched — look up per-address record
  const perAddressDns = `${normalized}.${selector}._bimi.${domain}`;
  const { record: perAddressRecord } = await lookupBIMIRecordAt(domain, `${normalized}.${selector}`);
  steps.push({
    step: stepNum++,
    description: `Per-address lookup for "${normalized}" (matched prefix "${matchedPrefix}")`,
    dnsName: perAddressDns,
    result: perAddressRecord ? "found" : "not_found",
    record: perAddressRecord ?? undefined,
  });

  if (perAddressRecord) {
    return { normalizedLocalPart: normalized, steps, finalRecord: perAddressRecord, matchedPrefix };
  }

  // Fallback to default
  steps.push({
    step: stepNum,
    description: "Per-address record not found, falling back to default",
    dnsName: defaultDns,
    result: "found",
  });
  return { normalizedLocalPart: normalized, steps, finalRecord: defaultRecord, matchedPrefix };
}
