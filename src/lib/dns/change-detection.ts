/**
 * DNS change detection: TXT record parsing, JSONB comparison, and
 * semantic change_type derivation for BIMI and DMARC records.
 */

/** Parse a semicolon-delimited TXT record into normalized k/v pairs. */
export function parseTxtRecord(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      // Lowercase keys (tag names), but preserve value case (URIs are case-sensitive)
      result[trimmed.slice(0, eq).trim().toLowerCase()] = trimmed.slice(eq + 1).trim();
    }
  }
  return result;
}

/** Ordered severity: none(0) < quarantine(1) < reject(2). */
const DMARC_POLICY_RANK: Record<string, number> = { none: 0, quarantine: 1, reject: 2 };

export type BimiChangeType =
  | "record_created"
  | "record_removed"
  | "record_ambiguous"
  | "logo_url_changed"
  | "authority_url_changed"
  | "declination_set"
  | "tags_modified";

export type DmarcChangeType =
  | "record_created"
  | "record_removed"
  | "record_ambiguous"
  | "policy_weakened"
  | "policy_strengthened"
  | "tags_modified";

export function deriveBimiChangeType(
  old: Record<string, string> | null,
  new_: Record<string, string> | null,
): BimiChangeType {
  if (!old) return "record_created";
  if (!new_) return "record_removed";
  if (old.l !== new_.l) {
    // Declination: new record has empty l= tag
    if (new_.l === "") return "declination_set";
    return "logo_url_changed";
  }
  if (old.a !== new_.a) return "authority_url_changed";
  if (new_.l === "" && old.l !== "") return "declination_set";
  return "tags_modified";
}

export function deriveDmarcChangeType(
  old: Record<string, string> | null,
  new_: Record<string, string> | null,
): DmarcChangeType {
  if (!old) return "record_created";
  if (!new_) return "record_removed";

  const oldRank = DMARC_POLICY_RANK[old.p?.toLowerCase() ?? ""] ?? -1;
  const newRank = DMARC_POLICY_RANK[new_.p?.toLowerCase() ?? ""] ?? -1;

  if (oldRank >= 0 && newRank >= 0) {
    if (newRank < oldRank) return "policy_weakened";
    if (newRank > oldRank) return "policy_strengthened";
  }

  return "tags_modified";
}

/** Deep-compare two parsed records. Returns true if they differ. */
export function recordsChanged(a: Record<string, string> | null, b: Record<string, string> | null): boolean {
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return true;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return true;
    if (a[keysA[i]] !== b[keysB[i]]) return true;
  }
  return false;
}
