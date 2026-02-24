import { X509Certificate } from "@peculiar/x509";
import type { CTLogEntry } from "./gorgon";

// BIMI-relevant OIDs
const LOGOTYPE_OID = "1.3.6.1.5.5.7.1.12";
const BIMI_MARK_TYPE_OID = "1.3.6.1.4.1.53087.1.13";

export interface ParsedEntry {
  cert: X509Certificate;
  certDer: Uint8Array;
  chainPems: string[];
  timestamp: number;
  entryType: "x509" | "precert";
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
  extensionsJson: Record<string, string>;
}

function base64ToBuffer(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function derToPem(der: Uint8Array): string {
  let b64: string;
  if (typeof Buffer !== "undefined") {
    b64 = Buffer.from(der).toString("base64");
  } else {
    b64 = btoa(String.fromCharCode(...der));
  }
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return bufferToHex(new Uint8Array(hash));
}

/** Read a 3-byte big-endian length from a buffer */
function readUint24(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
}

/** Read an 8-byte big-endian timestamp */
function readUint64(buf: Uint8Array, offset: number): number {
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

    const cert = new X509Certificate(certDer.buffer.slice(certDer.byteOffset, certDer.byteOffset + certDer.byteLength) as ArrayBuffer);
    const chainPems = parseChainFromExtraData(
      base64ToBuffer(entry.extra_data),
      entryType
    );

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
export async function extractBIMIData(
  cert: X509Certificate,
  certDer: Uint8Array
): Promise<BIMICertData> {
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

  // Build extensions JSON
  const extensionsJson: Record<string, string> = {};
  for (const ext of cert.extensions) {
    extensionsJson[ext.type] = bufferToHex(
      new Uint8Array(ext.value)
    );
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

/** Parse certificate chain from extra_data */
export function parseChainFromExtraData(
  extraBuf: Uint8Array,
  entryType: number
): string[] {
  const pems: string[] = [];
  try {
    let offset = 0;

    if (entryType === 0) {
      // X509: extra_data is a certificate_chain = opaque ASN.1Cert<1..2^24-1>
      // First 3 bytes = total chain length
      const totalLen = readUint24(extraBuf, 0);
      offset = 3;
      const end = Math.min(3 + totalLen, extraBuf.length);

      while (offset < end) {
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

        while (offset < end) {
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
function extractDnField(dn: string, field: string): string | null {
  // DN format: "CN=foo, O=bar, C=US" or "CN=foo,O=bar,C=US"
  const regex = new RegExp(`(?:^|,)\\s*${field}=([^,]+)`, "i");
  const match = dn.match(regex);
  return match ? match[1].trim() : null;
}

/** Extract Subject Alternative Names (DNS names) */
function extractSANs(cert: X509Certificate): string[] {
  try {
    const sanExt = cert.extensions.find(
      (ext) => ext.type === "2.5.29.17" // subjectAltName OID
    );
    if (!sanExt) return [];

    // @peculiar/x509 provides a SubjectAlternativeNameExtension type
    // but we'll parse the extension value manually for DNS names
    // The SAN extension contains a SEQUENCE of GeneralNames
    // GeneralName with tag [2] (context-specific, primitive) is dNSName
    const value = new Uint8Array(
      sanExt.value
    );
    return parseSANDnsNames(value);
  } catch {
    return [];
  }
}

/** Parse DNS names from a SubjectAlternativeName extension value (DER-encoded) */
function parseSANDnsNames(data: Uint8Array): string[] {
  const names: string[] = [];
  try {
    // Skip outer SEQUENCE tag and length
    let offset = 0;
    if (data[offset] !== 0x30) return names; // Not a SEQUENCE
    offset++;
    const seqLen = readDerLength(data, offset);
    offset += seqLen.bytesRead;

    const end = offset + seqLen.length;
    while (offset < end && offset < data.length) {
      const tag = data[offset];
      offset++;
      const lenInfo = readDerLength(data, offset);
      offset += lenInfo.bytesRead;

      // Context-specific tag [2] = dNSName (tag byte = 0x82)
      if (tag === 0x82) {
        const nameBytes = data.slice(offset, offset + lenInfo.length);
        const name = new TextDecoder().decode(nameBytes);
        names.push(name);
      }

      offset += lenInfo.length;
    }
  } catch {
    // Best-effort SAN parsing
  }
  return names;
}

/** Read a DER length field (handles short and long forms) */
function readDerLength(
  data: Uint8Array,
  offset: number
): { length: number; bytesRead: number } {
  const first = data[offset];
  if (first < 0x80) {
    return { length: first, bytesRead: 1 };
  }
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | data[offset + 1 + i];
  }
  return { length, bytesRead: 1 + numBytes };
}

/** Extract BIMI mark type from the BIMI mark type extension */
function extractMarkType(cert: X509Certificate): string | null {
  try {
    const ext = cert.extensions.find((e) => e.type === BIMI_MARK_TYPE_OID);
    if (!ext) return null;

    // The mark type extension value contains a UTF8String or PrintableString
    // with the mark type value
    const value = new Uint8Array(ext.value);
    // Try to decode as a simple string (skip ASN.1 wrapper if present)
    const text = new TextDecoder().decode(value);

    // Look for known mark types in the decoded text
    const knownTypes = [
      "Registered Mark",
      "Government Mark",
      "Prior Use Mark",
      "Modified Registered Mark",
    ];
    for (const type of knownTypes) {
      if (text.includes(type)) return type;
    }

    // Fall back to the raw text if it looks reasonable
    const cleaned = text.replace(/[\x00-\x1f]/g, "").trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

/** Derive cert type (VMC or CMC) from mark type */
function deriveCertType(markType: string | null): "VMC" | "CMC" | null {
  if (!markType) return null;
  // VMC = Verified Mark Certificate (requires trademark verification)
  // Known VMC mark types
  const vmcTypes = [
    "Registered Mark",
    "Government Mark",
    "Prior Use Mark",
    "Modified Registered Mark",
  ];
  if (vmcTypes.some((t) => markType.includes(t))) return "VMC";
  // If it has a mark type but not a known VMC type, it might be a CMC
  return "CMC";
}

/** Try to extract SVG logotype from the logotype extension */
function extractLogotypeSvg(
  cert: X509Certificate
): { svgHash: string | null; svgContent: string | null } {
  try {
    const ext = cert.extensions.find((e) => e.type === LOGOTYPE_OID);
    if (!ext) return { svgHash: null, svgContent: null };

    // The logotype extension (RFC 3709) contains ASN.1-encoded logotype data
    // that may include embedded or referenced SVG images.
    // The structure is complex: LogotypeExtn -> LogotypeInfo -> LogotypeData -> LogotypeImage
    // For now, we'll look for SVG content in the raw bytes (base64-encoded SVG or raw XML)
    const value = new Uint8Array(ext.value);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(value);

    // Look for embedded SVG (might be base64 encoded within the ASN.1 structure)
    const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      const svg = svgMatch[0];
      // Simple hash of the SVG content
      const hash = simpleHash(svg);
      return { svgHash: hash, svgContent: svg };
    }

    // Look for base64-encoded SVG within the extension
    // The logotype extension often contains a data URI or embedded gzip+base64 SVG
    // This is a best-effort extraction
    return { svgHash: null, svgContent: null };
  } catch {
    return { svgHash: null, svgContent: null };
  }
}

/** Simple non-crypto hash for SVG deduplication */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/** Parse a chain cert minimally to extract subject/issuer DNs */
export function parseChainCert(
  pem: string
): { subjectDn: string; issuerDn: string; notBefore: Date; notAfter: Date } | null {
  try {
    // Convert PEM to DER
    const b64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const der = base64ToBuffer(b64);
    const cert = new X509Certificate(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
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
