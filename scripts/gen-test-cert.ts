#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-unused-vars -- DER helper library; not all helpers used in every cert profile */
/**
 * Generates a BIMI VMC test certificate that passes all linter rules.
 * Uses OpenSSL for key generation and cert signing, with manually
 * constructed DER for the complex BIMI-specific extensions.
 *
 * Usage: bun run scripts/gen-test-cert.ts
 * Output: PEM string to stdout (paste into fixtures.ts)
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// gzipSync is dynamically imported below (top-level await)
import { createHash as cryptoHash } from "node:crypto";

// ── SVG Tiny PS compliant logo ──────────────────────────────────────
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 100 100" width="100" height="100">
  <title>Test Brand</title>
  <desc>Test logo for BIMI certificate linter</desc>
  <rect width="100" height="100" fill="#4285f4"/>
  <circle cx="50" cy="50" r="30" fill="#ffffff"/>
</svg>`;

// ── DER construction helpers ────────────────────────────────────────

function derLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function derWrap(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function derSequence(content: Buffer): Buffer {
  return derWrap(0x30, content);
}

function derSet(content: Buffer): Buffer {
  return derWrap(0x31, content);
}

function derOctetString(content: Buffer): Buffer {
  return derWrap(0x04, content);
}

function derIA5String(s: string): Buffer {
  return derWrap(0x16, Buffer.from(s, "ascii"));
}

function derUTF8String(s: string): Buffer {
  return derWrap(0x0c, Buffer.from(s, "utf-8"));
}

function derPrintableString(s: string): Buffer {
  return derWrap(0x13, Buffer.from(s, "ascii"));
}

function derOID(oid: string): Buffer {
  const parts = oid.split(".").map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const encoded: number[] = [];
      encoded.push(val & 0x7f);
      val = Math.floor(val / 128);
      while (val > 0) {
        encoded.push((val & 0x7f) | 0x80);
        val = Math.floor(val / 128);
      }
      encoded.reverse();
      bytes.push(...encoded);
    }
  }
  return derWrap(0x06, Buffer.from(bytes));
}

function derExplicit(tagNum: number, content: Buffer): Buffer {
  return derWrap(0xa0 | tagNum, content);
}

function derImplicit(tagNum: number, content: Buffer): Buffer {
  // Replace the tag of the content's outer element with the implicit tag
  return derWrap(0xa0 | tagNum, content);
}

function derBoolean(val: boolean): Buffer {
  return derWrap(0x01, Buffer.from([val ? 0xff : 0x00]));
}

function derInteger(val: number | bigint): Buffer {
  if (typeof val === "number") {
    if (val === 0) return derWrap(0x02, Buffer.from([0]));
    const bytes: number[] = [];
    let v = val;
    while (v > 0) {
      bytes.unshift(v & 0xff);
      v = Math.floor(v / 256);
    }
    if (bytes[0] & 0x80) bytes.unshift(0); // positive sign
    return derWrap(0x02, Buffer.from(bytes));
  }
  // For bigint (serial numbers)
  let hex = val.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const buf = Buffer.from(hex, "hex");
  if (buf[0] & 0x80) return derWrap(0x02, Buffer.concat([Buffer.from([0]), buf]));
  return derWrap(0x02, buf);
}

function derBitString(content: Buffer): Buffer {
  // Prepend unused-bits byte (0)
  return derWrap(0x03, Buffer.concat([Buffer.from([0x00]), content]));
}

function derGeneralizedTime(date: Date): Buffer {
  const s = date.toISOString().replace(/[-:T]/g, "").replace(/\.\d+/, "");
  return derWrap(0x18, Buffer.from(s, "ascii"));
}

function derUTCTime(date: Date): Buffer {
  const y = date.getUTCFullYear().toString().slice(2);
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  const sec = date.getUTCSeconds().toString().padStart(2, "0");
  return derWrap(0x17, Buffer.from(`${y}${m}${d}${h}${min}${sec}Z`, "ascii"));
}

// ── RDN construction ────────────────────────────────────────────────

function rdnAttr(oid: string, value: string, stringFn = derUTF8String): Buffer {
  return derSet(derSequence(Buffer.concat([derOID(oid), stringFn(value)])));
}

// ── Extension construction ──────────────────────────────────────────

function extension(oid: string, critical: boolean, value: Buffer): Buffer {
  const parts = [derOID(oid)];
  if (critical) parts.push(derBoolean(true));
  parts.push(derOctetString(value));
  return derSequence(Buffer.concat(parts));
}

// ── Build the certificate ───────────────────────────────────────────

const tmpDir = mkdtempSync(join(tmpdir(), "bimi-cert-"));

try {
  // Generate RSA 2048 key
  execSync(`openssl genrsa -out "${join(tmpDir, "key.pem")}" 2048 2>/dev/null`);

  // Extract public key DER
  execSync(
    `openssl rsa -in "${join(tmpDir, "key.pem")}" -pubout -outform DER -out "${join(tmpDir, "pub.der")}" 2>/dev/null`,
  );
  const pubKeyDer = readFileSync(join(tmpDir, "pub.der"));

  // Gzip the SVG and compute hash
  const { gzipSync } = await import("node:zlib");
  const svgGzipped = gzipSync(Buffer.from(SVG, "utf-8"));
  const svgB64 = svgGzipped.toString("base64");
  const svgHash = cryptoHash("sha256").update(svgGzipped).digest();

  // ── Subject DN ──
  const subject = Buffer.concat([
    rdnAttr("2.5.4.6", "US", derPrintableString), // C
    rdnAttr("2.5.4.8", "California", derUTF8String), // ST
    rdnAttr("2.5.4.7", "San Francisco", derUTF8String), // L
    rdnAttr("2.5.4.10", "Test Brand Inc.", derUTF8String), // O
    rdnAttr("2.5.4.3", "Test Brand Inc.", derUTF8String), // CN
    rdnAttr("1.3.6.1.4.1.53087.1.13", "Registered Mark", derUTF8String), // Mark Type
    rdnAttr("1.3.6.1.4.1.53087.1.3", "US", derUTF8String), // Trademark Country
    rdnAttr("1.3.6.1.4.1.53087.1.2", "USPTO", derUTF8String), // Trademark Office
    rdnAttr("1.3.6.1.4.1.53087.1.4", "97123456", derUTF8String), // Trademark Reg ID
  ]);
  const subjectDN = derSequence(subject);

  // ── Validity (825 days from now) ──
  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + 824 * 24 * 60 * 60 * 1000); // 824 days, under 825

  // ── Extensions ──

  // 1. Basic Constraints: CA=false
  const basicConstraintsExt = extension("2.5.29.19", true, derSequence(Buffer.concat([derBoolean(false)])));

  // 2. Key Usage: digitalSignature, critical
  const keyUsageExt = extension("2.5.29.15", true, derBitString(Buffer.from([0x80]))); // bit 0 = digitalSignature

  // 3. Extended Key Usage: BIMI only
  const ekuExt = extension("2.5.29.37", false, derSequence(derOID("1.3.6.1.5.5.7.3.31")));

  // 4. Subject Alternative Name: DNS:test.example.com
  const sanExt = extension(
    "2.5.29.17",
    false,
    derSequence(derWrap(0x82, Buffer.from("test.example.com", "ascii"))), // [2] dNSName
  );

  // 5. Certificate Policies: BIMI General Policy + CPS URL
  const SHA256_ALG_ID = "2.16.840.1.101.3.4.2.1";
  const cpsUrl = "https://example.com/cps";
  // PolicyInformation ::= SEQUENCE { policyIdentifier, policyQualifiers }
  // PolicyQualifierInfo ::= SEQUENCE { policyQualifierId, qualifier }
  // id-qt-cps = 1.3.6.1.5.5.7.2.1
  const policyQualifier = derSequence(Buffer.concat([derOID("1.3.6.1.5.5.7.2.1"), derIA5String(cpsUrl)]));
  const bimiPolicy = derSequence(
    Buffer.concat([
      derOID("1.3.6.1.4.1.53087.1.1"),
      derSequence(policyQualifier), // SEQUENCE OF PolicyQualifierInfo
    ]),
  );
  // Add a known CA policy OID (DigiCert VMC) so w_bimi_ca_policy_oid passes
  const caPolicy = derSequence(derOID("2.16.840.1.114412.0.2.5"));
  const certPoliciesExt = extension("2.5.29.32", false, derSequence(Buffer.concat([bimiPolicy, caPolicy])));

  // 6. Logotype extension (RFC 3709)
  // Structure: LogotypeExtnValue -> subjectLogo [2] -> direct [0] -> LogotypeData
  const dataUri = `data:image/svg+xml;base64,${svgB64}`;
  const hashAlgId = derSequence(derOID(SHA256_ALG_ID)); // AlgorithmIdentifier (no params for SHA-256)
  const hashAndValue = derSequence(Buffer.concat([hashAlgId, derOctetString(svgHash)]));
  const logotypeDetails = derSequence(
    Buffer.concat([
      derIA5String("image/svg+xml"), // mediaType
      derSequence(hashAndValue), // SEQUENCE OF HashAlgAndValue
      derSequence(derIA5String(dataUri)), // SEQUENCE OF IA5String (logotypeURI)
    ]),
  );
  const logotypeImage = derSequence(logotypeDetails); // LogotypeImage (imageDetails only)
  // Build LogotypeData content: SEQUENCE OF LogotypeImage, wrapped with [0] IMPLICIT context tag
  const imageSeqOfContent = derSequence(logotypeImage); // SEQUENCE OF LogotypeImage
  const logotypeDataContent2 = imageSeqOfContent; // LogotypeData only has image field
  const direct = derWrap(0xa0, logotypeDataContent2); // [0] IMPLICIT SEQUENCE -> context tag wrapping content
  const subjectLogo = derExplicit(2, direct); // [2] EXPLICIT
  const logotypeExtnValue = derSequence(subjectLogo);
  const logotypeExt = extension("1.3.6.1.5.5.7.1.12", false, logotypeExtnValue);

  // 7. SCT List extension (dummy - linter only checks presence)
  // SCT list is an OCTET STRING containing a TLS-encoded SCT list.
  // We'll create a minimal fake one. The linter only checks the extension OID exists.
  // SignedCertificateTimestampList is TLS-encoded, not DER. Just put some bytes.
  const fakeSctData = Buffer.alloc(47);
  fakeSctData[0] = 0x00;
  fakeSctData[1] = 45; // list length
  fakeSctData[2] = 0x00;
  fakeSctData[3] = 43; // sct length
  fakeSctData[4] = 0x00; // version v1
  // 32 bytes log ID
  for (let i = 0; i < 32; i++) fakeSctData[5 + i] = i;
  // 8 bytes timestamp
  fakeSctData[37] = 0x00;
  // 2 bytes extensions length = 0
  fakeSctData[45] = 0x00;
  fakeSctData[46] = 0x00;
  // The SCT extension value in a cert is an OCTET STRING wrapping the TLS-encoded list
  const sctExt = extension("1.3.6.1.4.1.11129.2.4.2", false, derOctetString(fakeSctData));

  // ── Build TBSCertificate ──
  // Generate a random serial with ≥64 bits of entropy
  const serialBytes = Buffer.alloc(20);
  for (let i = 0; i < 20; i++) serialBytes[i] = Math.floor(Math.random() * 256);
  serialBytes[0] &= 0x7f; // ensure positive

  const sha256WithRSA_OID = "1.2.840.113549.1.1.11";
  const sigAlgId = derSequence(Buffer.concat([derOID(sha256WithRSA_OID), Buffer.from([0x05, 0x00])])); // NULL params

  const extensions = derSequence(
    Buffer.concat([basicConstraintsExt, keyUsageExt, ekuExt, sanExt, certPoliciesExt, logotypeExt, sctExt]),
  );

  const tbsCertificate = derSequence(
    Buffer.concat([
      derExplicit(0, derInteger(2)), // version v3
      derInteger(BigInt("0x" + serialBytes.toString("hex"))), // serial
      sigAlgId, // signature algorithm
      subjectDN, // issuer (self-signed, same as subject)
      derSequence(Buffer.concat([derUTCTime(notBefore), derUTCTime(notAfter)])), // validity
      subjectDN, // subject
      pubKeyDer, // subjectPublicKeyInfo (raw from OpenSSL)
      derExplicit(3, extensions), // extensions
    ]),
  );

  // Write TBS to file for signing
  writeFileSync(join(tmpDir, "tbs.der"), tbsCertificate);

  // Sign with OpenSSL
  execSync(
    `openssl dgst -sha256 -sign "${join(tmpDir, "key.pem")}" -out "${join(tmpDir, "sig.der")}" "${join(tmpDir, "tbs.der")}"`,
  );
  const signature = readFileSync(join(tmpDir, "sig.der"));

  // ── Build final Certificate ──
  const certificate = derSequence(Buffer.concat([tbsCertificate, sigAlgId, derBitString(signature)]));

  // Convert to PEM
  const b64 = certificate.toString("base64");
  const lines: string[] = ["-----BEGIN CERTIFICATE-----"];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  lines.push("-----END CERTIFICATE-----");
  const pem = lines.join("\n");

  // Verify with OpenSSL
  writeFileSync(join(tmpDir, "cert.pem"), pem);
  try {
    const info = execSync(`openssl x509 -in "${join(tmpDir, "cert.pem")}" -noout -text 2>&1`, {
      encoding: "utf-8",
    });
    console.error("=== OpenSSL parsed successfully ===");
    console.error(info.slice(0, 2000));
  } catch (e: unknown) {
    console.error("=== OpenSSL parse failed ===");
    const err = e as { stdout?: string; message?: string };
    console.error(err.stdout || err.message);
    process.exit(1);
  }

  console.log(pem);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
