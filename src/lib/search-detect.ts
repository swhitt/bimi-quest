// Classifies a search query into a type based on its format.
// Used by both the hero search and the nav search.

export type SearchType = "domain" | "serial" | "fingerprint" | "text";

// Hex with standard separators (colons, dashes, spaces) but NOT dots
const HEX_SEPARATED = /^[0-9a-f][0-9a-f:\- ]*$/i;

function stripHexSeparators(input: string): string {
  return input.replace(/[:\-\s]/g, "");
}

function isHex(s: string): boolean {
  return /^[0-9a-f]+$/i.test(s);
}

function looksLikeDomain(input: string): boolean {
  return input.includes(".") && !input.includes(" ") && /^[a-z0-9@._:/-]+$/i.test(input);
}

export function detectSearchType(raw: string): SearchType {
  const input = raw.trim();
  if (!input) return "text";

  // Check domain first so "abed.cafe" is not mistaken for hex
  if (looksLikeDomain(input)) {
    return "domain";
  }

  const stripped = stripHexSeparators(input);

  // SHA-256 fingerprint: exactly 64 hex chars (with or without colon/dash/space separators)
  if (stripped.length === 64 && isHex(stripped) && HEX_SEPARATED.test(input)) {
    return "fingerprint";
  }

  // Serial number: 16-40 hex chars
  if (stripped.length >= 16 && stripped.length <= 40 && isHex(stripped) && HEX_SEPARATED.test(input)) {
    return "serial";
  }

  // Shorter hex strings (8+ chars) that could be a serial or fingerprint prefix
  if (stripped.length >= 8 && isHex(stripped) && HEX_SEPARATED.test(input)) {
    return "serial";
  }

  return "text";
}

// Normalize hex input by stripping separators and lowering case
export function normalizeHex(input: string): string {
  return stripHexSeparators(input).toLowerCase();
}

// Extract a clean domain from user input (strips protocol, email prefix, paths)
export function extractDomain(input: string): string {
  let cleaned = input.trim();
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@").pop() || cleaned;
  }
  cleaned = cleaned.replace(/^https?:\/\//, "").split("/")[0];
  return cleaned.toLowerCase();
}
