import { describe, it, expect } from "vitest";
import {
  pemToDer,
  buildOcspRequest,
  parseOcspResponse,
  extractOcspUrl,
  extractCrlUrl,
  parseCrl,
  extractIssuerInfo,
  extractSubjectNameDer,
} from "./revocation";

// A real self-signed RSA certificate (generated via openssl) for structural tests.
const SAMPLE_PEM = `-----BEGIN CERTIFICATE-----
MIIBvzCCAWmgAwIBAgIUS2fddFqtZWA9Mfym225LdAtzrl4wDQYJKoZIhvcNAQEL
BQAwNDESMBAGA1UEAwwJVGVzdCBDZXJ0MREwDwYDVQQKDAhUZXN0IE9yZzELMAkG
A1UEBhMCVVMwHhcNMjYwMjI4MjE0NDU3WhcNMjcwMjI4MjE0NDU3WjA0MRIwEAYD
VQQDDAlUZXN0IENlcnQxETAPBgNVBAoMCFRlc3QgT3JnMQswCQYDVQQGEwJVUzBc
MA0GCSqGSIb3DQEBAQUAA0sAMEgCQQDLNCj1IwNNgTzklIoDKjH/fpH4GShTpNxn
1IOn6O6JovLlSoy/63QSGkSJiTjbauEB4Kx0Rh4EorJ5Xm5skL37AgMBAAGjUzBR
MB0GA1UdDgQWBBQHhRAbHLYaQAxI9V9++5KChOdF8jAfBgNVHSMEGDAWgBQHhRAb
HLYaQAxI9V9++5KChOdF8jAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A0EAer3snX+QUZEjbs5gImYJjN2yT+kFIe47IX6IU3ZMk/9Y73ou88YRM5gKu38u
7GLVA2IycECvl6JTzGakoJRjkw==
-----END CERTIFICATE-----`;

describe("pemToDer", () => {
  it("strips PEM headers and decodes base64 to bytes", () => {
    const der = pemToDer(SAMPLE_PEM);
    expect(der).toBeInstanceOf(Uint8Array);
    expect(der.length).toBeGreaterThan(0);
    // DER certificate starts with SEQUENCE tag (0x30)
    expect(der[0]).toBe(0x30);
  });

  it("handles PEM with different header types", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
AAAA
-----END RSA PRIVATE KEY-----`;
    const der = pemToDer(pem);
    expect(der.length).toBe(3); // "AAAA" base64 = 3 bytes
  });

  it("handles PEM with extra whitespace and newlines", () => {
    const pem = `-----BEGIN CERTIFICATE-----
  AQID

-----END CERTIFICATE-----`;
    const der = pemToDer(pem);
    // "AQID" decodes to [0x01, 0x02, 0x03]
    expect(Array.from(der)).toEqual([0x01, 0x02, 0x03]);
  });
});

describe("buildOcspRequest", () => {
  // Build a minimal but structurally valid SubjectPublicKeyInfo (SPKI)
  // SEQUENCE { SEQUENCE { OID rsaEncryption, NULL }, BIT STRING { ... } }
  function makeMockSpki(): Uint8Array {
    // This is a simplified SPKI with a 20-byte fake key inside the BIT STRING
    const rsaOid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]; // OID 1.2.840.113549.1.1.1
    const nullVal = [0x05, 0x00];
    const algoSeq = [0x30, rsaOid.length + nullVal.length, ...rsaOid, ...nullVal];
    const keyBytes = new Array(20).fill(0xab);
    const bitString = [0x03, keyBytes.length + 1, 0x00, ...keyBytes]; // 0x00 = unused bits
    const spki = [0x30, algoSeq.length + bitString.length, ...algoSeq, ...bitString];
    return new Uint8Array(spki);
  }

  it("returns a DER-encoded OCSP request starting with SEQUENCE tag", () => {
    const issuerNameDer = new Uint8Array([0x30, 0x03, 0x01, 0x02, 0x03]); // minimal SEQUENCE
    const issuerPublicKeyDer = makeMockSpki();

    const result = buildOcspRequest({
      issuerNameDer,
      issuerPublicKeyDer,
      serialNumberHex: "01ab",
    });

    expect(result).toBeInstanceOf(Uint8Array);
    // Outer tag is SEQUENCE (0x30)
    expect(result[0]).toBe(0x30);
    // Must be at least several dozen bytes (SHA-1 hashes, serial, OIDs, nesting)
    expect(result.length).toBeGreaterThan(50);
  });

  it("encodes serial numbers with leading zero for high-bit serials", () => {
    const issuerNameDer = new Uint8Array([0x30, 0x02, 0xaa, 0xbb]);
    const issuerPublicKeyDer = makeMockSpki();

    const resultHigh = buildOcspRequest({
      issuerNameDer,
      issuerPublicKeyDer,
      serialNumberHex: "ff01",
    });

    const resultLow = buildOcspRequest({
      issuerNameDer,
      issuerPublicKeyDer,
      serialNumberHex: "7f01",
    });

    // Both should produce valid DER
    expect(resultHigh[0]).toBe(0x30);
    expect(resultLow[0]).toBe(0x30);
    // High-bit serial gets padded with 0x00, so request should be 1 byte longer
    expect(resultHigh.length).toBe(resultLow.length + 1);
  });

  it("handles odd-length hex serial by left-padding", () => {
    const issuerNameDer = new Uint8Array([0x30, 0x02, 0xaa, 0xbb]);
    const issuerPublicKeyDer = makeMockSpki();

    // Odd-length hex "abc" should be treated as "0abc"
    const result = buildOcspRequest({
      issuerNameDer,
      issuerPublicKeyDer,
      serialNumberHex: "abc",
    });
    expect(result[0]).toBe(0x30);
    expect(result.length).toBeGreaterThan(50);
  });
});

describe("parseOcspResponse", () => {
  /**
   * Build a minimal mock OCSP response DER structure.
   * OCSPResponse = SEQUENCE {
   *   responseStatus ENUMERATED (0=successful),
   *   responseBytes [0] EXPLICIT SEQUENCE { OID, OCTET STRING(BasicOCSPResponse) }
   * }
   */
  function buildMockOcspResponse(certStatusTag: number): Uint8Array {
    // GeneralizedTime for "20240601120000Z"
    const timeStr = "20240601120000Z";
    const timeBytes = Array.from(new TextEncoder().encode(timeStr));
    const thisUpdate = [0x18, timeBytes.length, ...timeBytes]; // GeneralizedTime tag=0x18

    const nextTimeStr = "20240701120000Z";
    const nextTimeBytes = Array.from(new TextEncoder().encode(nextTimeStr));
    const nextUpdateInner = [0x18, nextTimeBytes.length, ...nextTimeBytes];
    // Wrap nextUpdate in [0] EXPLICIT (context tag 0xa0)
    const nextUpdate = [0xa0, nextUpdateInner.length, ...nextUpdateInner];

    // CertID: just a dummy SEQUENCE
    const certId = [0x30, 0x02, 0x05, 0x00]; // SEQUENCE { NULL }

    // certStatus: context-tagged based on requested status
    let certStatus: number[];
    if (certStatusTag === 0) {
      // good: [0] IMPLICIT NULL -> tag 0x80, len 0
      certStatus = [0x80, 0x00];
    } else if (certStatusTag === 1) {
      // revoked: [1] CONSTRUCTED -> tag 0xa1 with some content
      const revokedTime = [0x18, timeBytes.length, ...timeBytes];
      certStatus = [0xa1, revokedTime.length, ...revokedTime];
    } else {
      // unknown: [2] IMPLICIT NULL -> tag 0x82, len 0
      certStatus = [0x82, 0x00];
    }

    // SingleResponse = SEQUENCE { certID, certStatus, thisUpdate, nextUpdate? }
    const singleRespContent = [...certId, ...certStatus, ...thisUpdate, ...nextUpdate];
    const singleResponse = [0x30, singleRespContent.length, ...singleRespContent];

    // responses = SEQUENCE OF SingleResponse
    const responses = [0x30, singleResponse.length, ...singleResponse];

    // responderId [1] (context tag) - just a placeholder
    const responderId = [0xa1, 0x02, 0x05, 0x00];

    // producedAt GeneralizedTime
    const producedAt = [0x18, timeBytes.length, ...timeBytes];

    // tbsResponseData = SEQUENCE { responderId, producedAt, responses }
    const tbsContent = [...responderId, ...producedAt, ...responses];
    const tbsResponseData = [0x30, tbsContent.length, ...tbsContent];

    // BasicOCSPResponse = SEQUENCE { tbsResponseData, signatureAlgorithm, signature }
    const sigAlgo = [0x30, 0x02, 0x05, 0x00]; // dummy
    const sig = [0x03, 0x02, 0x00, 0xff]; // dummy BIT STRING
    const basicContent = [...tbsResponseData, ...sigAlgo, ...sig];
    const basicOcspResponse = [0x30, basicContent.length, ...basicContent];

    // responseBytes OCTET STRING wrapping basicOcspResponse
    const basicOcspOid = [0x06, 0x09, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x01, 0x01]; // 1.3.6.1.5.5.7.48.1.1
    const octetString = [0x04, basicOcspResponse.length, ...basicOcspResponse];
    const responseBytesSeq = [0x30, basicOcspOid.length + octetString.length, ...basicOcspOid, ...octetString];

    // Wrap in [0] EXPLICIT
    const responseBytesExplicit = [0xa0, responseBytesSeq.length, ...responseBytesSeq];

    // responseStatus ENUMERATED = 0 (successful)
    const responseStatus = [0x0a, 0x01, 0x00];

    // OCSPResponse = SEQUENCE { responseStatus, responseBytes }
    const ocspContent = [...responseStatus, ...responseBytesExplicit];
    const ocspResponse = [0x30, ocspContent.length, ...ocspContent];

    return new Uint8Array(ocspResponse);
  }

  it("parses a good OCSP response", () => {
    const der = buildMockOcspResponse(0);
    const result = parseOcspResponse(der);
    expect(result.status).toBe("good");
    expect(result.thisUpdate).toBe("2024-06-01T12:00:00Z");
    expect(result.nextUpdate).toBe("2024-07-01T12:00:00Z");
  });

  it("parses a revoked OCSP response", () => {
    const der = buildMockOcspResponse(1);
    const result = parseOcspResponse(der);
    expect(result.status).toBe("revoked");
  });

  it("parses an unknown OCSP response", () => {
    const der = buildMockOcspResponse(2);
    const result = parseOcspResponse(der);
    expect(result.status).toBe("unknown");
  });

  it("throws on error response status", () => {
    // Build response with status=1 (malformedRequest)
    const responseStatus = [0x0a, 0x01, 0x01];
    const ocspResponse = [0x30, responseStatus.length, ...responseStatus];
    const der = new Uint8Array(ocspResponse);

    expect(() => parseOcspResponse(der)).toThrow("malformedRequest");
  });

  it("throws on unauthorized response status", () => {
    const responseStatus = [0x0a, 0x01, 0x06];
    const ocspResponse = [0x30, responseStatus.length, ...responseStatus];
    const der = new Uint8Array(ocspResponse);

    expect(() => parseOcspResponse(der)).toThrow("unauthorized");
  });
});

describe("extractOcspUrl", () => {
  /**
   * Build a hex-encoded AIA extension value containing an OCSP URL.
   * AuthorityInfoAccess = SEQUENCE OF AccessDescription
   * AccessDescription = SEQUENCE { accessMethod OID, accessLocation GeneralName }
   * For OCSP: accessMethod = 1.3.6.1.5.5.7.48.1, accessLocation = [6] URI
   */
  function buildAiaHex(url: string): string {
    const urlBytes = Array.from(new TextEncoder().encode(url));
    // accessLocation: context [6] (uniformResourceIdentifier) = tag 0x86
    const accessLocation = [0x86, urlBytes.length, ...urlBytes];
    // OCSP OID: 1.3.6.1.5.5.7.48.1 = 06 08 2b 06 01 05 05 07 30 01
    const ocspOid = [0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x01];
    const accessDesc = [0x30, ocspOid.length + accessLocation.length, ...ocspOid, ...accessLocation];
    const seq = [0x30, accessDesc.length, ...accessDesc];
    return Array.from(seq).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  it("extracts OCSP URL from AIA extension", () => {
    const hex = buildAiaHex("http://ocsp.example.com");
    const url = extractOcspUrl({ "1.3.6.1.5.5.7.1.1": hex });
    expect(url).toBe("http://ocsp.example.com");
  });

  it("extracts URL from new format with { v, c } entry", () => {
    const hex = buildAiaHex("http://ocsp.digicert.com");
    const url = extractOcspUrl({ "1.3.6.1.5.5.7.1.1": { v: hex, c: false } });
    expect(url).toBe("http://ocsp.digicert.com");
  });

  it("returns null when AIA extension is missing", () => {
    expect(extractOcspUrl({})).toBeNull();
  });

  it("returns null for malformed hex", () => {
    expect(extractOcspUrl({ "1.3.6.1.5.5.7.1.1": "zzzz" })).toBeNull();
  });
});

describe("extractCrlUrl", () => {
  /**
   * Build a hex-encoded CDP extension value containing a CRL URL.
   * CRLDistributionPoints = SEQUENCE OF DistributionPoint
   * DistributionPoint = SEQUENCE { distributionPointName [0] { fullName [0] { GeneralName } } }
   */
  function buildCdpHex(url: string): string {
    const urlBytes = Array.from(new TextEncoder().encode(url));
    // GeneralName URI: tag 0x86
    const uri = [0x86, urlBytes.length, ...urlBytes];
    // fullName [0] CONSTRUCTED = tag 0xa0
    const fullName = [0xa0, uri.length, ...uri];
    // distributionPointName [0] CONSTRUCTED = tag 0xa0
    const dpName = [0xa0, fullName.length, ...fullName];
    // DistributionPoint SEQUENCE
    const dp = [0x30, dpName.length, ...dpName];
    // CRLDistributionPoints SEQUENCE
    const seq = [0x30, dp.length, ...dp];
    return Array.from(seq).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  it("extracts CRL URL from CDP extension", () => {
    const hex = buildCdpHex("http://crl.example.com/ca.crl");
    const url = extractCrlUrl({ "2.5.29.31": hex });
    expect(url).toBe("http://crl.example.com/ca.crl");
  });

  it("returns null when CDP extension is missing", () => {
    expect(extractCrlUrl({})).toBeNull();
  });

  it("returns null for malformed hex", () => {
    expect(extractCrlUrl({ "2.5.29.31": "not-hex" })).toBeNull();
  });
});

describe("parseCrl", () => {
  /**
   * Build a minimal CRL DER for testing.
   * CertificateList = SEQUENCE { tbsCertList, sigAlgo, signature }
   * tbsCertList = SEQUENCE { sigAlgo, issuer, thisUpdate, nextUpdate?, revokedCerts? }
   */
  function buildMockCrl(revokedSerials: string[]): Uint8Array {
    // AlgorithmIdentifier (dummy)
    const algo = [0x30, 0x02, 0x05, 0x00];
    // Issuer Name (dummy)
    const issuer = [0x30, 0x02, 0x05, 0x00];

    // thisUpdate (UTCTime "250101000000Z")
    const utcTime = "250101000000Z";
    const utcBytes = Array.from(new TextEncoder().encode(utcTime));
    const thisUpdate = [0x17, utcBytes.length, ...utcBytes];

    // nextUpdate
    const nextUtcTime = "260101000000Z";
    const nextUtcBytes = Array.from(new TextEncoder().encode(nextUtcTime));
    const nextUpdate = [0x17, nextUtcBytes.length, ...nextUtcBytes];

    // Build revokedCertificates SEQUENCE OF
    const revokedEntries: number[] = [];
    for (const serialHex of revokedSerials) {
      const serialBytes: number[] = [];
      const clean = serialHex.length % 2 === 1 ? "0" + serialHex : serialHex;
      for (let i = 0; i < clean.length; i += 2) {
        serialBytes.push(parseInt(clean.substring(i, i + 2), 16));
      }
      const serialDer = [0x02, serialBytes.length, ...serialBytes];
      // revocationDate UTCTime (dummy)
      const revDate = [0x17, utcBytes.length, ...utcBytes];
      const entryContent = [...serialDer, ...revDate];
      revokedEntries.push(0x30, entryContent.length, ...entryContent);
    }

    let tbsContent = [...algo, ...issuer, ...thisUpdate, ...nextUpdate];
    if (revokedEntries.length > 0) {
      tbsContent.push(0x30, revokedEntries.length, ...revokedEntries);
    }

    const tbsCertList = [0x30, tbsContent.length, ...tbsContent];
    const sigAlgo = [0x30, 0x02, 0x05, 0x00];
    const sig = [0x03, 0x02, 0x00, 0xff];
    const crlContent = [...tbsCertList, ...sigAlgo, ...sig];
    const crl = [0x30, crlContent.length, ...crlContent];

    return new Uint8Array(crl);
  }

  it("detects a revoked serial in the CRL", () => {
    const crl = buildMockCrl(["0a", "0b", "0c"]);
    const result = parseCrl(crl, "0b");
    expect(result.revoked).toBe(true);
  });

  it("returns not revoked for a serial not in the CRL", () => {
    const crl = buildMockCrl(["0a", "0b", "0c"]);
    const result = parseCrl(crl, "0d");
    expect(result.revoked).toBe(false);
  });

  it("handles empty CRL (no revoked certificates)", () => {
    const crl = buildMockCrl([]);
    const result = parseCrl(crl, "01");
    expect(result.revoked).toBe(false);
  });

  it("normalizes serial hex for comparison (strips leading zeros)", () => {
    const crl = buildMockCrl(["00ab"]);
    const result = parseCrl(crl, "ab");
    expect(result.revoked).toBe(true);
  });

  it("parses thisUpdate and nextUpdate timestamps", () => {
    const crl = buildMockCrl([]);
    const result = parseCrl(crl, "01");
    expect(result.thisUpdate).toBe("2025-01-01T00:00:00Z");
    expect(result.nextUpdate).toBe("2026-01-01T00:00:00Z");
  });
});

describe("extractIssuerInfo", () => {
  it("extracts subject Name DER and SPKI from a PEM certificate", () => {
    const result = extractIssuerInfo(SAMPLE_PEM);
    // Both should be Uint8Arrays starting with SEQUENCE tag
    expect(result.issuerNameDer).toBeInstanceOf(Uint8Array);
    expect(result.issuerPublicKeyDer).toBeInstanceOf(Uint8Array);
    expect(result.issuerNameDer[0]).toBe(0x30);
    expect(result.issuerPublicKeyDer[0]).toBe(0x30);
    // Name should contain "Test Cert" (the subject CN of the self-signed cert)
    const nameStr = new TextDecoder().decode(result.issuerNameDer);
    expect(nameStr).toContain("Test Cert");
  });
});

describe("extractSubjectNameDer", () => {
  it("extracts the subject Name DER from a PEM certificate", () => {
    const result = extractSubjectNameDer(SAMPLE_PEM);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x30); // SEQUENCE
    const nameStr = new TextDecoder().decode(result);
    expect(nameStr).toContain("Test");
  });

  it("returns consistent results across multiple calls", () => {
    const a = extractSubjectNameDer(SAMPLE_PEM);
    const b = extractSubjectNameDer(SAMPLE_PEM);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
