// SCT (Signed Certificate Timestamp) binary parser.
// SCTs use TLS wire format (RFC 6962), not ASN.1, so they need manual parsing.
// Browser-safe: uses only Uint8Array and DataView (no Node.js Buffer).

import { hexToBytes } from "@/lib/hex";

export interface ParsedSCT {
  version: number;
  logId: string; // base64-encoded 32-byte log ID
  timestamp: number; // ms since epoch
  hashAlgorithm: number;
  signatureAlgorithm: number;
}

/**
 * Strip an outer ASN.1 OCTET STRING wrapper (tag 0x04 + DER length).
 * Returns the inner bytes. If no wrapper is present, returns the input unchanged.
 */
function stripOctetStringWrapper(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 2 || bytes[0] !== 0x04) return bytes;
  let offset = 1;
  let len = bytes[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | bytes[offset++];
    }
  }
  return bytes.slice(offset, offset + len);
}

/** Convert a Uint8Array to a base64 string (browser-safe). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Parse an SCT list from the hex-encoded extension value for OID 1.3.6.1.4.1.11129.2.4.2.
 *
 * The wire format is:
 *   - Outer OCTET STRING wrapper (ASN.1 tag 0x04 + length)
 *   - 2-byte total list length
 *   - For each SCT: 2-byte SCT length prefix, then:
 *     - Version (1 byte, expect 0 for v1)
 *     - Log ID (32 bytes)
 *     - Timestamp (8 bytes, big-endian ms since epoch)
 *     - Extensions length (2 bytes) + extensions data
 *     - Hash algorithm (1 byte)
 *     - Signature algorithm (1 byte)
 *     - Signature length (2 bytes) + signature data
 */
export function parseSCTList(hex: string): ParsedSCT[] {
  const raw = hexToBytes(hex);
  const inner = stripOctetStringWrapper(raw);

  if (inner.length < 2) return [];

  const view = new DataView(inner.buffer, inner.byteOffset, inner.byteLength);
  const listLen = view.getUint16(0);
  const scts: ParsedSCT[] = [];
  let offset = 2;
  const end = Math.min(2 + listLen, inner.length);

  while (offset + 2 < end) {
    const sctLen = view.getUint16(offset);
    offset += 2;
    const sctEnd = offset + sctLen;
    if (sctEnd > inner.length) break;

    // Version (1 byte)
    const version = inner[offset++];

    // Log ID (32 bytes)
    if (offset + 32 > sctEnd) break;
    const logIdBytes = inner.slice(offset, offset + 32);
    const logId = uint8ToBase64(logIdBytes);
    offset += 32;

    // Timestamp (8 bytes big-endian)
    if (offset + 8 > sctEnd) break;
    const hi = view.getUint32(offset);
    const lo = view.getUint32(offset + 4);
    const timestamp = hi * 0x100000000 + lo;
    offset += 8;

    // Extensions (2-byte length + data)
    if (offset + 2 > sctEnd) break;
    const extLen = view.getUint16(offset);
    offset += 2 + extLen;

    // Hash algorithm (1 byte) + signature algorithm (1 byte)
    if (offset + 2 > sctEnd) break;
    const hashAlgorithm = inner[offset++];
    const signatureAlgorithm = inner[offset++];

    // Signature (2-byte length + data) — skip over
    if (offset + 2 > sctEnd) break;
    const sigLen = view.getUint16(offset);
    offset += 2 + sigLen;

    scts.push({ version, logId, timestamp, hashAlgorithm, signatureAlgorithm });
  }

  return scts;
}
