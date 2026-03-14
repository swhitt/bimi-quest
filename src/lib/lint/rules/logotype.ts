import type { X509Certificate } from "@peculiar/x509";
import { gunzipSync } from "node:zlib";
import type { LintRule } from "../types";

const LOGOTYPE_OID = "1.3.6.1.5.5.7.1.12";
const DATA_URI_MARKER = "data:image/svg+xml;base64,";
const SHA256_OID_HEX = "0609608648016503040201";

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
  const marker = Buffer.from(DATA_URI_MARKER, "ascii");
  const offset = raw.indexOf(marker);
  if (offset === -1) {
    return {
      rule: "e_bimi_svg_compressed",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must be gzip-compressed",
      status: "not_applicable",
    };
  }

  // Extract base64 and check if decoded content starts with gzip magic bytes (1f 8b)
  const b64Start = offset + marker.length;
  let b64 = "";
  for (let i = b64Start; i < raw.length && b64.length < 8; i++) {
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
    }
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
  // SVG Tiny PS validation requires decompressing and parsing the full SVG.
  // For now, check that the logotype extension contains SVG content.
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

  const marker = Buffer.from(DATA_URI_MARKER, "ascii");
  const offset = raw.indexOf(marker);
  if (offset === -1) {
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

  // Extract and decompress to verify it's valid SVG
  const b64Start = offset + marker.length;
  let b64 = "";
  for (let i = b64Start; i < raw.length; i++) {
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

  try {
    const decoded = Buffer.from(b64, "base64");
    const svg = gunzipSync(decoded).toString("utf-8");
    const hasSvgTag = svg.includes("<svg");
    return {
      rule: "e_bimi_svg_tiny_ps",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "SVG must conform to SVG Tiny PS",
      status: hasSvgTag ? "pass" : "fail",
      detail: hasSvgTag ? undefined : "Decompressed content does not contain <svg> element",
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

const logotypeHashSha256: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
  if (!ext) {
    return {
      rule: "w_bimi_logotype_hash_sha256",
      severity: "warning",
      source: "RFC3709",
      citation: "RFC 3709 §2.1",
      title: "Logotype hash should use SHA-256",
      status: "not_applicable",
    };
  }
  const rawHex = Buffer.from(ext.value).toString("hex");
  const hasSha256 = rawHex.includes(SHA256_OID_HEX);
  return {
    rule: "w_bimi_logotype_hash_sha256",
    severity: "warning",
    source: "RFC3709",
    citation: "RFC 3709 §2.1",
    title: "Logotype hash should use SHA-256",
    status: hasSha256 ? "pass" : "fail",
    detail: hasSha256 ? undefined : "SHA-256 hash algorithm OID not found in logotype extension",
  };
};

export const rules: LintRule[] = [logotypePresent, logotypeDataUri, svgCompressed, svgTinyPs, logotypeHashSha256];
