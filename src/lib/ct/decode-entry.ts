import { X509Certificate } from "@peculiar/x509";
import { bytesToHex } from "@/lib/hex";
import { toArrayBuffer } from "@/lib/pem";
import type { CTLogEntry } from "./gorgon";
import {
  base64ToBuffer,
  deriveCertType,
  derToPem,
  extractDnField,
  extractLogotypeSvg,
  extractSANs,
  hasBIMIOID,
  parseChainFromExtraData,
  readUint24,
  readUint64,
  sha256,
} from "./parser";

// Tailwind color name -> hex value mapping for byte map regions
export const BYTE_COLORS = {
  blue: "#3b82f6",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
} as const;

export type ByteColor = keyof typeof BYTE_COLORS;

// Semantic region -> color mapping
const COLORS: Record<string, ByteColor> = {
  version: "blue",
  leafType: "violet",
  timestamp: "amber",
  entryType: "emerald",
  issuerKeyHash: "rose",
  certLength: "cyan",
  certDer: "orange",
  extensions: "pink",
};

export interface ByteRange {
  start: number;
  end: number; // exclusive
  label: string;
  color: ByteColor;
  value: string;
  description: string;
}

export interface DecodedLeaf {
  version: number;
  leafType: number;
  timestamp: number;
  timestampDate: string;
  entryType: "x509_entry" | "precert_entry";
  issuerKeyHash?: string;
}

export interface DecodedCert {
  subject: string;
  organization: string | null;
  issuer: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  sans: string[];
  fingerprint: string;
  signatureAlg: string;
  publicKeyAlg: string;
  keySize: number | null;
  isBIMI: boolean;
  certType: "VMC" | "CMC" | null;
  markType: string | null;
  keyUsage: string[];
  extKeyUsage: string[];
  extensions: Array<{ oid: string; name: string | null; critical: boolean }>;
  logotypeSvg: string | null;
  certPem: string;
}

export interface DecodedChainCert {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  fingerprint: string;
  isCA: boolean;
  isSelfSigned: boolean;
}

export interface DecodedCTEntry {
  index: number;
  leaf: DecodedLeaf;
  cert: DecodedCert | null;
  chain: DecodedChainCert[];
  byteMap: ByteRange[];
  raw: {
    leafInput: string;
    extraData: string;
    leafHex: string;
  };
}

function getKeySize(cert: X509Certificate): number | null {
  try {
    const algo = cert.publicKey.algorithm;
    if ("modulusLength" in algo) return algo.modulusLength as number;
    if ("namedCurve" in algo) {
      const curve = algo.namedCurve as string;
      const sizes: Record<string, number> = { "P-256": 256, "P-384": 384, "P-521": 521 };
      return sizes[curve] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// Well-known OID -> friendly name mapping for extensions
const OID_NAMES: Record<string, string> = {
  "2.5.29.15": "Key Usage",
  "2.5.29.37": "Extended Key Usage",
  "2.5.29.19": "Basic Constraints",
  "2.5.29.14": "Subject Key Identifier",
  "2.5.29.35": "Authority Key Identifier",
  "2.5.29.17": "Subject Alternative Name",
  "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies",
  "1.3.6.1.5.5.7.1.1": "Authority Info Access",
  "1.3.6.1.5.5.7.1.12": "Logotype (BIMI)",
  "1.3.6.1.4.1.11129.2.4.2": "CT Precert SCTs",
  "1.3.6.1.4.1.11129.2.4.3": "CT Poison",
  "1.3.6.1.4.1.11129.2.4.5": "CT Precert Signing Cert",
};

// Well-known EKU OID -> friendly name
const EKU_NAMES: Record<string, string> = {
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
};

// Key Usage bit names (RFC 5280 §4.2.1.3)
const KU_BITS = [
  "digitalSignature",
  "contentCommitment",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
  "decipherOnly",
];

function parseKeyUsage(cert: X509Certificate): string[] {
  try {
    const ext = cert.extensions.find((e) => e.type === "2.5.29.15");
    if (!ext) return [];
    const bytes = new Uint8Array(ext.value);
    // Key Usage is a BIT STRING: tag 03, length, padding-bits, then the bits
    if (bytes.length < 4 || bytes[0] !== 0x03) return [];
    const padding = bytes[2];
    const bits = bytes[3];
    const result: string[] = [];
    for (let i = 0; i < 8 - padding; i++) {
      if (bits & (0x80 >> i)) result.push(KU_BITS[i]);
    }
    // Second byte of bits if present
    if (bytes.length > 4) {
      const bits2 = bytes[4];
      for (let i = 0; i < 8; i++) {
        if (bits2 & (0x80 >> i)) {
          const idx = 8 + i;
          if (idx < KU_BITS.length) result.push(KU_BITS[idx]);
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

function parseExtKeyUsage(cert: X509Certificate): string[] {
  try {
    const ext = cert.extensions.find((e) => e.type === "2.5.29.37");
    if (!ext) return [];
    // EKU is a SEQUENCE of OIDs. Parse the DER manually.
    const bytes = new Uint8Array(ext.value);
    if (bytes.length < 2 || bytes[0] !== 0x30) return [];
    const oids: string[] = [];
    let offset = 2;
    // Handle multi-byte length
    if (bytes[1] & 0x80) offset = 2 + (bytes[1] & 0x7f);
    while (offset < bytes.length) {
      if (bytes[offset] !== 0x06) break; // OID tag
      const len = bytes[offset + 1];
      offset += 2;
      const oidBytes = bytes.slice(offset, offset + len);
      offset += len;
      // Decode OID from DER
      const oid = derOidToString(oidBytes);
      oids.push(EKU_NAMES[oid] ?? oid);
    }
    return oids;
  } catch {
    return [];
  }
}

function derOidToString(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const parts: number[] = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let val = 0;
  for (let i = 1; i < bytes.length; i++) {
    val = (val << 7) | (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      parts.push(val);
      val = 0;
    }
  }
  return parts.join(".");
}

async function parseCertMetadata(certDer: Uint8Array): Promise<DecodedCert | null> {
  try {
    const cert = new X509Certificate(toArrayBuffer(certDer));
    const fingerprint = await sha256(certDer);
    const isBIMI = hasBIMIOID(cert);
    const markType = isBIMI ? extractDnField(cert.subject, "1.3.6.1.4.1.53087.1.13") : null;

    return {
      subject: extractDnField(cert.subject, "CN") ?? cert.subject,
      organization: extractDnField(cert.subject, "O"),
      issuer: extractDnField(cert.issuer, "CN") ?? cert.issuer,
      serial: cert.serialNumber,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
      sans: extractSANs(cert),
      fingerprint,
      signatureAlg: cert.signatureAlgorithm.name ?? "Unknown",
      publicKeyAlg: cert.publicKey.algorithm.name ?? "Unknown",
      keySize: getKeySize(cert),
      isBIMI,
      certType: deriveCertType(markType),
      markType,
      keyUsage: parseKeyUsage(cert),
      extKeyUsage: parseExtKeyUsage(cert),
      extensions: cert.extensions.map((ext) => ({
        oid: ext.type,
        name: OID_NAMES[ext.type] ?? null,
        critical: ext.critical,
      })),
      logotypeSvg: extractLogotypeSvg(cert).svgContent,
      certPem: derToPem(certDer),
    };
  } catch {
    return null;
  }
}

function pemToBytes(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return base64ToBuffer(b64);
}

async function parseChainCerts(extraBuf: Uint8Array, entryType: number): Promise<DecodedChainCert[]> {
  const pems = parseChainFromExtraData(extraBuf, entryType);
  const certs: DecodedChainCert[] = [];
  for (const pem of pems) {
    try {
      const der = pemToBytes(pem);
      const cert = new X509Certificate(toArrayBuffer(der));
      const fingerprint = await sha256(der);
      const isCA = cert.extensions.some((ext) => {
        if (ext.type !== "2.5.29.19") return false;
        // Basic Constraints: SEQUENCE { BOOLEAN (cA) ... }
        const bytes = new Uint8Array(ext.value);
        // Look for TRUE (0x01 0x01 0xFF) inside the SEQUENCE
        for (let i = 0; i < bytes.length - 2; i++) {
          if (bytes[i] === 0x01 && bytes[i + 1] === 0x01 && bytes[i + 2] === 0xff) return true;
        }
        return false;
      });
      certs.push({
        subject: extractDnField(cert.subject, "CN") ?? cert.subject,
        issuer: extractDnField(cert.issuer, "CN") ?? cert.issuer,
        notBefore: cert.notBefore.toISOString(),
        notAfter: cert.notAfter.toISOString(),
        fingerprint,
        isCA,
        isSelfSigned: cert.subject === cert.issuer,
      });
    } catch {
      // Best-effort chain parsing
    }
  }
  return certs;
}

export async function decodeCTEntry(entry: CTLogEntry, index: number): Promise<DecodedCTEntry> {
  const leafBuf = base64ToBuffer(entry.leaf_input);
  const byteMap: ByteRange[] = [];

  // MerkleTreeLeaf minimum: 1 (version) + 1 (leaf type) + 8 (timestamp) + 2 (entry type) = 12 bytes
  if (leafBuf.length < 12) {
    throw new Error(`Leaf input too short: ${leafBuf.length} bytes (minimum 12)`);
  }

  // Version (byte 0)
  const version = leafBuf[0];
  byteMap.push({
    start: 0,
    end: 1,
    label: "Version",
    color: COLORS.version,
    value: `v${version + 1}`,
    description: "MerkleTreeLeaf version (0 = v1)",
  });

  // Leaf type (byte 1)
  const leafType = leafBuf[1];
  byteMap.push({
    start: 1,
    end: 2,
    label: "Leaf Type",
    color: COLORS.leafType,
    value: leafType === 0 ? "timestamped_entry" : `unknown(${leafType})`,
    description: "Leaf type (0 = TimestampedEntry)",
  });

  // Timestamp (bytes 2-9)
  const timestamp = readUint64(leafBuf, 2);
  const timestampDate = new Date(timestamp).toISOString();
  byteMap.push({
    start: 2,
    end: 10,
    label: "Timestamp",
    color: COLORS.timestamp,
    value: timestampDate,
    description: "Milliseconds since Unix epoch when the log recorded this entry",
  });

  // Entry type (bytes 10-11)
  const entryTypeRaw = (leafBuf[10] << 8) | leafBuf[11];
  const entryType: "x509_entry" | "precert_entry" = entryTypeRaw === 0 ? "x509_entry" : "precert_entry";
  byteMap.push({
    start: 10,
    end: 12,
    label: "Entry Type",
    color: COLORS.entryType,
    value: entryType,
    description:
      entryTypeRaw === 0 ? "X.509 certificate entry" : "Pre-certificate entry (SCT embedded before issuance)",
  });

  let certDer: Uint8Array;
  let certLenOffset: number;
  let issuerKeyHash: string | undefined;

  if (entryTypeRaw === 1) {
    // Precert: 32-byte issuer key hash
    issuerKeyHash = bytesToHex(leafBuf.slice(12, 44));
    byteMap.push({
      start: 12,
      end: 44,
      label: "Issuer Key Hash",
      color: COLORS.issuerKeyHash,
      value: issuerKeyHash.substring(0, 16) + "...",
      description: "SHA-256 hash of the intermediate CA's public key",
    });
    certLenOffset = 44;
  } else {
    certLenOffset = 12;
  }

  // Cert/TBS length (3 bytes)
  if (certLenOffset + 3 > leafBuf.length) {
    throw new Error(`Leaf input too short for cert length at offset ${certLenOffset}`);
  }
  const certLen = readUint24(leafBuf, certLenOffset);
  byteMap.push({
    start: certLenOffset,
    end: certLenOffset + 3,
    label: entryTypeRaw === 1 ? "TBS Length" : "Cert Length",
    color: COLORS.certLength,
    value: `${certLen} bytes`,
    description: `Length of the ${entryTypeRaw === 1 ? "TBS certificate" : "DER-encoded certificate"} that follows`,
  });

  // Certificate DER data
  const certStart = certLenOffset + 3;
  const certEnd = certStart + certLen;
  byteMap.push({
    start: certStart,
    end: certEnd,
    label: entryTypeRaw === 1 ? "TBS Certificate" : "Certificate",
    color: COLORS.certDer,
    value: `${certLen} bytes of DER data`,
    description:
      entryTypeRaw === 1
        ? "The pre-certificate's TBSCertificate (without signature)"
        : "The full DER-encoded X.509 certificate",
  });

  // Extensions (remaining bytes after cert)
  if (certEnd < leafBuf.length) {
    const extLen = certEnd + 2 <= leafBuf.length ? (leafBuf[certEnd] << 8) | leafBuf[certEnd + 1] : 0;
    byteMap.push({
      start: certEnd,
      end: leafBuf.length,
      label: "Extensions",
      color: COLORS.extensions,
      value: `${extLen} bytes`,
      description: "CT extensions (typically empty for standard entries)",
    });
  }

  // Decode extra_data once for both cert extraction (precert) and chain parsing
  const extraBuf = base64ToBuffer(entry.extra_data);

  if (entryTypeRaw === 0) {
    certDer = leafBuf.slice(certStart, certEnd);
  } else {
    const preCertLen = readUint24(extraBuf, 0);
    certDer = extraBuf.slice(3, 3 + preCertLen);
  }

  const [cert, chain] = await Promise.all([parseCertMetadata(certDer), parseChainCerts(extraBuf, entryTypeRaw)]);

  const leaf: DecodedLeaf = {
    version,
    leafType,
    timestamp,
    timestampDate,
    entryType,
  };

  if (issuerKeyHash) {
    leaf.issuerKeyHash = issuerKeyHash;
  }

  return {
    index,
    leaf,
    cert,
    chain,
    byteMap,
    raw: {
      leafInput: entry.leaf_input,
      extraData: entry.extra_data,
      leafHex: bytesToHex(leafBuf),
    },
  };
}
