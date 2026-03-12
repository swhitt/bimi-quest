// Lightweight ASN.1 DER decoder for X.509 certificate extensions.
// Decodes well-known extension OIDs into human-readable text.
// Runs client-side (no Node.js dependencies).

import { ALL_OID_NAMES } from "./asn1-tree";

// ── ASN.1 tag constants ──────────────────────────────────────────────

const TAG_BOOLEAN = 0x01;
const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_OCTET_STRING = 0x04;
const TAG_OID = 0x06;
const TAG_UTF8_STRING = 0x0c;
const TAG_PRINTABLE_STRING = 0x13;
const TAG_IA5_STRING = 0x16;

// Context-specific tags (used in extensions for implicit/explicit tagging)
const TAG_CONTEXT_PRIM_0 = 0x80;
const TAG_CONTEXT_PRIM_1 = 0x81;
const TAG_CONTEXT_PRIM_2 = 0x82;
const TAG_CONTEXT_PRIM_6 = 0x86;

// ── DER parsing primitives ───────────────────────────────────────────

interface DerNode {
  tag: number;
  bytes: number[]; // raw value bytes
  children?: DerNode[];
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToAscii(bytes: number[]): string {
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

function readLength(bytes: number[], offset: number): { length: number; bytesRead: number } {
  const first = bytes[offset];
  if (first < 0x80) return { length: first, bytesRead: 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | bytes[offset + 1 + i];
  }
  return { length, bytesRead: 1 + numBytes };
}

function parseDer(bytes: number[], offset = 0): { node: DerNode; bytesConsumed: number } {
  const tag = bytes[offset];
  const lenInfo = readLength(bytes, offset + 1);
  const valueStart = offset + 1 + lenInfo.bytesRead;
  const valueBytes = bytes.slice(valueStart, valueStart + lenInfo.length);
  const totalConsumed = 1 + lenInfo.bytesRead + lenInfo.length;

  const isConstructed = (tag & 0x20) !== 0;
  const node: DerNode = { tag, bytes: valueBytes };

  if (isConstructed && lenInfo.length > 0) {
    node.children = [];
    let childOffset = 0;
    while (childOffset < valueBytes.length) {
      try {
        const { node: child, bytesConsumed } = parseDer(valueBytes, childOffset);
        node.children.push(child);
        childOffset += bytesConsumed;
      } catch {
        break;
      }
    }
  }

  return { node, bytesConsumed: totalConsumed };
}

// ── OID decoding ─────────────────────────────────────────────────────

function decodeOid(bytes: number[]): string {
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

// Extended display names for extension decoder UI — overrides for entries where
// the extension decoder needs more verbose names than ALL_OID_NAMES provides.
const EXTENSION_DISPLAY_OVERRIDES: Record<string, string> = {
  "1.3.6.1.5.5.7.3.1": "TLS Server Authentication",
  "1.3.6.1.5.5.7.3.2": "TLS Client Authentication",
  "1.3.6.1.5.5.7.3.3": "Code Signing",
  "1.3.6.1.5.5.7.3.4": "Email Protection",
  "1.3.6.1.5.5.7.3.8": "Time Stamping",
  "1.3.6.1.5.5.7.3.31": "Brand Indicator for Message Identification (BIMI)",
  "2.23.140.1.1": "CA/Browser Forum EV Guidelines",
  "2.16.840.1.114412.2.1": "DigiCert EV Policy",
  "2.16.840.1.114412.0.2.5": "DigiCert VMC Policy",
  "1.3.6.1.4.1.53087.1.1": "BIMI Mark Certificate General Policy",
  "1.3.6.1.4.1.53087.1.2": "BIMI Trademark Office Name",
  "1.3.6.1.4.1.53087.1.3": "BIMI Trademark Country/Region",
  "1.3.6.1.4.1.53087.1.4": "BIMI Trademark Identifier",
  "1.3.6.1.4.1.53087.1.5": "BIMI Legal Entity Identifier (LEI)",
  "1.3.6.1.4.1.53087.1.6": "BIMI Word Mark",
  "1.3.6.1.4.1.53087.3.3": "BIMI Statute State/Province",
  "1.3.6.1.4.1.53087.3.5": "BIMI Statute Citation",
  "1.3.6.1.4.1.53087.3.6": "BIMI Statute URL",
  "1.3.6.1.4.1.53087.4.1": "BIMI Pilot Identifier (sunset 2025-03-15)",
  "1.3.6.1.4.1.53087.5.1": "BIMI Prior Use Mark Source URL",
  "2.16.840.1.114028.10.1.100": "Entrust VMC Policy",
  "1.3.6.1.4.1.4146.1.95": "GlobalSign VMC Policy",
};

function resolveOidName(oid: string): string {
  return EXTENSION_DISPLAY_OVERRIDES[oid] ?? ALL_OID_NAMES[oid] ?? oid;
}

// ── String extraction helpers ────────────────────────────────────────

function extractString(node: DerNode): string | null {
  const stringTags = [TAG_UTF8_STRING, TAG_IA5_STRING, TAG_PRINTABLE_STRING, TAG_CONTEXT_PRIM_2, TAG_CONTEXT_PRIM_6];
  if (stringTags.includes(node.tag)) {
    return bytesToAscii(node.bytes);
  }
  return null;
}

// Recursively collect all strings (URLs, names, etc.) from a DER tree
function collectStrings(node: DerNode): string[] {
  const result: string[] = [];
  const str = extractString(node);
  if (str) result.push(str);
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectStrings(child));
    }
  }
  return result;
}

// Collect OIDs from a DER tree
function collectOids(node: DerNode): string[] {
  const result: string[] = [];
  if (node.tag === TAG_OID) {
    result.push(decodeOid(node.bytes));
  }
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectOids(child));
    }
  }
  return result;
}

// ── Extension-specific decoders ──────────────────────────────────────

function decodeSubjectKeyId(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  // OCTET STRING wrapping the actual key id
  const keyIdBytes = node.tag === TAG_OCTET_STRING ? node.bytes : bytes;
  return keyIdBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

function decodeAuthorityKeyId(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  // SEQUENCE containing [0] keyIdentifier
  if (node.children) {
    for (const child of node.children) {
      if (child.tag === TAG_CONTEXT_PRIM_0) {
        return child.bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
      }
    }
  }
  return bytesToHex(bytes);
}

function decodeBasicConstraints(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  if (!node.children || node.children.length === 0) {
    return "CA: false";
  }
  const first = node.children[0];
  if (first.tag === TAG_BOOLEAN && first.bytes[0] === 0xff) {
    const pathLen =
      node.children.length > 1 && node.children[1].tag === TAG_INTEGER ? node.children[1].bytes[0] : undefined;
    return pathLen !== undefined ? `CA: true, Path Length: ${pathLen}` : "CA: true";
  }
  return "CA: false";
}

function decodeExtendedKeyUsage(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  const oids = collectOids(node);
  return oids.map((oid) => resolveOidName(oid)).join(", ");
}

function decodeKeyUsage(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  if (node.tag !== TAG_BIT_STRING || node.bytes.length < 2) return bytesToHex(bytes);

  const unusedBits = node.bytes[0];
  const bits = node.bytes.slice(1);
  const flags: string[] = [];
  const usages = [
    "Digital Signature",
    "Non-Repudiation",
    "Key Encipherment",
    "Data Encipherment",
    "Key Agreement",
    "Certificate Signing",
    "CRL Signing",
    "Encipher Only",
    "Decipher Only",
  ];

  for (let byteIdx = 0; byteIdx < bits.length; byteIdx++) {
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const globalBit = byteIdx * 8 + bitIdx;
      if (byteIdx === bits.length - 1 && bitIdx >= 8 - unusedBits) break;
      if (bits[byteIdx] & (0x80 >> bitIdx)) {
        flags.push(usages[globalBit] || `Bit ${globalBit}`);
      }
    }
  }
  return flags.join(", ");
}

function decodeSan(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  const names: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      if (child.tag === TAG_CONTEXT_PRIM_2) {
        // dNSName
        names.push(bytesToAscii(child.bytes));
      } else if (child.tag === TAG_CONTEXT_PRIM_1) {
        // rfc822Name (email)
        names.push(bytesToAscii(child.bytes));
      } else if (child.tag === TAG_CONTEXT_PRIM_6) {
        // uniformResourceIdentifier
        names.push(bytesToAscii(child.bytes));
      }
    }
  }
  return names.join(", ");
}

function decodeCrlDistributionPoints(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  const urls = collectStrings(node).filter(
    (s) => s.startsWith("http://") || s.startsWith("https://") || s.startsWith("ldap://"),
  );
  return urls.join("\n");
}

function decodeAuthorityInfoAccess(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  const entries: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      if (child.children && child.children.length >= 2) {
        const oid = child.children[0].tag === TAG_OID ? decodeOid(child.children[0].bytes) : null;
        const url = extractString(child.children[1]);
        if (oid && url) {
          const method = resolveOidName(oid);
          entries.push(`${method}: ${url}`);
        }
      }
    }
  }
  return entries.join("\n");
}

function decodeCertificatePolicies(hex: string): string {
  const bytes = hexToBytes(hex);
  const { node } = parseDer(bytes);
  const parts: string[] = [];

  if (node.children) {
    for (const policyInfo of node.children) {
      if (policyInfo.children && policyInfo.children.length > 0) {
        const oidNode = policyInfo.children[0];
        if (oidNode.tag === TAG_OID) {
          const oid = decodeOid(oidNode.bytes);
          const name = resolveOidName(oid);
          parts.push(name);
        }
        // Extract any CPS URIs from qualifiers
        if (policyInfo.children.length > 1) {
          const urls = collectStrings(policyInfo.children[1]).filter(
            (s) => s.startsWith("http://") || s.startsWith("https://"),
          );
          parts.push(...urls);
        }
      }
    }
  }
  return parts.join("\n");
}

// ── Main decoder ─────────────────────────────────────────────────────

// Extension OIDs that have decoders — used by getExtensionName to distinguish
// known extensions from unknown ones.
const DECODED_EXTENSION_OIDS = new Set([
  "2.5.29.14",
  "2.5.29.15",
  "2.5.29.17",
  "2.5.29.19",
  "2.5.29.31",
  "2.5.29.32",
  "2.5.29.35",
  "2.5.29.37",
  "1.3.6.1.5.5.7.1.1",
  "1.3.6.1.5.5.7.1.12",
  "1.3.6.1.4.1.53087.1.13",
  "1.3.6.1.4.1.11129.2.4.2",
  "1.3.6.1.4.1.11129.2.4.3",
]);

export function getExtensionName(oid: string): string {
  return ALL_OID_NAMES[oid] || (DECODED_EXTENSION_OIDS.has(oid) ? oid : "Unknown");
}

export interface DecodedExtension {
  oid: string;
  name: string;
  decoded: string | null; // null = show raw hex
}

export function decodeExtension(oid: string, hex: string): DecodedExtension {
  const name = getExtensionName(oid);

  try {
    let decoded: string | null = null;

    switch (oid) {
      case "2.5.29.14":
        decoded = decodeSubjectKeyId(hex);
        break;
      case "2.5.29.15":
        decoded = decodeKeyUsage(hex);
        break;
      case "2.5.29.17":
        decoded = decodeSan(hex);
        break;
      case "2.5.29.19":
        decoded = decodeBasicConstraints(hex);
        break;
      case "2.5.29.31":
        decoded = decodeCrlDistributionPoints(hex);
        break;
      case "2.5.29.32":
        decoded = decodeCertificatePolicies(hex);
        break;
      case "2.5.29.35":
        decoded = decodeAuthorityKeyId(hex);
        break;
      case "2.5.29.37":
        decoded = decodeExtendedKeyUsage(hex);
        break;
      case "1.3.6.1.5.5.7.1.1":
        decoded = decodeAuthorityInfoAccess(hex);
        break;
      case "1.3.6.1.5.5.7.1.12":
        decoded = "Embedded SVG logotype (see Logo section)";
        break;
      case "1.3.6.1.4.1.11129.2.4.2":
        decoded = "Signed Certificate Timestamps (embedded)";
        break;
      case "1.3.6.1.4.1.11129.2.4.3":
        decoded = "Precertificate poison (critical)";
        break;
      default: {
        // For unknown extensions, try to extract any readable strings
        const bytes = hexToBytes(hex);
        if (bytes.length > 0) {
          try {
            const { node } = parseDer(bytes);
            const strings = collectStrings(node);
            if (strings.length > 0) {
              decoded = strings.join(", ");
            }
          } catch {
            // fall through to null
          }
        }
      }
    }

    return { oid, name, decoded };
  } catch {
    return { oid, name, decoded: null };
  }
}
