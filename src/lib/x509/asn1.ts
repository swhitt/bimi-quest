/**
 * Reusable DER/ASN.1 parsing utilities for X.509 certificate analysis.
 * Provides low-level TLV parsing and higher-level helpers for extracting
 * attributes from certificate Subject DNs by OID.
 *
 * Operates on raw DER bytes to avoid regex-on-string fragility.
 */

import type { X509Certificate } from "@peculiar/x509";

// ── ASN.1 tag constants ──────────────────────────────────────────────

const TAG_OID = 0x06;
const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;
const TAG_UTF8_STRING = 0x0c;
const TAG_PRINTABLE_STRING = 0x13;
const TAG_IA5_STRING = 0x16;
const TAG_BMP_STRING = 0x1e;
const TAG_T61_STRING = 0x14;

/** Tags that encode string values in X.500 AttributeValue */
const STRING_TAGS = new Set([TAG_UTF8_STRING, TAG_PRINTABLE_STRING, TAG_IA5_STRING, TAG_BMP_STRING, TAG_T61_STRING]);

// ── DER TLV primitives ──────────────────────────────────────────────

export interface TlvNode {
  tag: number;
  /** Raw value bytes (content only, no tag/length header) */
  value: Uint8Array;
  /** Total bytes consumed including tag + length header */
  totalLength: number;
}

/**
 * Read a single DER TLV (Tag-Length-Value) element from `buf` at `offset`.
 * Returns the parsed node or null if the buffer is too short.
 */
export function readDerTlv(buf: Uint8Array, offset: number): TlvNode | null {
  if (offset >= buf.length) return null;

  const tag = buf[offset];
  let pos = offset + 1;
  if (pos >= buf.length) return null;

  // Decode length
  const firstLenByte = buf[pos];
  pos++;
  let length: number;

  if (firstLenByte < 0x80) {
    length = firstLenByte;
  } else if (firstLenByte === 0x80) {
    // Indefinite length — not supported in DER (only BER)
    return null;
  } else {
    const numLenBytes = firstLenByte & 0x7f;
    if (pos + numLenBytes > buf.length) return null;
    length = 0;
    for (let i = 0; i < numLenBytes; i++) {
      length = (length << 8) | buf[pos + i];
    }
    pos += numLenBytes;
  }

  if (pos + length > buf.length) return null;

  return {
    tag,
    value: buf.subarray(pos, pos + length),
    totalLength: pos - offset + length,
  };
}

/**
 * Parse all child TLV nodes from a constructed DER element's value bytes.
 */
export function parseChildren(value: Uint8Array): TlvNode[] {
  const children: TlvNode[] = [];
  let offset = 0;
  while (offset < value.length) {
    const child = readDerTlv(value, offset);
    if (!child) break;
    children.push(child);
    offset += child.totalLength;
  }
  return children;
}

// ── OID encoding/decoding ───────────────────────────────────────────

/**
 * Decode a DER-encoded OID value (tag 0x06 content bytes) to dotted string.
 */
export function decodeOid(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const parts: number[] = [];
  parts.push(Math.floor(bytes[0] / 40));
  parts.push(bytes[0] % 40);
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value << 7) | (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

/**
 * Encode a dotted OID string into DER content bytes (without tag/length).
 */
export function encodeOid(oid: string): Uint8Array {
  const parts = oid.split(".").map(Number);
  if (parts.length < 2) return new Uint8Array(0);

  const bytes: number[] = [];
  bytes.push(parts[0] * 40 + parts[1]);

  for (let i = 2; i < parts.length; i++) {
    const val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      // Multi-byte base-128 encoding with continuation bits
      const encoded: number[] = [];
      let v = val;
      encoded.push(v & 0x7f);
      v >>= 7;
      while (v > 0) {
        encoded.push((v & 0x7f) | 0x80);
        v >>= 7;
      }
      encoded.reverse();
      bytes.push(...encoded);
    }
  }

  return new Uint8Array(bytes);
}

// ── String decoding ─────────────────────────────────────────────────

/**
 * Decode a DER string value (UTF8String, PrintableString, IA5String, etc.)
 * to a JS string. Returns null for non-string tags.
 */
export function decodeStringValue(tag: number, value: Uint8Array): string | null {
  if (!STRING_TAGS.has(tag)) return null;

  if (tag === TAG_BMP_STRING) {
    // BMPString is UCS-2 big-endian
    const chars: string[] = [];
    for (let i = 0; i + 1 < value.length; i += 2) {
      chars.push(String.fromCharCode((value[i] << 8) | value[i + 1]));
    }
    return chars.join("");
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(value);
}

// ── Subject DN attribute extraction ─────────────────────────────────

/**
 * Extract an attribute value from a certificate's Subject DN by OID.
 *
 * Parses the DER-encoded Subject directly from the TBSCertificate rather
 * than relying on the string representation, which can be lossy or
 * ambiguous for non-standard OIDs.
 *
 * Works for any OID — not limited to well-known attributes.
 *
 * @param cert - An @peculiar/x509 X509Certificate
 * @param oid - Dotted OID string (e.g. "2.5.4.3" for CN, "1.3.6.1.4.1.53087.1.13" for BIMI mark type)
 * @returns The attribute value as a string, or null if not found
 */
export function extractSubjectAttribute(cert: X509Certificate, oid: string): string | null {
  return extractDnAttribute(cert.subjectName.toArrayBuffer(), oid);
}

/**
 * Extract an attribute value from an issuer DN by OID.
 */
export function extractIssuerAttribute(cert: X509Certificate, oid: string): string | null {
  return extractDnAttribute(cert.issuerName.toArrayBuffer(), oid);
}

/**
 * Extract an attribute value from a DER-encoded Name (RDNSequence) by OID.
 *
 * X.501 Name structure:
 *   Name ::= SEQUENCE OF RelativeDistinguishedName
 *   RelativeDistinguishedName ::= SET OF AttributeTypeAndValue
 *   AttributeTypeAndValue ::= SEQUENCE { type OID, value ANY }
 */
export function extractDnAttribute(derName: ArrayBuffer, oid: string): string | null {
  const buf = new Uint8Array(derName);
  const targetOidBytes = encodeOid(oid);

  // Parse the outer SEQUENCE (Name = SEQUENCE OF RDN)
  const nameNode = readDerTlv(buf, 0);
  if (!nameNode || nameNode.tag !== TAG_SEQUENCE) return null;

  // Iterate over RDNs (each is a SET)
  const rdns = parseChildren(nameNode.value);
  for (const rdn of rdns) {
    if (rdn.tag !== TAG_SET) continue;

    // Iterate over AttributeTypeAndValue pairs in this RDN
    const atvs = parseChildren(rdn.value);
    for (const atv of atvs) {
      if (atv.tag !== TAG_SEQUENCE) continue;

      // Parse type (OID) and value
      const atvChildren = parseChildren(atv.value);
      if (atvChildren.length < 2) continue;

      const typeNode = atvChildren[0];
      const valueNode = atvChildren[1];

      if (typeNode.tag !== TAG_OID) continue;

      // Compare OID bytes directly (faster than decoding to string)
      if (bytesEqual(typeNode.value, targetOidBytes)) {
        return decodeStringValue(valueNode.tag, valueNode.value);
      }
    }
  }

  return null;
}

/**
 * Extract all attributes from a DER-encoded Name as OID->value pairs.
 * Useful for debugging or inspecting unknown DNs.
 */
export function extractAllDnAttributes(derName: ArrayBuffer): Map<string, string> {
  const result = new Map<string, string>();
  const buf = new Uint8Array(derName);

  const nameNode = readDerTlv(buf, 0);
  if (!nameNode || nameNode.tag !== TAG_SEQUENCE) return result;

  const rdns = parseChildren(nameNode.value);
  for (const rdn of rdns) {
    if (rdn.tag !== TAG_SET) continue;
    const atvs = parseChildren(rdn.value);
    for (const atv of atvs) {
      if (atv.tag !== TAG_SEQUENCE) continue;
      const atvChildren = parseChildren(atv.value);
      if (atvChildren.length < 2) continue;
      const typeNode = atvChildren[0];
      const valueNode = atvChildren[1];
      if (typeNode.tag !== TAG_OID) continue;
      const oidStr = decodeOid(typeNode.value);
      const val = decodeStringValue(valueNode.tag, valueNode.value);
      if (val !== null) {
        result.set(oidStr, val);
      }
    }
  }

  return result;
}

/** Constant-time-ish byte array equality check */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
