import type { X509Certificate } from "@peculiar/x509";
import { gunzipSync } from "node:zlib";
import { validateSVGTinyPS } from "@/lib/bimi/svg";
import type { LintRule } from "../types";

const LOGOTYPE_OID = "1.3.6.1.5.5.7.1.12";
const DATA_URI_MARKER = "data:image/svg+xml;base64,";
const SHA256_OID_HEX = "0609608648016503040201";
// SHA-1 OID: 06 05 2b 0e 03 02 1a
const SHA1_OID_HEX = "06052b0e03021a";

const logotypePresent: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
  return {
    rule: "e_bimi_logotype_present",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "Logotype extension must be present",
    status: ext ? "pass" : "fail",
    detail: ext ? undefined : "Logotype extension (1.3.6.1.5.5.7.1.12) is missing",
  };
};

function getRawExtensionBytes(cert: X509Certificate): Buffer | null {
  const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
  if (!ext) return null;
  return Buffer.from(ext.value);
}

/** Extract base64 payload from the logotype extension after the data URI marker.
 *  Returns null if the marker is not found. `maxLen` limits extraction (0 = unlimited). */
function extractBase64FromLogotype(raw: Buffer, maxLen = 0): string | null {
  const marker = Buffer.from(DATA_URI_MARKER, "ascii");
  const offset = raw.indexOf(marker);
  if (offset === -1) return null;

  const b64Start = offset + marker.length;
  let b64 = "";
  for (let i = b64Start; i < raw.length; i++) {
    if (maxLen > 0 && b64.length >= maxLen) break;
    const ch = raw[i];
    if (
      (ch >= 65 && ch <= 90) ||
      (ch >= 97 && ch <= 122) ||
      (ch >= 48 && ch <= 57) ||
      ch === 43 ||
      ch === 47 ||
      ch === 61
    ) {
      b64 += String.fromCharCode(ch);
    } else if (ch === 10 || ch === 13 || ch === 32) {
      // skip whitespace
    } else {
      break;
    }
  }
  return b64.length > 0 ? b64 : null;
}

const logotypeNotCritical: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
  if (!ext) {
    return {
      rule: "e_bimi_logotype_not_critical",
      severity: "error",
      source: "RFC3709",
      citation: "RFC 3709 §2.1",
      title: "Logotype extension must not be critical",
      status: "not_applicable",
    };
  }
  return {
    rule: "e_bimi_logotype_not_critical",
    severity: "error",
    source: "RFC3709",
    citation: "RFC 3709 §2.1",
    title: "Logotype extension must not be critical",
    status: ext.critical ? "fail" : "pass",
    detail: ext.critical ? "Logotype extension is marked critical (must be non-critical per RFC 3709)" : undefined,
  };
};

const logotypeDataUri: LintRule = (cert) => {
  const raw = getRawExtensionBytes(cert);
  if (!raw) {
    return {
      rule: "e_bimi_logotype_data_uri",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "Logotype must contain data: URI",
      status: "not_applicable",
    };
  }
  const marker = Buffer.from(DATA_URI_MARKER, "ascii");
  const found = raw.indexOf(marker) !== -1;
  return {
    rule: "e_bimi_logotype_data_uri",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "Logotype must contain data: URI",
    status: found ? "pass" : "fail",
    detail: found ? undefined : "No data:image/svg+xml;base64, URI found in logotype extension",
  };
};

const svgCompressed: LintRule = (cert) => {
  const raw = getRawExtensionBytes(cert);
  if (!raw) {
    return {
      rule: "e_bimi_svg_compressed",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must be gzip-compressed",
      status: "not_applicable",
    };
  }

  const b64 = extractBase64FromLogotype(raw, 8);
  if (!b64) {
    return {
      rule: "e_bimi_svg_compressed",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must be gzip-compressed",
      status: "not_applicable",
    };
  }

  if (b64.length < 4) {
    return {
      rule: "e_bimi_svg_compressed",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must be gzip-compressed",
      status: "fail",
      detail: "Could not decode base64 payload",
    };
  }

  const decoded = Buffer.from(b64, "base64");
  const isGzip = decoded.length >= 2 && decoded[0] === 0x1f && decoded[1] === 0x8b;
  return {
    rule: "e_bimi_svg_compressed",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "SVG must be gzip-compressed",
    status: isGzip ? "pass" : "fail",
    detail: isGzip ? undefined : "SVG payload is not gzip-compressed",
  };
};

const svgTinyPs: LintRule = (cert) => {
  const raw = getRawExtensionBytes(cert);
  if (!raw) {
    return {
      rule: "e_bimi_svg_tiny_ps",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must conform to SVG Tiny PS",
      status: "not_applicable",
    };
  }

  const b64 = extractBase64FromLogotype(raw);
  if (!b64) {
    return {
      rule: "e_bimi_svg_tiny_ps",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must conform to SVG Tiny PS",
      status: "fail",
      detail: "No SVG data URI found to validate",
    };
  }

  try {
    const decoded = Buffer.from(b64, "base64");
    const svg = gunzipSync(decoded).toString("utf-8");
    const validation = validateSVGTinyPS(svg);

    if (validation.valid) {
      return {
        rule: "e_bimi_svg_tiny_ps",
        severity: "error",
        source: "MCR",
        citation: "MCR §7.1.2.7",
        title: "SVG must conform to SVG Tiny PS",
        status: "pass",
      };
    }

    const issues = [...validation.errors, ...validation.warnings];
    return {
      rule: "e_bimi_svg_tiny_ps",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must conform to SVG Tiny PS",
      status: "fail",
      detail: issues.join("; "),
    };
  } catch {
    return {
      rule: "e_bimi_svg_tiny_ps",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must conform to SVG Tiny PS",
      status: "fail",
      detail: "Failed to decompress SVG content",
    };
  }
};

const logotypeHashPresent: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
  if (!ext) {
    return {
      rule: "e_bimi_logotype_hash_present",
      severity: "error",
      source: "RFC3709",
      citation: "RFC 3709 §2.1",
      title: "Logotype must contain a hash",
      status: "not_applicable",
    };
  }
  const rawHex = Buffer.from(ext.value).toString("hex");
  const hasSha256 = rawHex.includes(SHA256_OID_HEX);
  const hasSha1 = rawHex.includes(SHA1_OID_HEX);
  return {
    rule: "e_bimi_logotype_hash_present",
    severity: "error",
    source: "RFC3709",
    citation: "RFC 3709 §2.1",
    title: "Logotype must contain a hash",
    status: hasSha256 || hasSha1 ? "pass" : "fail",
    detail:
      hasSha256 || hasSha1
        ? undefined
        : "No recognized hash algorithm OID (SHA-1 or SHA-256) found in logotype extension",
  };
};

const logotypeHashSha256: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
  if (!ext) {
    return {
      rule: "n_bimi_logotype_hash_sha256",
      severity: "notice",
      source: "RFC3709",
      citation: "RFC 3709 §2.1",
      title: "Logotype hash should use SHA-256",
      status: "not_applicable",
    };
  }
  const rawHex = Buffer.from(ext.value).toString("hex");
  const hasSha256 = rawHex.includes(SHA256_OID_HEX);
  if (hasSha256) {
    return {
      rule: "n_bimi_logotype_hash_sha256",
      severity: "notice",
      source: "RFC3709",
      citation: "RFC 3709 §2.1",
      title: "Logotype hash should use SHA-256",
      status: "pass",
    };
  }
  const hasSha1 = rawHex.includes(SHA1_OID_HEX);
  return {
    rule: "n_bimi_logotype_hash_sha256",
    severity: "notice",
    source: "RFC3709",
    citation: "RFC 3709 §2.1",
    title: "Logotype hash should use SHA-256",
    status: hasSha1 ? "fail" : "not_applicable",
    detail: hasSha1 ? "Logotype uses SHA-1 hash; SHA-256 recommended for stronger integrity" : undefined,
  };
};

export const rules: LintRule[] = [
  logotypePresent,
  logotypeNotCritical,
  logotypeDataUri,
  svgCompressed,
  svgTinyPs,
  logotypeHashPresent,
  logotypeHashSha256,
];
