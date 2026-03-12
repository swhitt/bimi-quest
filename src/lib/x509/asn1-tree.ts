/**
 * Recursive ASN.1 DER parser that builds a full tree of nodes with byte offsets,
 * decoded values, and OID name resolution. Designed for the ASN.1 explorer UI
 * where each node needs precise offset info for hex viewer highlighting.
 *
 * Uses multiplication (not bit-shift) for OID decoding to avoid 32-bit overflow.
 */

import { OID_NAMES } from "./oid-names";

// ── Universal tag names ─────────────────────────────────────────────

const UNIVERSAL_TAG_NAMES: Record<number, string> = {
  0x01: "BOOLEAN",
  0x02: "INTEGER",
  0x03: "BIT STRING",
  0x04: "OCTET STRING",
  0x05: "NULL",
  0x06: "OBJECT IDENTIFIER",
  0x0c: "UTF8String",
  0x13: "PrintableString",
  0x14: "T61String",
  0x16: "IA5String",
  0x17: "UTCTime",
  0x18: "GeneralizedTime",
  0x1e: "BMPString",
  0x30: "SEQUENCE",
  0x31: "SET",
};

// ── Asn1Node interface ──────────────────────────────────────────────

export interface Asn1Node {
  tag: number;
  /** Human-readable tag name: "SEQUENCE", "BIT STRING", "[0]", etc. */
  tagName: string;
  tagClass: "universal" | "application" | "context" | "private";
  constructed: boolean;
  /** Byte offset of the tag byte in the original DER buffer */
  headerOffset: number;
  /** Number of bytes for tag + length encoding */
  headerLength: number;
  /** Byte offset where the value content starts */
  valueOffset: number;
  /** Length of the value content in bytes */
  valueLength: number;
  /** Total bytes consumed: headerLength + valueLength */
  totalLength: number;
  depth: number;
  /** Raw value bytes as hex string */
  hex: string;
  /** Human-readable decoded value, or null for constructed types */
  decoded: string | null;
  /** Friendly OID name if this is an OID node */
  oidName: string | null;
  /** Recursive children for constructed types */
  children: Asn1Node[];
}

// ── PEM / base64 / hex decoder ──────────────────────────────────────

/**
 * Decode PEM, raw base64, or hex input into DER bytes.
 *
 * Detection order:
 * 1. PEM (contains "-----BEGIN") — strip headers, base64 decode
 * 2. Base64 (all valid base64 chars, length > 10) — decode directly
 * 3. Hex (all hex digits plus optional whitespace/colons) — decode pairs
 */
export function pemToDerBytes(input: string): Uint8Array {
  const trimmed = input.trim();

  // 1. PEM
  if (trimmed.includes("-----BEGIN")) {
    const b64 = trimmed
      .replace(/-----BEGIN [^-]+-----/, "")
      .replace(/-----END [^-]+-----/, "")
      .replace(/\s/g, "");
    return base64ToBytes(b64);
  }

  // 2. Raw base64
  const strippedWhitespace = trimmed.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(strippedWhitespace) && strippedWhitespace.length > 10) {
    return base64ToBytes(strippedWhitespace);
  }

  // 3. Hex (with optional colons/spaces)
  const hexClean = trimmed.replace(/[\s:]/g, "");
  if (/^[0-9a-fA-F]+$/.test(hexClean) && hexClean.length >= 2) {
    if (hexClean.length % 2 !== 0) {
      throw new Error("Hex input has odd number of characters");
    }
    const bytes = new Uint8Array(hexClean.length / 2);
    for (let i = 0; i < hexClean.length; i += 2) {
      bytes[i / 2] = parseInt(hexClean.substring(i, i + 2), 16);
    }
    return bytes;
  }

  throw new Error("Unrecognized input format: expected PEM (-----BEGIN ...), base64, or hex");
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// ── Hex formatting helpers ──────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return parts.join("");
}

function bytesToColonHex(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return parts.join(":");
}

// ── OID decoding ────────────────────────────────────────────────────

function decodeOidBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const parts: number[] = [];
  parts.push(Math.floor(bytes[0] / 40));
  parts.push(bytes[0] % 40);
  // Use multiplication (not bit-shift) to avoid 32-bit overflow
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

// ── Value decoding by tag ───────────────────────────────────────────

function decodeValue(
  tagByte: number,
  valueBytes: Uint8Array,
  tagClass: "universal" | "application" | "context" | "private",
): { decoded: string | null; oidName: string | null } {
  if (tagClass !== "universal") {
    return { decoded: bytesToHex(valueBytes), oidName: null };
  }

  const tagNumber = tagByte & 0x1f;

  switch (tagNumber) {
    case 0x01: {
      // BOOLEAN
      const val = valueBytes.length > 0 && valueBytes[0] !== 0;
      return { decoded: val ? "TRUE" : "FALSE", oidName: null };
    }

    case 0x02: {
      // INTEGER
      if (valueBytes.length === 0) {
        return { decoded: "0", oidName: null };
      }
      // Small integers (<= 4 bytes): show decimal + hex
      if (valueBytes.length <= 4) {
        let val = 0;
        for (let i = 0; i < valueBytes.length; i++) {
          val = val * 256 + valueBytes[i];
        }
        // Handle sign — if high bit set, it's negative in two's complement
        if (valueBytes[0] & 0x80) {
          val -= Math.pow(2, valueBytes.length * 8);
        }
        const colonHex = bytesToColonHex(valueBytes);
        return { decoded: `${val} (0x${colonHex})`, oidName: null };
      }
      // Larger integers (serial numbers, etc.) — hex with colons only
      return { decoded: bytesToColonHex(valueBytes), oidName: null };
    }

    case 0x03: {
      // BIT STRING
      if (valueBytes.length === 0) {
        return { decoded: "(empty)", oidName: null };
      }
      const unusedBits = valueBytes[0];
      const rest = valueBytes.subarray(1);
      const hex = bytesToHex(rest);
      return { decoded: `unused bits: ${unusedBits}, ${hex}`, oidName: null };
    }

    case 0x04: {
      // OCTET STRING — hex value; recursive drill handled separately
      return { decoded: bytesToHex(valueBytes), oidName: null };
    }

    case 0x05: {
      // NULL
      return { decoded: "(null)", oidName: null };
    }

    case 0x06: {
      // OBJECT IDENTIFIER
      const dotted = decodeOidBytes(valueBytes);
      const name = OID_NAMES[dotted] ?? null;
      return { decoded: dotted, oidName: name };
    }

    case 0x0c: // UTF8String
    case 0x13: // PrintableString
    case 0x16: // IA5String
    case 0x14: {
      // T61String
      const text = new TextDecoder("utf-8", { fatal: false }).decode(valueBytes);
      return { decoded: text, oidName: null };
    }

    case 0x1e: {
      // BMPString — UCS-2 big-endian
      const chars: string[] = [];
      for (let i = 0; i + 1 < valueBytes.length; i += 2) {
        chars.push(String.fromCharCode((valueBytes[i] << 8) | valueBytes[i + 1]));
      }
      return { decoded: chars.join(""), oidName: null };
    }

    case 0x17: {
      // UTCTime — YYMMDDHHmmSSZ
      const raw = new TextDecoder().decode(valueBytes);
      const m = raw.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
      if (m) {
        const year = parseInt(m[1], 10);
        const fullYear = year >= 50 ? 1900 + year : 2000 + year;
        return {
          decoded: `${fullYear}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
          oidName: null,
        };
      }
      return { decoded: raw, oidName: null };
    }

    case 0x18: {
      // GeneralizedTime — YYYYMMDDHHmmSSZ
      const raw = new TextDecoder().decode(valueBytes);
      const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
      if (m) {
        return {
          decoded: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
          oidName: null,
        };
      }
      return { decoded: raw, oidName: null };
    }

    case 0x10: // SEQUENCE (constructed — should not reach here)
    case 0x11: // SET (constructed — should not reach here)
      return { decoded: null, oidName: null };

    default:
      return { decoded: bytesToHex(valueBytes), oidName: null };
  }
}

// ── Tag classification ──────────────────────────────────────────────

function classifyTag(tagByte: number): {
  tagClass: "universal" | "application" | "context" | "private";
  constructed: boolean;
  tagName: string;
} {
  const classBits = (tagByte >> 6) & 0x03;
  const constructed = (tagByte & 0x20) !== 0;
  const tagNumber = tagByte & 0x1f;

  let tagClass: "universal" | "application" | "context" | "private";
  let tagName: string;

  switch (classBits) {
    case 0: {
      tagClass = "universal";
      // For SEQUENCE/SET the tag byte includes the constructed bit,
      // so look up the full byte (0x30 / 0x31) first
      tagName = UNIVERSAL_TAG_NAMES[tagByte] ?? UNIVERSAL_TAG_NAMES[tagNumber] ?? `UNIVERSAL [${tagNumber}]`;
      break;
    }
    case 1:
      tagClass = "application";
      tagName = `APPLICATION [${tagNumber}]`;
      break;
    case 2: {
      tagClass = "context";
      const hint = constructed ? "EXPLICIT" : "IMPLICIT";
      tagName = `[${tagNumber}] ${hint}`;
      break;
    }
    case 3:
      tagClass = "private";
      tagName = `PRIVATE [${tagNumber}]`;
      break;
    default:
      tagClass = "universal";
      tagName = `UNKNOWN [${tagNumber}]`;
  }

  return { tagClass, constructed, tagName };
}

// ── Core recursive DER parser ───────────────────────────────────────

/**
 * Parse a single ASN.1 DER node from `buf` starting at `offset`.
 * `baseOffset` is added to all reported offsets so they are relative
 * to the original root DER buffer (critical for hex viewer highlighting).
 */
function parseNode(buf: Uint8Array, offset: number, depth: number, baseOffset: number): Asn1Node {
  if (offset >= buf.length) {
    throw new Error(`Offset ${offset} beyond buffer length ${buf.length}`);
  }

  const tagByte = buf[offset];
  const { tagClass, constructed, tagName } = classifyTag(tagByte);

  // Multi-byte tags (tag number 31 = long form) — rare but handle it
  let tagLen = 1;
  if ((tagByte & 0x1f) === 0x1f) {
    while (offset + tagLen < buf.length && (buf[offset + tagLen] & 0x80) !== 0) {
      tagLen++;
    }
    tagLen++; // final byte (without continuation bit)
  }

  let pos = offset + tagLen;
  if (pos >= buf.length) {
    throw new Error(`Truncated DER: no length byte at offset ${pos}`);
  }

  // Decode length
  const firstLenByte = buf[pos];
  pos++;
  let valueLength: number;

  if (firstLenByte < 0x80) {
    valueLength = firstLenByte;
  } else if (firstLenByte === 0x80) {
    throw new Error("Indefinite length encoding not supported in DER");
  } else {
    const numLenBytes = firstLenByte & 0x7f;
    if (pos + numLenBytes > buf.length) {
      throw new Error("Truncated DER: length bytes extend beyond buffer");
    }
    valueLength = 0;
    for (let i = 0; i < numLenBytes; i++) {
      valueLength = valueLength * 256 + buf[pos + i];
    }
    pos += numLenBytes;
  }

  const headerLength = pos - offset;
  const headerOffset = baseOffset + offset;
  const valueOffset = baseOffset + pos;

  if (pos + valueLength > buf.length) {
    throw new Error(`Truncated DER: value extends beyond buffer (need ${pos + valueLength}, have ${buf.length})`);
  }

  const valueBytes = buf.subarray(pos, pos + valueLength);
  const hex = bytesToHex(valueBytes);
  const tagNumber = tagByte & 0x1f;

  let children: Asn1Node[] = [];
  let decoded: string | null = null;
  let oidName: string | null = null;

  if (constructed) {
    // Parse children for constructed types (SEQUENCE, SET, explicit wrappers)
    children = parseChildNodes(valueBytes, depth + 1, valueOffset);
  } else {
    // Leaf node — decode value
    const result = decodeValue(tagByte, valueBytes, tagClass);
    decoded = result.decoded;
    oidName = result.oidName;

    // OCTET STRING auto-drill: attempt to parse inner DER
    if (tagClass === "universal" && tagNumber === 0x04 && valueBytes.length > 0) {
      try {
        const innerChildren = tryParseDerChildren(valueBytes, depth + 1, valueOffset);
        if (innerChildren.length > 0) {
          children = innerChildren;
        }
      } catch {
        // Not valid DER inside — keep as leaf
      }
    }
  }

  return {
    tag: tagByte,
    tagName,
    tagClass,
    constructed,
    headerOffset,
    headerLength,
    valueOffset,
    valueLength,
    totalLength: headerLength + valueLength,
    depth,
    hex,
    decoded,
    oidName,
    children,
  };
}

/** Parse all child nodes from a constructed value's bytes. */
function parseChildNodes(valueBuf: Uint8Array, depth: number, parentValueOffset: number): Asn1Node[] {
  const children: Asn1Node[] = [];
  let pos = 0;
  while (pos < valueBuf.length) {
    const child = parseNode(valueBuf, pos, depth, parentValueOffset);
    children.push(child);
    pos += child.totalLength;
  }
  return children;
}

/**
 * Attempt to parse an OCTET STRING's content as DER.
 * Returns children only if the parse consumes all bytes exactly.
 */
function tryParseDerChildren(valueBuf: Uint8Array, depth: number, parentValueOffset: number): Asn1Node[] {
  // Quick sanity: reject obviously invalid first bytes
  const firstByte = valueBuf[0];
  if (firstByte === 0x00 || firstByte === 0xff) {
    return [];
  }

  const children: Asn1Node[] = [];
  let pos = 0;
  while (pos < valueBuf.length) {
    const child = parseNode(valueBuf, pos, depth, parentValueOffset);
    children.push(child);
    pos += child.totalLength;
  }

  // Must consume exactly all bytes for the drill to be valid
  if (pos !== valueBuf.length) {
    return [];
  }

  return children;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Build a recursive ASN.1 tree from raw DER bytes.
 * All byte offsets (headerOffset, valueOffset) are relative to the
 * start of the input buffer, suitable for hex viewer highlighting.
 */
export function buildAsn1Tree(der: Uint8Array): Asn1Node {
  if (der.length === 0) {
    throw new Error("Empty DER input");
  }
  return parseNode(der, 0, 0, 0);
}
