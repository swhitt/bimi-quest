import { SubjectAlternativeNameExtension, X509Certificate } from "@peculiar/x509";
import { BIMI_MARK_TYPE_OID } from "@/lib/bimi/oids";
import { bytesToHex } from "@/lib/hex";
import { decompressIfGzipped, pemToDer, sha256Hex, toArrayBuffer } from "@/lib/pem";
import { extractSubjectAttribute } from "@/lib/x509/asn1";
import type { CTLogEntry } from "./gorgon";

// BIMI-relevant OIDs
const LOGOTYPE_OID = "1.3.6.1.5.5.7.1.12";

export interface ParsedEntry {
  cert: X509Certificate;
  certDer: Uint8Array;
  chainPems: string[];
  timestamp: number;
  entryType: "x509" | "precert";
}

export interface ExtensionEntry {
  v: string; // hex-encoded DER value
  c: boolean; // critical flag
}

export interface BIMICertData {
  fingerprintSha256: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  subjectDn: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  subjectCountry: string | null;
  subjectState: string | null;
  subjectLocality: string | null;
  issuerDn: string;
  issuerCn: string | null;
  issuerOrg: string | null;
  sanList: string[];
  markType: string | null;
  certType: "VMC" | "CMC" | null;
  logotypeSvgHash: string | null;
  logotypeSvg: string | null;
  rawPem: string;
  extensionsJson: Record<string, ExtensionEntry>;
}

export function base64ToBuffer(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function derToPem(der: Uint8Array): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

export async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return bytesToHex(new Uint8Array(hash));
}

/** Read a 3-byte big-endian length from a buffer */
export function readUint24(buf: Uint8Array, offset: number): number {
  return buf[offset] * 65536 + (buf[offset + 1] << 8) + buf[offset + 2];
}

/** Read an 8-byte big-endian timestamp */
export function readUint64(buf: Uint8Array, offset: number): number {
  // JS can safely handle timestamps up to 2^53, so this is fine
  let val = 0;
  for (let i = 0; i < 8; i++) {
    val = val * 256 + buf[offset + i];
  }
  return val;
}

/**
 * Parse a CT log entry from Gorgon's get-entries response.
 * Returns null if the entry can't be parsed or isn't an X509/precert entry.
 */
export function parseCTLogEntry(entry: CTLogEntry): ParsedEntry | null {
  try {
    const leafBuf = base64ToBuffer(entry.leaf_input);

    // MerkleTreeLeaf structure:
    // version: 1 byte (should be 0 for v1)
    // leaf_type: 1 byte (should be 0 for timestamped_entry)
    // timestamp: 8 bytes
    // entry_type: 2 bytes (0 = x509_entry, 1 = precert_entry)
    const version = leafBuf[0];
    if (version !== 0) return null;

    const leafType = leafBuf[1];
    if (leafType !== 0) return null;

    const timestamp = readUint64(leafBuf, 2);
    const entryType = (leafBuf[10] << 8) | leafBuf[11];

    let certDer: Uint8Array;

    if (entryType === 0) {
      // X509 entry: 3-byte cert length, then cert DER
      const certLen = readUint24(leafBuf, 12);
      certDer = leafBuf.slice(15, 15 + certLen);
    } else if (entryType === 1) {
      // Precert entry: 32-byte issuer key hash, 3-byte tbs cert length, then TBS cert
      // We'll get the actual cert from extra_data instead
      const extraBuf = base64ToBuffer(entry.extra_data);
      // For precerts, extra_data starts with the pre-certificate (3-byte length + DER)
      const preCertLen = readUint24(extraBuf, 0);
      certDer = extraBuf.slice(3, 3 + preCertLen);
    } else {
      return null;
    }

    const cert = new X509Certificate(toArrayBuffer(certDer));
    const chainPems = parseChainFromExtraData(base64ToBuffer(entry.extra_data), entryType);

    return {
      cert,
      certDer,
      chainPems,
      timestamp,
      entryType: entryType === 0 ? "x509" : "precert",
    };
  } catch {
    return null;
  }
}

/** Check if a certificate has the logotype extension (BIMI indicator) */
export function hasBIMIOID(cert: X509Certificate): boolean {
  return cert.extensions.some((ext) => ext.type === LOGOTYPE_OID);
}

/** Extract all BIMI-relevant data from a certificate */
export async function extractBIMIData(cert: X509Certificate, certDer: Uint8Array): Promise<BIMICertData> {
  const fingerprint = await sha256(certDer);
  const pem = derToPem(certDer);

  // Parse subject fields from the DN
  const subjectCn = extractDnField(cert.subject, "CN");
  const subjectOrg = extractDnField(cert.subject, "O");
  const subjectCountry = extractDnField(cert.subject, "C");
  const subjectState = extractDnField(cert.subject, "ST");
  const subjectLocality = extractDnField(cert.subject, "L");

  const issuerCn = extractDnField(cert.issuer, "CN");
  const issuerOrg = extractDnField(cert.issuer, "O");

  // Extract SANs
  const sanList = extractSANs(cert);

  // Extract mark type from BIMI extension
  const markType = extractMarkType(cert);
  const certType = deriveCertType(markType);

  // Try to extract logotype SVG
  const { svgHash, svgContent } = extractLogotypeSvg(cert);

  // Build extensions JSON with criticality flags
  const extensionsJson: Record<string, ExtensionEntry> = {};
  for (const ext of cert.extensions) {
    extensionsJson[ext.type] = {
      v: bytesToHex(new Uint8Array(ext.value)),
      c: ext.critical,
    };
  }

  return {
    fingerprintSha256: fingerprint,
    serialNumber: cert.serialNumber,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    subjectDn: cert.subject,
    subjectCn,
    subjectOrg,
    subjectCountry,
    subjectState,
    subjectLocality,
    issuerDn: cert.issuer,
    issuerCn,
    issuerOrg,
    sanList,
    markType,
    certType,
    logotypeSvgHash: svgHash,
    logotypeSvg: svgContent,
    rawPem: pem,
    extensionsJson,
  };
}

const MAX_CHAIN_DEPTH = 10;

/** Parse certificate chain from extra_data */
export function parseChainFromExtraData(extraBuf: Uint8Array, entryType: number): string[] {
  const pems: string[] = [];
  try {
    let offset = 0;

    if (entryType === 0) {
      // X509: extra_data is a certificate_chain = opaque ASN.1Cert<1..2^24-1>
      // First 3 bytes = total chain length
      const totalLen = readUint24(extraBuf, 0);
      offset = 3;
      const end = Math.min(3 + totalLen, extraBuf.length);

      while (offset < end && pems.length < MAX_CHAIN_DEPTH) {
        const certLen = readUint24(extraBuf, offset);
        offset += 3;
        if (offset + certLen > extraBuf.length) break;
        const certDer = extraBuf.slice(offset, offset + certLen);
        pems.push(derToPem(certDer));
        offset += certLen;
      }
    } else if (entryType === 1) {
      // Precert: first cert is the pre-certificate, then the chain follows
      const preCertLen = readUint24(extraBuf, 0);
      offset = 3 + preCertLen;

      // Rest is the chain in the same format
      if (offset < extraBuf.length) {
        const totalLen = readUint24(extraBuf, offset);
        offset += 3;
        const end = Math.min(offset + totalLen, extraBuf.length);

        while (offset < end && pems.length < MAX_CHAIN_DEPTH) {
          const certLen = readUint24(extraBuf, offset);
          offset += 3;
          if (offset + certLen > extraBuf.length) break;
          const certDer = extraBuf.slice(offset, offset + certLen);
          pems.push(derToPem(certDer));
          offset += certLen;
        }
      }
    }
  } catch {
    // Chain parsing is best-effort
  }
  return pems;
}

/** Extract a field from an X.500 Distinguished Name string */
export function extractDnField(dn: string, field: string): string | null {
  // DN format: "CN=foo, O=bar, C=US" - commas within values are escaped as \,
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|,)\\s*${escaped}=((?:[^,\\\\]|\\\\.)*)`, "i");
  const match = dn.match(regex);
  if (!match) return null;
  // Unescape backslash-escaped characters
  return match[1].replace(/\\(.)/g, "$1").trim();
}

/** Extract Subject Alternative Names (DNS names) using @peculiar/x509 */
export function extractSANs(cert: X509Certificate): string[] {
  try {
    const sanExt = cert.getExtension(SubjectAlternativeNameExtension);
    if (!sanExt) return [];
    return sanExt.names.items.filter((n) => n.type === "dns").map((n) => n.value);
  } catch {
    return [];
  }
}

/**
 * Extract BIMI mark type from the subject DN by OID 1.3.6.1.4.1.53087.1.13.
 *
 * Uses DER-based ASN.1 parsing of the Subject Name for correctness — the string
 * representation can be lossy for non-standard OIDs. Falls back to regex on the
 * string DN if ASN.1 parsing fails (e.g. unusual certificate encoding).
 */
function extractMarkType(cert: X509Certificate): string | null {
  try {
    const result = extractSubjectAttribute(cert, BIMI_MARK_TYPE_OID);
    if (result) return result;
  } catch {
    // Fall through to string-based extraction
  }
  return extractDnField(cert.subject, BIMI_MARK_TYPE_OID);
}

/**
 * Known CMC (Common Mark Certificate) mark type values.
 * Uses exact matching via Set.has() to prevent future mark type values
 * from being misclassified by substring matching.
 */
const CMC_MARK_TYPES = new Set(["Prior Use Mark", "Modified Registered Mark", "Pending Registration Mark"]);

/**
 * Known VMC (Verified Mark Certificate) mark type values.
 */
const VMC_MARK_TYPES = new Set(["Registered Mark", "Government Mark"]);

/** Derive cert type (VMC or CMC) from mark type using exact matching */
export function deriveCertType(markType: string | null): "VMC" | "CMC" | null {
  if (!markType) return null;
  if (CMC_MARK_TYPES.has(markType)) return "CMC";
  if (VMC_MARK_TYPES.has(markType)) return "VMC";
  return null;
}

/** Try to extract SVG logotype from the logotype extension (RFC 3709).
 *  SVGs are embedded as gzip-compressed base64 data URIs inside the ASN.1 structure. */
export function extractLogotypeSvg(cert: X509Certificate): { svgHash: string | null; svgContent: string | null } {
  try {
    const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
    if (!ext) return { svgHash: null, svgContent: null };

    // Work with raw bytes to avoid UTF-8 decoding corruption of the ASN.1 framing
    const rawBytes = Buffer.from(ext.value);

    // Find the data URI marker in the raw bytes
    const marker = Buffer.from("data:image/svg+xml;base64,", "ascii");
    const offset = rawBytes.indexOf(marker);
    if (offset === -1) {
      // Fallback: check for raw SVG in decoded text
      const text = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
      const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        return { svgHash: sha256Hex(svgMatch[0]), svgContent: svgMatch[0] };
      }
      return { svgHash: null, svgContent: null };
    }

    // Extract base64 characters from raw bytes (avoids TextDecoder corruption)
    const b64Start = offset + marker.length;
    let b64 = "";
    for (let i = b64Start; i < rawBytes.length; i++) {
      const ch = rawBytes[i];
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
        // skip whitespace in base64
      } else {
        break; // end of base64 payload
      }
    }

    if (!b64) return { svgHash: null, svgContent: null };

    const decoded = base64ToBuffer(b64);
    const svg = decompressIfGzipped(decoded);
    if (svg && svg.includes("<svg")) {
      return { svgHash: sha256Hex(svg), svgContent: svg };
    }

    return { svgHash: null, svgContent: null };
  } catch {
    return { svgHash: null, svgContent: null };
  }
}

/** Extract the SHA-256 hash from the logotype extension (OID 1.3.6.1.5.5.7.1.12).
 *  The hash is embedded as a 32-byte OCTET STRING (DER tag 04, length 20h) in the ASN.1 structure. */
function extractLogotypeSvgHash(cert: X509Certificate): string | null {
  try {
    const ext = cert.getExtension(LOGOTYPE_OID);
    if (!ext) return null;
    const rawHex = Buffer.from(ext.value).toString("hex");
    const hashMatch = rawHex.match(/0420([0-9a-f]{64})/);
    return hashMatch ? hashMatch[1] : null;
  } catch {
    return null;
  }
}

export interface CertBasicInfo {
  issuer: string;
  issuerOrg: string | null;
  notBefore: Date;
  notAfter: Date;
  certType: "VMC" | "CMC" | null;
  markType: string | null;
  sans: string[];
  logotypeSvgHash: string | null;
}

/** Parse a PEM certificate and return basic BIMI-relevant info.
 *  Returns null if the PEM cannot be parsed. */
export function parseCertBasicInfo(pem: string): CertBasicInfo | null {
  try {
    const der = pemToDer(pem);
    const cert = new X509Certificate(toArrayBuffer(der));
    const markType = extractMarkType(cert);
    return {
      issuer: cert.issuer,
      issuerOrg: extractDnField(cert.issuer, "O") ?? extractDnField(cert.issuer, "2.5.4.10"),
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      certType: deriveCertType(markType),
      markType,
      sans: extractSANs(cert),
      logotypeSvgHash: extractLogotypeSvgHash(cert),
    };
  } catch {
    return null;
  }
}

// Re-export pemToDer (validate.ts and others import it from here)
export { pemToDer };

/** Compute SHA-256 fingerprint of a PEM-encoded certificate */
export async function computePemFingerprint(pem: string): Promise<string> {
  const der = pemToDer(pem);
  return sha256(der);
}

/** Parse a chain cert minimally to extract subject/issuer DNs */
export function parseChainCert(
  pem: string,
): { subjectDn: string; issuerDn: string; notBefore: Date; notAfter: Date } | null {
  try {
    const der = pemToDer(pem);
    const cert = new X509Certificate(toArrayBuffer(der));
    return {
      subjectDn: cert.subject,
      issuerDn: cert.issuer,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
    };
  } catch {
    return null;
  }
}
