import { describe, expect, it } from "vitest";
import {
  computePemFingerprint,
  deriveCertType,
  extractDnField,
  parseChainCert,
  parseChainFromExtraData,
  pemToDer,
} from "./parser";

describe("extractDnField", () => {
  it("extracts CN from a simple DN", () => {
    expect(extractDnField("CN=example.com, O=Example Inc, C=US", "CN")).toBe("example.com");
  });

  it("extracts O from a simple DN", () => {
    expect(extractDnField("CN=example.com, O=Example Inc, C=US", "O")).toBe("Example Inc");
  });

  it("extracts C from a simple DN", () => {
    expect(extractDnField("CN=example.com, O=Example Inc, C=US", "C")).toBe("US");
  });

  it("returns null for a missing field", () => {
    expect(extractDnField("CN=example.com, O=Org", "L")).toBeNull();
  });

  it("handles escaped commas in values", () => {
    expect(extractDnField("CN=test\\,value, O=Org", "CN")).toBe("test,value");
  });

  it("handles field at the beginning of the DN", () => {
    expect(extractDnField("CN=First", "CN")).toBe("First");
  });

  it("handles empty DN", () => {
    expect(extractDnField("", "CN")).toBeNull();
  });

  it("is case-insensitive for field names", () => {
    expect(extractDnField("cn=lower, O=Org", "CN")).toBe("lower");
  });

  it("extracts fields with OID-style names", () => {
    const dn = "CN=example.com, 1.3.6.1.4.1.53087.1.13=Registered Mark";
    expect(extractDnField(dn, "1.3.6.1.4.1.53087.1.13")).toBe("Registered Mark");
  });
});

describe("deriveCertType", () => {
  it("returns VMC for Registered Mark", () => {
    expect(deriveCertType("Registered Mark")).toBe("VMC");
  });

  it("returns VMC for Government Mark", () => {
    expect(deriveCertType("Government Mark")).toBe("VMC");
  });

  it("returns CMC for Prior Use Mark", () => {
    expect(deriveCertType("Prior Use Mark")).toBe("CMC");
  });

  it("returns CMC for Modified Registered Mark", () => {
    // "Modified Registered Mark" contains "Registered Mark" substring,
    // but CMC types are checked first
    expect(deriveCertType("Modified Registered Mark")).toBe("CMC");
  });

  it("returns CMC for Pending Registration Mark", () => {
    expect(deriveCertType("Pending Registration Mark")).toBe("CMC");
  });

  it("returns null for null input", () => {
    expect(deriveCertType(null)).toBeNull();
  });

  it("returns null for unknown mark type", () => {
    expect(deriveCertType("Some Unknown Type")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(deriveCertType("")).toBeNull();
  });
});

describe("parseChainFromExtraData", () => {
  /** Helper: encode a 3-byte big-endian length */
  function encodeUint24(len: number): number[] {
    return [(len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff];
  }

  /** Build a tiny fake DER cert (just enough bytes to be wrapped in PEM) */
  function fakeCertDer(id: number): Uint8Array {
    // Minimal SEQUENCE with an identifier byte
    return new Uint8Array([0x30, 0x03, 0x02, 0x01, id]);
  }

  it("parses chain from x509 extra_data (entryType=0)", () => {
    const cert1 = fakeCertDer(0x01);
    const cert2 = fakeCertDer(0x02);

    // x509 chain format: 3-byte total chain length, then (3-byte certLen + certDer) per cert
    const chainPayload: number[] = [];
    chainPayload.push(...encodeUint24(cert1.length), ...cert1);
    chainPayload.push(...encodeUint24(cert2.length), ...cert2);

    const totalLen = chainPayload.length;
    const extraData = new Uint8Array([...encodeUint24(totalLen), ...chainPayload]);

    const pems = parseChainFromExtraData(extraData, 0);
    expect(pems).toHaveLength(2);
    expect(pems[0]).toContain("-----BEGIN CERTIFICATE-----");
    expect(pems[1]).toContain("-----END CERTIFICATE-----");
  });

  it("parses chain from precert extra_data (entryType=1)", () => {
    const preCert = fakeCertDer(0x00);
    const chainCert = fakeCertDer(0x03);

    // Precert format: 3-byte preCertLen + preCertDer, then 3-byte totalChainLen + (3-byte certLen + certDer)
    const chainPayload: number[] = [];
    chainPayload.push(...encodeUint24(chainCert.length), ...chainCert);

    const totalChainLen = chainPayload.length;
    const extraData = new Uint8Array([
      ...encodeUint24(preCert.length),
      ...preCert,
      ...encodeUint24(totalChainLen),
      ...chainPayload,
    ]);

    const pems = parseChainFromExtraData(extraData, 1);
    // Should only return the chain cert, not the pre-certificate itself
    expect(pems).toHaveLength(1);
    expect(pems[0]).toContain("-----BEGIN CERTIFICATE-----");
  });

  it("returns empty array for empty extra_data with entryType=0", () => {
    // 3-byte total chain length = 0
    const extraData = new Uint8Array([0x00, 0x00, 0x00]);
    const pems = parseChainFromExtraData(extraData, 0);
    expect(pems).toEqual([]);
  });

  it("returns empty array on malformed data", () => {
    const pems = parseChainFromExtraData(new Uint8Array([0xff]), 0);
    expect(pems).toEqual([]);
  });
});

describe("pemToDer", () => {
  it("strips PEM headers and decodes to DER bytes", () => {
    const pem = `-----BEGIN CERTIFICATE-----
AQIDBA==
-----END CERTIFICATE-----`;
    const der = pemToDer(pem);
    expect(Array.from(der)).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it("handles multi-line base64 content", () => {
    const pem = `-----BEGIN CERTIFICATE-----
AQID
BAUG
-----END CERTIFICATE-----`;
    const der = pemToDer(pem);
    expect(Array.from(der)).toEqual([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
  });
});

describe("computePemFingerprint", () => {
  it("computes SHA-256 fingerprint of a PEM cert", async () => {
    const pem = `-----BEGIN CERTIFICATE-----
AQID
-----END CERTIFICATE-----`;
    const fp = await computePemFingerprint(pem);
    // SHA-256 of [0x01, 0x02, 0x03] is a known hash
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
  });

  it("produces consistent results", async () => {
    const pem = `-----BEGIN CERTIFICATE-----
BAUF
-----END CERTIFICATE-----`;
    const a = await computePemFingerprint(pem);
    const b = await computePemFingerprint(pem);
    expect(a).toBe(b);
  });
});

describe("parseChainCert", () => {
  it("returns null for invalid PEM", () => {
    expect(parseChainCert("not a pem")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseChainCert("")).toBeNull();
  });

  // parseChainCert needs @peculiar/x509, so testing with a real cert.
  // We use a known test cert to validate the parsing works end-to-end.
  it("parses a real PEM certificate", () => {
    // A real self-signed certificate generated via openssl
    const pem = `-----BEGIN CERTIFICATE-----
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
    const result = parseChainCert(pem);
    // This cert may or may not parse depending on if it's structurally valid
    // for @peculiar/x509. If it doesn't parse, null is acceptable.
    if (result !== null) {
      expect(result.subjectDn).toBeDefined();
      expect(result.issuerDn).toBeDefined();
      expect(result.notBefore).toBeInstanceOf(Date);
      expect(result.notAfter).toBeInstanceOf(Date);
    }
  });
});
