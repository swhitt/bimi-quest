import { SubjectAlternativeNameExtension, X509Certificate } from "@peculiar/x509";
import { bytesToHex } from "@/lib/hex";
import { toArrayBuffer } from "@/lib/pem";
import type { CTLogEntry } from "./gorgon";
import { base64ToBuffer, extractDnField, hasBIMIOID, parseChainFromExtraData, readUint24, readUint64 } from "./parser";

// Tailwind color names for byte map regions
const COLORS = {
  version: "blue",
  leafType: "violet",
  timestamp: "amber",
  entryType: "emerald",
  issuerKeyHash: "rose",
  certLength: "cyan",
  certDer: "orange",
  extensions: "pink",
} as const;

export interface ByteRange {
  start: number;
  end: number; // exclusive
  label: string;
  color: string;
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
  extensionOIDs: string[];
}

export interface DecodedChainCert {
  subject: string;
  issuer: string;
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

function extractSANs(cert: X509Certificate): string[] {
  try {
    const sanExt = cert.getExtension(SubjectAlternativeNameExtension);
    if (!sanExt) return [];
    return sanExt.names.items.filter((n) => n.type === "dns").map((n) => n.value);
  } catch {
    return [];
  }
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

async function computeFingerprint(der: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(der));
  return bytesToHex(new Uint8Array(hash));
}

async function parseCertMetadata(certDer: Uint8Array): Promise<DecodedCert | null> {
  try {
    const cert = new X509Certificate(toArrayBuffer(certDer));
    const fingerprint = await computeFingerprint(certDer);

    return {
      subject: extractDnField(cert.subject, "CN") ?? cert.subject,
      issuer: extractDnField(cert.issuer, "CN") ?? cert.issuer,
      serial: cert.serialNumber,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
      sans: extractSANs(cert),
      fingerprint,
      signatureAlg: cert.signatureAlgorithm.name ?? "Unknown",
      publicKeyAlg: cert.publicKey.algorithm.name ?? "Unknown",
      keySize: getKeySize(cert),
      isBIMI: hasBIMIOID(cert),
      extensionOIDs: cert.extensions.map((ext) => ext.type),
    };
  } catch {
    return null;
  }
}

function parseChainCerts(extraBuf: Uint8Array, entryType: number): DecodedChainCert[] {
  const pems = parseChainFromExtraData(extraBuf, entryType);
  const certs: DecodedChainCert[] = [];
  for (const pem of pems) {
    try {
      const der = base64ToBuffer(
        pem
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s+/g, ""),
      );
      const cert = new X509Certificate(toArrayBuffer(der));
      certs.push({
        subject: extractDnField(cert.subject, "CN") ?? cert.subject,
        issuer: extractDnField(cert.issuer, "CN") ?? cert.issuer,
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

  if (entryTypeRaw === 1) {
    // Precert: 32-byte issuer key hash
    const issuerKeyHash = bytesToHex(leafBuf.slice(12, 44));
    byteMap.push({
      start: 12,
      end: 44,
      label: "Issuer Key Hash",
      color: COLORS.issuerKeyHash,
      value: issuerKeyHash.substring(0, 16) + "...",
      description: "SHA-256 hash of the issuing CA's public key",
    });
    certLenOffset = 44;
  } else {
    certLenOffset = 12;
  }

  // Cert/TBS length (3 bytes)
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

  // Get the actual cert to parse. For precerts, it's in extra_data.
  if (entryTypeRaw === 0) {
    certDer = leafBuf.slice(certStart, certEnd);
  } else {
    const extraBuf = base64ToBuffer(entry.extra_data);
    const preCertLen = readUint24(extraBuf, 0);
    certDer = extraBuf.slice(3, 3 + preCertLen);
  }

  const extraBuf = base64ToBuffer(entry.extra_data);
  const [cert, chain] = await Promise.all([
    parseCertMetadata(certDer),
    Promise.resolve(parseChainCerts(extraBuf, entryTypeRaw)),
  ]);

  const leaf: DecodedLeaf = {
    version,
    leafType,
    timestamp,
    timestampDate,
    entryType,
  };

  if (entryTypeRaw === 1) {
    leaf.issuerKeyHash = bytesToHex(leafBuf.slice(12, 44));
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
