/**
 * DNS TXT record tag annotations — human-readable labels and value
 * interpretation for DMARC, BIMI, and DKIM records.
 *
 * Record-type-aware: tags like `p`, `s`, `t` mean different things
 * depending on whether they appear in a DMARC, BIMI, or DKIM record.
 * The record type is inferred from the `v=` tag in the parsed record.
 */

import { resolveRuaProviders } from "@/lib/rua-providers";

export type RecordType = "dmarc" | "bimi" | "dkim" | "unknown";

/** Detect record type from a parsed tag map via the v= tag. */
export function detectRecordType(tags: Record<string, string> | null): RecordType {
  const v = tags?.v?.toUpperCase();
  if (v === "DMARC1") return "dmarc";
  if (v === "BIMI1") return "bimi";
  if (v === "DKIM1") return "dkim";
  return "unknown";
}

// ── Per-record-type tag labels ──────────────────────────────────────

const DMARC_TAG_LABELS: Record<string, string> = {
  v: "version",
  p: "policy",
  sp: "subdomain policy",
  pct: "percentage",
  rua: "aggregate reports",
  ruf: "forensic reports",
  adkim: "DKIM alignment",
  aspf: "SPF alignment",
  fo: "failure options",
  rf: "report format",
  ri: "reporting interval",
};

const BIMI_TAG_LABELS: Record<string, string> = {
  v: "version",
  l: "logo URL",
  a: "authority URL",
  avp: "authority verification",
  lps: "logo protection",
};

const DKIM_TAG_LABELS: Record<string, string> = {
  v: "version",
  k: "key type",
  p: "public key",
  h: "hash algorithms",
  t: "flags",
  s: "service type",
  n: "notes",
  g: "granularity",
};

/** Flat fallback used when record type is unknown (backwards compat). */
const FALLBACK_TAG_LABELS: Record<string, string> = {
  ...DMARC_TAG_LABELS,
  ...BIMI_TAG_LABELS,
};

const TAG_LABELS_BY_TYPE: Record<RecordType, Record<string, string>> = {
  dmarc: DMARC_TAG_LABELS,
  bimi: BIMI_TAG_LABELS,
  dkim: DKIM_TAG_LABELS,
  unknown: FALLBACK_TAG_LABELS,
};

/** Get the human-readable label for a tag abbreviation. */
export function getTagLabel(tag: string, recordType: RecordType = "unknown"): string | null {
  return TAG_LABELS_BY_TYPE[recordType][tag] ?? FALLBACK_TAG_LABELS[tag] ?? null;
}

// ── Value interpreters ──────────────────────────────────────────────

function describePolicy(value: string): string | null {
  const v = value.toLowerCase();
  if (v === "none") return "No action taken; monitoring only";
  if (v === "quarantine") return "Treat failing mail as suspicious (e.g., junk folder)";
  if (v === "reject") return "Reject failing mail outright";
  return null;
}

function describeAlignment(value: string): string | null {
  const v = value.toLowerCase();
  if (v === "r") return "Relaxed — org domain match is sufficient";
  if (v === "s") return "Strict — exact domain match required";
  return null;
}

function describeFo(value: string): string {
  const tokens = new Set(value.split(":").map((t) => t.trim().toLowerCase()));
  if (tokens.has("1")) return "Report on any auth failure (DKIM or SPF)";
  const parts: string[] = [];
  if (tokens.has("d")) parts.push("DKIM");
  if (tokens.has("s")) parts.push("SPF");
  if (parts.length > 0) return `Report on ${parts.join(" and ")} failure only`;
  if (tokens.has("0")) return "Report only when all checks fail (default)";
  return value;
}

function describeReportUri(value: string): string | null {
  const providers = resolveRuaProviders(value);
  const addrs = [...value.matchAll(/mailto:([^,!;\s]+)/gi)].map((m) => m[1]);
  if (addrs.length === 0) return null;
  const lines: string[] = [];
  if (providers.length > 0) lines.push(`Provider: ${providers.join(", ")}`);
  lines.push(addrs.length === 1 ? `→ ${addrs[0]}` : addrs.map((a) => `→ ${a}`).join("\n"));
  return lines.join("\n");
}

function describeUrl(value: string, kind: string): string | null {
  try {
    const url = new URL(value);
    return `${kind} hosted at ${url.hostname}`;
  } catch {
    return null;
  }
}

function describeVersion(value: string): string | null {
  const v = value.toUpperCase();
  if (v === "BIMI1") return "BIMI version 1 record";
  if (v === "DMARC1") return "DMARC version 1 record";
  if (v === "DKIM1") return "DKIM version 1 record";
  return null;
}

// ── DMARC interpreter ───────────────────────────────────────────────

function describeDmarcTag(tag: string, value: string): string | null {
  switch (tag) {
    case "v":
      return describeVersion(value);
    case "p":
    case "sp":
      return describePolicy(value);
    case "adkim":
    case "aspf":
      return describeAlignment(value);
    case "fo":
      return describeFo(value);
    case "rua":
    case "ruf":
      return describeReportUri(value);
    case "ri": {
      const seconds = parseInt(value, 10);
      if (Number.isNaN(seconds)) return null;
      if (seconds >= 3600) return `Report every ~${Math.round(seconds / 3600)}h`;
      if (seconds >= 60) return `Report every ~${Math.round(seconds / 60)}min`;
      return `Report every ${seconds}s`;
    }
    case "pct": {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return null;
      return n === 100 ? "Apply policy to all messages (default)" : `Apply policy to ${n}% of messages`;
    }
    case "rf":
      return value.toLowerCase() === "afrf" ? "Authentication Failure Reporting Format (default)" : null;
    default:
      return null;
  }
}

// ── BIMI interpreter ────────────────────────────────────────────────

function describeBimiTag(tag: string, value: string): string | null {
  switch (tag) {
    case "v":
      return describeVersion(value);
    case "l":
      return value === "" ? "No logo — BIMI declined" : describeUrl(value, "SVG logo");
    case "a":
      return value === "" ? "No authority — BIMI declined" : describeUrl(value, "VMC/CMC certificate");
    case "avp": {
      const v = value.toLowerCase();
      if (v === "brand") return "Brand indicator — requires VMC from a Certificate Authority";
      if (v === "personal") return "Personal indicator — self-asserted, no CA certificate needed";
      return null;
    }
    case "lps":
      return "Logo protection scope";
    default:
      return null;
  }
}

// ── DKIM interpreter ────────────────────────────────────────────────

function describeDkimTag(tag: string, value: string): string | null {
  switch (tag) {
    case "v":
      return describeVersion(value);
    case "k": {
      const v = value.toLowerCase();
      if (v === "rsa") return "RSA key pair";
      if (v === "ed25519") return "Ed25519 key pair (elliptic curve)";
      return null;
    }
    case "p":
      if (value === "") return "Key revoked — signatures using this selector are invalid";
      return `${Math.round((((value.length * 3) / 4) * 8) / 1024)}k-bit public key`;
    case "h": {
      const algos = value.split(":").map((a) => a.trim().toLowerCase());
      const names = algos.map((a) => (a === "sha256" ? "SHA-256" : a === "sha1" ? "SHA-1 (weak)" : a));
      return `Hash: ${names.join(", ")}`;
    }
    case "t": {
      const flags = value.split(":").map((f) => f.trim().toLowerCase());
      const parts: string[] = [];
      if (flags.includes("y")) parts.push("testing mode — verifiers should treat as unsigned");
      if (flags.includes("s")) parts.push("strict — signing domain must exactly match From: domain");
      return parts.length > 0 ? parts.join("\n") : null;
    }
    case "s": {
      const v = value.toLowerCase();
      if (v === "*") return "All service types (default)";
      if (v === "email") return "Email signing only";
      return null;
    }
    case "n":
      return value;
    default:
      return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

const INTERPRETERS: Record<RecordType, (tag: string, value: string) => string | null> = {
  dmarc: describeDmarcTag,
  bimi: describeBimiTag,
  dkim: describeDkimTag,
  unknown: (tag, value) => describeDmarcTag(tag, value) ?? describeBimiTag(tag, value),
};

/** Interpret a tag value given the record type. Returns a human-readable
 *  description, or null if the value isn't annotatable. */
export function describeTagValue(tag: string, value: string, recordType: RecordType = "unknown"): string | null {
  return INTERPRETERS[recordType](tag, value);
}
