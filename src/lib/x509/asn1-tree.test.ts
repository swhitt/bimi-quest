import { describe, expect, it } from "vitest";
import { buildAsn1Tree, pemToDerBytes } from "./asn1-tree";

// ── Helper: build DER bytes from a hex string ───────────────────────

function hex(s: string): Uint8Array {
  const clean = s.replace(/\s/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── 1. Small DER structure ──────────────────────────────────────────

describe("buildAsn1Tree — small DER structure", () => {
  // BasicConstraints value: SEQUENCE { BOOLEAN TRUE, INTEGER 2 }
  // 30 06 01 01 FF 02 01 02
  const der = hex("30 06 01 01 FF 02 01 02");

  it("parses root as SEQUENCE with 2 children", () => {
    const root = buildAsn1Tree(der);
    expect(root.tagName).toBe("SEQUENCE");
    expect(root.constructed).toBe(true);
    expect(root.children).toHaveLength(2);
  });

  it("first child is BOOLEAN TRUE", () => {
    const root = buildAsn1Tree(der);
    const bool = root.children[0];
    expect(bool.tagName).toBe("BOOLEAN");
    expect(bool.decoded).toBe("TRUE");
  });

  it("second child is INTEGER 2", () => {
    const root = buildAsn1Tree(der);
    const int = root.children[1];
    expect(int.tagName).toBe("INTEGER");
    expect(int.decoded).toContain("2");
  });

  it("has correct offsets", () => {
    const root = buildAsn1Tree(der);
    // Root SEQUENCE: tag at 0, length at 1, value starts at 2
    expect(root.headerOffset).toBe(0);
    expect(root.headerLength).toBe(2);
    expect(root.valueOffset).toBe(2);
    expect(root.valueLength).toBe(6);
    expect(root.totalLength).toBe(8);

    // BOOLEAN: starts at offset 2 in the original buffer
    const bool = root.children[0];
    expect(bool.headerOffset).toBe(2);
    expect(bool.headerLength).toBe(2);
    expect(bool.valueOffset).toBe(4);
    expect(bool.valueLength).toBe(1);
    expect(bool.totalLength).toBe(3);

    // INTEGER: starts at offset 5
    const int = root.children[1];
    expect(int.headerOffset).toBe(5);
    expect(int.valueOffset).toBe(7);
  });
});

// ── 2. OID decoding ─────────────────────────────────────────────────

describe("buildAsn1Tree — OID decoding", () => {
  it("decodes OID 2.5.29.19 and resolves name", () => {
    // OID 2.5.29.19: encoded as 55 1d 13
    // Full TLV: 06 03 55 1d 13
    const der = hex("06 03 55 1d 13");
    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("OBJECT IDENTIFIER");
    expect(node.decoded).toBe("2.5.29.19");
    expect(node.oidName).toBe("Basic Constraints");
  });

  it("returns null oidName for unknown OIDs", () => {
    // OID 1.2.3.4: encoded as 2a 03 04
    const der = hex("06 03 2a 03 04");
    const node = buildAsn1Tree(der);
    expect(node.decoded).toBe("1.2.3.4");
    expect(node.oidName).toBeNull();
  });
});

// ── 3. OCTET STRING auto-drill ──────────────────────────────────────

describe("buildAsn1Tree — OCTET STRING auto-drill", () => {
  it("auto-drills into OCTET STRING containing valid DER", () => {
    // Wrap BasicConstraints SEQUENCE inside OCTET STRING:
    // 04 08 30 06 01 01 FF 02 01 02
    const der = hex("04 08 30 06 01 01 FF 02 01 02");
    const node = buildAsn1Tree(der);

    expect(node.tagName).toBe("OCTET STRING");
    // Should have auto-drilled to find the SEQUENCE inside
    expect(node.children).toHaveLength(1);
    expect(node.children[0].tagName).toBe("SEQUENCE");
    expect(node.children[0].children).toHaveLength(2);
    expect(node.children[0].children[0].tagName).toBe("BOOLEAN");
  });

  it("does not auto-drill random bytes", () => {
    // OCTET STRING with bytes that don't form valid DER
    const der = hex("04 04 DE AD BE EF");
    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("OCTET STRING");
    expect(node.children).toHaveLength(0);
    expect(node.decoded).toBe("deadbeef");
  });
});

// ── 4. pemToDerBytes format detection ───────────────────────────────

describe("pemToDerBytes", () => {
  // Use a known small DER: SEQUENCE { NULL } = 30 02 05 00
  const expectedBytes = [0x30, 0x02, 0x05, 0x00];
  const expectedB64 = btoa(String.fromCharCode(...expectedBytes));

  it("decodes PEM with BEGIN/END headers", () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${expectedB64}\n-----END CERTIFICATE-----`;
    const result = pemToDerBytes(pem);
    expect(Array.from(result)).toEqual(expectedBytes);
  });

  it("decodes raw base64 (no headers)", () => {
    // Need length > 10 for base64 detection — use a larger payload
    // SEQUENCE { BOOLEAN TRUE, INTEGER 2, NULL } = 30 08 01 01 FF 02 01 02 05 00
    const largerDer = hex("30 08 01 01 FF 02 01 02 05 00");
    const b64 = btoa(String.fromCharCode(...largerDer));
    expect(b64.length).toBeGreaterThan(10);
    const result = pemToDerBytes(b64);
    expect(Array.from(result)).toEqual(Array.from(largerDer));
  });

  it("decodes hex with spaces", () => {
    const result = pemToDerBytes("30 02 05 00");
    expect(Array.from(result)).toEqual(expectedBytes);
  });

  it("decodes hex with colons", () => {
    const result = pemToDerBytes("30:02:05:00");
    expect(Array.from(result)).toEqual(expectedBytes);
  });

  it("decodes hex without separators", () => {
    const result = pemToDerBytes("30020500");
    expect(Array.from(result)).toEqual(expectedBytes);
  });

  it("all formats produce the same bytes for a larger input", () => {
    const derBytes = hex("30 06 01 01 FF 02 01 02");
    const b64 = btoa(String.fromCharCode(...derBytes));
    const pemStr = `-----BEGIN TEST-----\n${b64}\n-----END TEST-----`;
    const hexStr = "30:06:01:01:FF:02:01:02";

    const fromPem = pemToDerBytes(pemStr);
    const fromB64 = pemToDerBytes(b64);
    const fromHex = pemToDerBytes(hexStr);

    expect(Array.from(fromPem)).toEqual(Array.from(derBytes));
    expect(Array.from(fromB64)).toEqual(Array.from(derBytes));
    expect(Array.from(fromHex)).toEqual(Array.from(derBytes));
  });

  it("throws on unrecognized input", () => {
    expect(() => pemToDerBytes("!!!not valid!!!")).toThrow("Unrecognized input format");
  });
});

// ── 5. Tag class detection ──────────────────────────────────────────

describe("buildAsn1Tree — tag class detection", () => {
  it("identifies context-tagged constructed nodes", () => {
    // 0xA0 = context class (10), constructed (1), tag number 0 (00000)
    // Wrap a NULL inside: A0 02 05 00
    const der = hex("A0 02 05 00");
    const node = buildAsn1Tree(der);
    expect(node.tagClass).toBe("context");
    expect(node.constructed).toBe(true);
    expect(node.tagName).toBe("[0] EXPLICIT");
    expect(node.children).toHaveLength(1);
    expect(node.children[0].tagName).toBe("NULL");
  });

  it("identifies context-tagged primitive nodes", () => {
    // 0x80 = context class (10), primitive (0), tag number 0 (00000)
    // Primitive context [0] with 1 byte value: 80 01 FF
    const der = hex("80 01 FF");
    const node = buildAsn1Tree(der);
    expect(node.tagClass).toBe("context");
    expect(node.constructed).toBe(false);
    expect(node.tagName).toBe("[0] IMPLICIT");
  });

  it("identifies application-tagged nodes", () => {
    // 0x61 = application class (01), constructed (1), tag number 1
    const der = hex("61 02 05 00");
    const node = buildAsn1Tree(der);
    expect(node.tagClass).toBe("application");
    expect(node.tagName).toBe("APPLICATION [1]");
  });

  it("identifies private-tagged nodes", () => {
    // 0xC1 = private class (11), constructed (0), tag number 1
    const der = hex("C1 01 AA");
    const node = buildAsn1Tree(der);
    expect(node.tagClass).toBe("private");
    expect(node.tagName).toBe("PRIVATE [1]");
  });
});

// ── 6. Integer decoding ─────────────────────────────────────────────

describe("buildAsn1Tree — integer decoding", () => {
  it("shows decimal for small integers", () => {
    // INTEGER 42: 02 01 2A
    const der = hex("02 01 2A");
    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("INTEGER");
    expect(node.decoded).toContain("42");
    expect(node.decoded).toContain("0x");
  });

  it("shows hex with colons for large integers (serial numbers)", () => {
    // 20-byte integer (like a certificate serial number)
    const serialHex = "01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14";
    const der = hex("02 14 " + serialHex);
    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("INTEGER");
    // Should be colon-separated hex, not decimal
    expect(node.decoded).toContain(":");
    expect(node.decoded).toContain("01:02:03");
    // Should NOT contain a BigInt decimal representation
    expect(node.decoded).not.toContain("(0x");
  });
});

// ── 7. Time decoding ────────────────────────────────────────────────

describe("buildAsn1Tree — time decoding", () => {
  it("decodes UTCTime to ISO 8601", () => {
    // UTCTime "231215120000Z" = tag 0x17, length 13
    const timeStr = "231215120000Z";
    const timeBytes = Array.from(new TextEncoder().encode(timeStr));
    const tlv = [0x17, timeBytes.length, ...timeBytes];
    const der = new Uint8Array(tlv);

    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("UTCTime");
    expect(node.decoded).toBe("2023-12-15T12:00:00Z");
  });

  it("decodes GeneralizedTime to ISO 8601", () => {
    // GeneralizedTime "20231215120000Z" = tag 0x18, length 15
    const timeStr = "20231215120000Z";
    const timeBytes = Array.from(new TextEncoder().encode(timeStr));
    const tlv = [0x18, timeBytes.length, ...timeBytes];
    const der = new Uint8Array(tlv);

    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("GeneralizedTime");
    expect(node.decoded).toBe("2023-12-15T12:00:00Z");
  });

  it("handles UTCTime with year >= 50 as 19xx", () => {
    const timeStr = "991231235959Z";
    const timeBytes = Array.from(new TextEncoder().encode(timeStr));
    const tlv = [0x17, timeBytes.length, ...timeBytes];
    const der = new Uint8Array(tlv);

    const node = buildAsn1Tree(der);
    expect(node.decoded).toBe("1999-12-31T23:59:59Z");
  });
});

// ── 8. Edge cases ───────────────────────────────────────────────────

describe("buildAsn1Tree — edge cases", () => {
  it("throws on empty input", () => {
    expect(() => buildAsn1Tree(new Uint8Array(0))).toThrow("Empty DER input");
  });

  it("parses NULL correctly", () => {
    const der = hex("05 00");
    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("NULL");
    expect(node.decoded).toBe("(null)");
    expect(node.valueLength).toBe(0);
  });

  it("parses BIT STRING with unused bits", () => {
    // BIT STRING: 03 03 04 AB CD (4 unused bits)
    const der = hex("03 03 04 AB CD");
    const node = buildAsn1Tree(der);
    expect(node.tagName).toBe("BIT STRING");
    expect(node.decoded).toContain("unused bits: 4");
    expect(node.decoded).toContain("abcd");
  });

  it("parses a real certificate PEM via pemToDerBytes + buildAsn1Tree", () => {
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
    const der = pemToDerBytes(pem);
    const root = buildAsn1Tree(der);

    // A certificate is a SEQUENCE of 3 elements: tbsCertificate, signatureAlgorithm, signatureValue
    expect(root.tagName).toBe("SEQUENCE");
    expect(root.children).toHaveLength(3);

    // tbsCertificate is a SEQUENCE
    expect(root.children[0].tagName).toBe("SEQUENCE");
    // signatureAlgorithm is a SEQUENCE
    expect(root.children[1].tagName).toBe("SEQUENCE");
    // signatureValue is a BIT STRING
    expect(root.children[2].tagName).toBe("BIT STRING");
  });
});
