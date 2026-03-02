// OCSP and CRL revocation checking utilities.
// Builds OCSP requests and parses responses using raw ASN.1 DER encoding,
// and parses CRLs to check for revoked serial numbers.
// No external OCSP/CRL libraries are used.

import { createHash } from "crypto";
import { bytesToHex as sharedBytesToHex, hexToBytes as sharedHexToBytes } from "@/lib/hex";
import { pemToDer } from "@/lib/pem";

// ── ASN.1 DER encoding helpers ──────────────────────────────────────

function encodeLength(len: number): number[] {
  if (len < 0x80) return [len];
  if (len < 0x100) return [0x81, len];
  return [0x82, (len >> 8) & 0xff, len & 0xff];
}

function encodeSequence(contents: number[]): number[] {
  return [0x30, ...encodeLength(contents.length), ...contents];
}

function encodeOid(oid: string): number[] {
  const parts = oid.split(".").map(Number);
  const encoded: number[] = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      encoded.push(val);
    } else {
      const bytes: number[] = [];
      bytes.push(val & 0x7f);
      val >>= 7;
      while (val > 0) {
        bytes.push((val & 0x7f) | 0x80);
        val >>= 7;
      }
      encoded.push(...bytes.reverse());
    }
  }
  return [0x06, ...encodeLength(encoded.length), ...encoded];
}

function encodeOctetString(bytes: number[]): number[] {
  return [0x04, ...encodeLength(bytes.length), ...bytes];
}

function encodeNull(): number[] {
  return [0x05, 0x00];
}

/** Encode an integer value from a hex string (preserves sign padding) */
function encodeIntegerFromHex(hex: string): number[] {
  const bytes: number[] = [];
  const clean = hex.length % 2 === 1 ? "0" + hex : hex;
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  // Add leading zero if high bit is set (ASN.1 integer sign convention)
  if (bytes.length > 0 && bytes[0] >= 0x80) {
    bytes.unshift(0x00);
  }
  return [0x02, ...encodeLength(bytes.length), ...bytes];
}

// ── ASN.1 DER decoding helpers ──────────────────────────────────────

interface DerTlv {
  tag: number;
  value: Uint8Array;
  headerLen: number;
  totalLen: number;
}

function readDerTlv(data: Uint8Array, offset: number): DerTlv {
  if (offset >= data.length) throw new Error("DER: unexpected end of data");
  const tag = data[offset];
  let pos = offset + 1;

  if (pos >= data.length) throw new Error("DER: unexpected end of data");
  let len = data[pos++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      if (pos >= data.length) throw new Error("DER: unexpected end of data");
      len = (len << 8) | data[pos++];
    }
  }

  const headerLen = pos - offset;
  const value = data.slice(pos, pos + len);
  return { tag, value, headerLen, totalLen: headerLen + len };
}

/** Parse children from a constructed DER value */
function parseChildren(value: Uint8Array): DerTlv[] {
  const children: DerTlv[] = [];
  let offset = 0;
  while (offset < value.length) {
    const tlv = readDerTlv(value, offset);
    children.push(tlv);
    offset += tlv.totalLen;
  }
  return children;
}

function decodeOidFromBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const parts: number[] = [Math.floor(bytes[0] / 40), bytes[0] % 40];
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

const bytesToHex = sharedBytesToHex;

// ── OCSP request building ───────────────────────────────────────────

const SHA1_OID = "1.3.14.3.2.26";

interface OcspRequestInput {
  issuerNameDer: Uint8Array; // DER-encoded issuer Name (from TBSCertificate)
  issuerPublicKeyDer: Uint8Array; // DER-encoded issuer SubjectPublicKeyInfo
  serialNumberHex: string;
}

/**
 * Build a DER-encoded OCSP request for a single certificate.
 * Structure: OCSPRequest -> TBSRequest -> requestList -> Request -> CertID
 */
export function buildOcspRequest(input: OcspRequestInput): Uint8Array {
  // Hash the issuer's distinguished name (DER encoding)
  const issuerNameHash = createHash("sha1").update(input.issuerNameDer).digest();

  // Extract the public key bits from SubjectPublicKeyInfo
  // SubjectPublicKeyInfo = SEQUENCE { algorithm, BIT STRING { key } }
  const spki = readDerTlv(input.issuerPublicKeyDer, 0);
  const spkiChildren = parseChildren(spki.value);
  if (spkiChildren.length < 2) throw new Error("Invalid SubjectPublicKeyInfo");
  const bitString = spkiChildren[1];
  // BIT STRING: first byte is unused-bits count, rest is the key data
  const keyBits = bitString.value.slice(1);
  const issuerKeyHash = createHash("sha1").update(keyBits).digest();

  // Build CertID: SEQUENCE { hashAlgorithm, issuerNameHash, issuerKeyHash, serialNumber }
  const hashAlgorithm = encodeSequence([...encodeOid(SHA1_OID), ...encodeNull()]);
  const certId = encodeSequence([
    ...hashAlgorithm,
    ...encodeOctetString(Array.from(issuerNameHash)),
    ...encodeOctetString(Array.from(issuerKeyHash)),
    ...encodeIntegerFromHex(input.serialNumberHex),
  ]);

  // Request: SEQUENCE { certID }
  const request = encodeSequence(certId);

  // RequestList: SEQUENCE OF Request
  const requestList = encodeSequence(request);

  // TBSRequest: SEQUENCE { requestList }
  const tbsRequest = encodeSequence(requestList);

  // OCSPRequest: SEQUENCE { tbsRequest }
  const ocspRequest = encodeSequence(tbsRequest);

  return new Uint8Array(ocspRequest);
}

// ── OCSP response parsing ───────────────────────────────────────────

export type OcspStatus = "good" | "revoked" | "unknown";

export interface OcspResult {
  url: string;
  status: OcspStatus | "error";
  thisUpdate?: string;
  nextUpdate?: string;
  errorMessage?: string;
}

function parseGeneralizedTime(bytes: Uint8Array): string {
  const str = new TextDecoder().decode(bytes);
  // Format: YYYYMMDDHHmmSSZ -> ISO 8601
  if (str.length >= 14) {
    const y = str.slice(0, 4);
    const m = str.slice(4, 6);
    const d = str.slice(6, 8);
    const h = str.slice(8, 10);
    const min = str.slice(10, 12);
    const s = str.slice(12, 14);
    return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
  }
  return str;
}

/**
 * Parse a DER-encoded OCSP response.
 * We navigate the ASN.1 structure to find the single response's certStatus and timestamps.
 *
 * OCSPResponse = SEQUENCE {
 *   responseStatus ENUMERATED,
 *   responseBytes [0] EXPLICIT SEQUENCE { responseType OID, response OCTET STRING }
 * }
 * BasicOCSPResponse = SEQUENCE {
 *   tbsResponseData SEQUENCE { ... responses SEQUENCE OF SingleResponse ... }
 * }
 * SingleResponse = SEQUENCE {
 *   certID,
 *   certStatus (CHOICE: [0]=good, [1]=revoked, [2]=unknown),
 *   thisUpdate GeneralizedTime,
 *   nextUpdate [0] EXPLICIT GeneralizedTime OPTIONAL
 * }
 */
export function parseOcspResponse(der: Uint8Array): { status: OcspStatus; thisUpdate?: string; nextUpdate?: string } {
  const root = readDerTlv(der, 0);
  const rootChildren = parseChildren(root.value);

  // responseStatus is an ENUMERATED
  const statusEnum = rootChildren[0];
  if (statusEnum.tag !== 0x0a || statusEnum.value[0] !== 0) {
    const statusCode = statusEnum.value[0];
    const statusNames: Record<number, string> = {
      1: "malformedRequest",
      2: "internalError",
      3: "tryLater",
      5: "sigRequired",
      6: "unauthorized",
    };
    throw new Error(`OCSP responder returned error: ${statusNames[statusCode] || `status ${statusCode}`}`);
  }

  // responseBytes [0] EXPLICIT -> SEQUENCE { OID, OCTET STRING }
  if (rootChildren.length < 2) throw new Error("No responseBytes in OCSP response");
  const responseBytesExplicit = rootChildren[1]; // context [0]
  const responseBytesSeq = parseChildren(responseBytesExplicit.value)[0];
  const responseBytesChildren = parseChildren(responseBytesSeq.value);

  // The actual BasicOCSPResponse is DER-encoded inside the OCTET STRING
  const basicResponseDer = responseBytesChildren[1].value; // OCTET STRING
  const basicResponse = readDerTlv(basicResponseDer, 0);
  const basicChildren = parseChildren(basicResponse.value);

  // tbsResponseData = first child of BasicOCSPResponse
  const tbsResponseData = basicChildren[0];
  const tbsChildren = parseChildren(tbsResponseData.value);

  // tbsResponseData fields vary depending on whether version [0] and responderId are present.
  // We need to find the SEQUENCE OF SingleResponse. It's the first SEQUENCE containing
  // child SEQUENCEs that have certStatus tags.
  // Structure: version? [0], responderID (choice [1] or [2]), producedAt GeneralizedTime, responses SEQUENCE
  let responsesSeq: DerTlv | null = null;
  for (const child of tbsChildren) {
    if (child.tag === 0x30) {
      // Check if this looks like a SEQUENCE OF SingleResponse
      const inner = parseChildren(child.value);
      if (inner.length > 0 && inner[0].tag === 0x30) {
        // Could be the responses sequence
        const singleResp = parseChildren(inner[0].value);
        // A SingleResponse starts with CertID (SEQUENCE), then certStatus (context tag)
        if (singleResp.length >= 3 && singleResp[0].tag === 0x30) {
          responsesSeq = child;
          break;
        }
      }
    }
  }

  if (!responsesSeq) throw new Error("Could not find SingleResponse in OCSP response");

  const singleResponses = parseChildren(responsesSeq.value);
  if (singleResponses.length === 0) throw new Error("Empty responses in OCSP");

  // Parse the first SingleResponse
  const singleResp = parseChildren(singleResponses[0].value);
  // singleResp[0] = certID (SEQUENCE), singleResp[1] = certStatus, singleResp[2] = thisUpdate
  if (singleResp.length < 3) throw new Error("Invalid SingleResponse structure");

  const certStatusTlv = singleResp[1];
  let status: OcspStatus;
  // certStatus is a CHOICE with context tags:
  // [0] IMPLICIT NULL = good (tag 0x80, length 0)
  // [1] CONSTRUCTED = revoked (tag 0xa1)
  // [2] IMPLICIT NULL = unknown (tag 0x82, length 0)
  const statusTag = certStatusTlv.tag & 0x1f; // strip class bits
  if (statusTag === 0) {
    status = "good";
  } else if (statusTag === 1) {
    status = "revoked";
  } else {
    status = "unknown";
  }

  // thisUpdate is a GeneralizedTime
  const thisUpdateTlv = singleResp[2];
  const thisUpdate = parseGeneralizedTime(thisUpdateTlv.value);

  // nextUpdate is optional, tagged [0] EXPLICIT
  let nextUpdate: string | undefined;
  if (singleResp.length > 3) {
    const candidate = singleResp[3];
    // [0] EXPLICIT wrapping a GeneralizedTime
    if ((candidate.tag & 0x1f) === 0 && (candidate.tag & 0x80) !== 0) {
      const inner = readDerTlv(candidate.value, 0);
      nextUpdate = parseGeneralizedTime(inner.value);
    }
  }

  return { status, thisUpdate, nextUpdate };
}

// Re-export for consumers that import pemToDer from this module
export { pemToDer };

// ── Extract issuer Name and SubjectPublicKeyInfo from a certificate ──

/**
 * Extract the DER-encoded issuer Name and SubjectPublicKeyInfo from a PEM certificate.
 * TBSCertificate = SEQUENCE {
 *   version [0] EXPLICIT INTEGER (optional in v1),
 *   serialNumber INTEGER,
 *   signature AlgorithmIdentifier,
 *   issuer Name,
 *   validity SEQUENCE { notBefore, notAfter },
 *   subject Name,
 *   subjectPublicKeyInfo SubjectPublicKeyInfo,
 *   ...
 * }
 */
export function extractIssuerInfo(issuerPem: string): { issuerNameDer: Uint8Array; issuerPublicKeyDer: Uint8Array } {
  const der = pemToDer(issuerPem);
  const cert = readDerTlv(der, 0); // outermost SEQUENCE (Certificate)
  const certChildren = parseChildren(cert.value);
  const tbs = certChildren[0]; // TBSCertificate SEQUENCE
  const tbsChildren = parseChildren(tbs.value);

  // Determine field offsets (version field [0] may or may not be present)
  let idx = 0;
  if (tbsChildren[0].tag === 0xa0) {
    // version is present (v2 or v3)
    idx = 1;
  }
  // idx+0 = serialNumber, idx+1 = signature, idx+2 = issuer, idx+3 = validity, idx+4 = subject, idx+5 = SPKI
  // But we want the *issuer's own* subject Name (which is this cert's subject) and SPKI
  const subjectName = tbsChildren[idx + 4]; // subject Name
  const spki = tbsChildren[idx + 5]; // SubjectPublicKeyInfo

  // Reconstruct full TLV bytes (tag + length + value) from parsed nodes
  const subjectNameFull = rebuildTlv(subjectName);
  const spkiFull = rebuildTlv(spki);

  return { issuerNameDer: subjectNameFull, issuerPublicKeyDer: spkiFull };
}

/** Rebuild full TLV bytes from a DerTlv (tag + length + value) */
function rebuildTlv(tlv: DerTlv): Uint8Array {
  const lenBytes = encodeLength(tlv.value.length);
  const result = new Uint8Array(1 + lenBytes.length + tlv.value.length);
  result[0] = tlv.tag;
  result.set(lenBytes, 1);
  result.set(tlv.value, 1 + lenBytes.length);
  return result;
}

/**
 * Extract the subject Name DER from a leaf certificate (for OCSP issuerNameHash comparison).
 * The issuerNameHash in OCSP is the hash of the issuer cert's subject Name (DER encoded).
 */
export function extractSubjectNameDer(pem: string): Uint8Array {
  const der = pemToDer(pem);
  const cert = readDerTlv(der, 0);
  const certChildren = parseChildren(cert.value);
  const tbs = certChildren[0];
  const tbsChildren = parseChildren(tbs.value);

  let idx = 0;
  if (tbsChildren[0].tag === 0xa0) idx = 1;
  const subjectName = tbsChildren[idx + 4];
  return rebuildTlv(subjectName);
}

// ── CRL parsing ─────────────────────────────────────────────────────

export interface CrlResult {
  url: string;
  status: "good" | "revoked" | "error";
  thisUpdate?: string;
  nextUpdate?: string;
  errorMessage?: string;
}

/**
 * Parse a CRL (DER-encoded) and check if a serial number is revoked.
 *
 * CertificateList = SEQUENCE {
 *   tbsCertList SEQUENCE {
 *     version INTEGER OPTIONAL,
 *     signature AlgorithmIdentifier,
 *     issuer Name,
 *     thisUpdate Time,
 *     nextUpdate Time OPTIONAL,
 *     revokedCertificates SEQUENCE OF SEQUENCE { serialNumber INTEGER, ... } OPTIONAL,
 *     ...
 *   },
 *   ...
 * }
 */
export function parseCrl(
  der: Uint8Array,
  serialNumberHex: string,
): { revoked: boolean; thisUpdate?: string; nextUpdate?: string } {
  const root = readDerTlv(der, 0);
  const rootChildren = parseChildren(root.value);
  const tbsCertList = rootChildren[0];
  const tbsChildren = parseChildren(tbsCertList.value);

  // Determine layout. If first element is an INTEGER (version), skip it.
  let idx = 0;
  if (tbsChildren[0].tag === 0x02) {
    // version present
    idx = 1;
  }
  // idx+0 = signature AlgorithmIdentifier
  // idx+1 = issuer Name
  // idx+2 = thisUpdate Time
  // idx+3 = nextUpdate Time (optional) or revokedCertificates SEQUENCE
  // idx+4 = revokedCertificates SEQUENCE (if nextUpdate present)

  const thisUpdateTlv = tbsChildren[idx + 2];
  const thisUpdate = parseTime(thisUpdateTlv);

  let nextUpdate: string | undefined;
  let revokedCertsIdx = idx + 3;

  // nextUpdate is a Time (UTCTime or GeneralizedTime). If present, it's not a SEQUENCE.
  if (
    revokedCertsIdx < tbsChildren.length &&
    (tbsChildren[revokedCertsIdx].tag === 0x17 || tbsChildren[revokedCertsIdx].tag === 0x18)
  ) {
    nextUpdate = parseTime(tbsChildren[revokedCertsIdx]);
    revokedCertsIdx++;
  }

  // Normalize the serial we're looking for
  const targetSerial = normalizeSerialHex(serialNumberHex);

  // revokedCertificates is a SEQUENCE OF SEQUENCE
  if (revokedCertsIdx < tbsChildren.length && tbsChildren[revokedCertsIdx].tag === 0x30) {
    const revokedCerts = parseChildren(tbsChildren[revokedCertsIdx].value);
    for (const entry of revokedCerts) {
      if (entry.tag !== 0x30) continue;
      const entryChildren = parseChildren(entry.value);
      if (entryChildren.length === 0 || entryChildren[0].tag !== 0x02) continue;
      const entrySerial = normalizeSerialHex(bytesToHex(entryChildren[0].value));
      if (entrySerial === targetSerial) {
        return { revoked: true, thisUpdate, nextUpdate };
      }
    }
  }

  return { revoked: false, thisUpdate, nextUpdate };
}

function parseTime(tlv: DerTlv): string {
  const str = new TextDecoder().decode(tlv.value);
  if (tlv.tag === 0x17) {
    // UTCTime: YYMMDDHHmmSSZ
    const yy = parseInt(str.slice(0, 2));
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${year}-${str.slice(2, 4)}-${str.slice(4, 6)}T${str.slice(6, 8)}:${str.slice(8, 10)}:${str.slice(10, 12)}Z`;
  }
  // GeneralizedTime
  return parseGeneralizedTime(tlv.value);
}

/** Strip leading zeros for comparison */
function normalizeSerialHex(hex: string): string {
  return hex.replace(/^0+/, "").toLowerCase();
}

// ── AIA / CDP extraction from extensionsJson ────────────────────────

/** Get the hex value from an extension entry, handling both old (string) and new ({ v, c }) formats */
function getExtHex(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "v" in entry && typeof (entry as Record<string, unknown>).v === "string") {
    return (entry as Record<string, unknown>).v as string;
  }
  return null;
}

/** Extract OCSP responder URL from AIA extension (OID 1.3.6.1.5.5.7.1.1) */
export function extractOcspUrl(extensionsJson: Record<string, unknown>): string | null {
  const aiaHex = getExtHex(extensionsJson["1.3.6.1.5.5.7.1.1"]);
  if (!aiaHex) return null;
  return extractUrlFromAia(aiaHex, "1.3.6.1.5.5.7.48.1");
}

/** Extract CRL Distribution Point URL from extension (OID 2.5.29.31) */
export function extractCrlUrl(extensionsJson: Record<string, unknown>): string | null {
  const cdpHex = getExtHex(extensionsJson["2.5.29.31"]);
  if (!cdpHex) return null;
  return extractUrlsFromCdp(cdpHex);
}

/** Parse AIA extension to find a specific access method URL */
function extractUrlFromAia(hex: string, targetOid: string): string | null {
  try {
    const bytes = sharedHexToBytes(hex);
    const root = readDerTlv(bytes, 0);
    const children = parseChildren(root.value);

    for (const child of children) {
      if (child.tag !== 0x30) continue;
      const accessDesc = parseChildren(child.value);
      if (accessDesc.length < 2) continue;
      if (accessDesc[0].tag === 0x06) {
        const oid = decodeOidFromBytes(accessDesc[0].value);
        if (oid === targetOid) {
          // Access location is typically context [6] (uniformResourceIdentifier)
          if (accessDesc[1].tag === 0x86) {
            return new TextDecoder().decode(accessDesc[1].value);
          }
        }
      }
    }
  } catch {
    // Failed to parse
  }
  return null;
}

/** Parse CRL Distribution Points to find the first HTTP URL */
function extractUrlsFromCdp(hex: string): string | null {
  try {
    const bytes = sharedHexToBytes(hex);
    const root = readDerTlv(bytes, 0);
    const urls = collectUrlStrings(root);
    return urls.find((u) => u.startsWith("http://") || u.startsWith("https://")) || null;
  } catch {
    return null;
  }
}

/** Recursively collect URI strings (tag 0x86) from ASN.1 tree */
function collectUrlStrings(tlv: DerTlv): string[] {
  const result: string[] = [];
  if (tlv.tag === 0x86) {
    result.push(new TextDecoder().decode(tlv.value));
  }
  if (tlv.tag & 0x20) {
    // constructed
    const children = parseChildren(tlv.value);
    for (const child of children) {
      result.push(...collectUrlStrings(child));
    }
  }
  return result;
}
