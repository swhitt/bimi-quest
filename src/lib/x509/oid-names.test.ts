import { describe, expect, it } from "vitest";
import {
  OID_NAMES,
  OID_DISPLAY_NAMES,
  BIMI_SUBJECT_OIDS,
  EV_SUBJECT_OIDS,
  resolveOidName,
  resolveOidDisplayName,
} from "./oid-names";

// ── Map integrity ───────────────────────────────────────────────────

describe("OID_NAMES integrity", () => {
  it("has no empty keys", () => {
    for (const oid of Object.keys(OID_NAMES)) {
      expect(oid.length).toBeGreaterThan(0);
    }
  });

  it("has no empty values", () => {
    for (const [oid, name] of Object.entries(OID_NAMES)) {
      expect(name.trim().length, `OID ${oid} has empty name`).toBeGreaterThan(0);
    }
  });

  it("all keys are valid dotted OID format", () => {
    const oidPattern = /^\d+(\.\d+)+$/;
    for (const oid of Object.keys(OID_NAMES)) {
      expect(oid, `"${oid}" is not a valid dotted OID`).toMatch(oidPattern);
    }
  });
});

describe("OID_DISPLAY_NAMES integrity", () => {
  it("every verbose entry has a corresponding OID_NAMES entry", () => {
    for (const oid of Object.keys(OID_DISPLAY_NAMES)) {
      expect(OID_NAMES[oid], `OID_DISPLAY_NAMES has ${oid} but OID_NAMES does not`).toBeDefined();
    }
  });

  it("verbose name differs from compact name (otherwise redundant)", () => {
    for (const [oid, verbose] of Object.entries(OID_DISPLAY_NAMES)) {
      expect(verbose, `OID_DISPLAY_NAMES[${oid}] is identical to OID_NAMES[${oid}]`).not.toBe(OID_NAMES[oid]);
    }
  });
});

// ── Subject OID arrays ──────────────────────────────────────────────

describe("BIMI_SUBJECT_OIDS", () => {
  it("all entries exist in OID_NAMES", () => {
    for (const oid of BIMI_SUBJECT_OIDS) {
      expect(OID_NAMES[oid], `BIMI_SUBJECT_OIDS entry ${oid} missing from OID_NAMES`).toBeDefined();
    }
  });

  it("all entries are under the BIMI Group PEN (53087)", () => {
    for (const oid of BIMI_SUBJECT_OIDS) {
      expect(oid, `${oid} is not under BIMI PEN`).toContain("1.3.6.1.4.1.53087.");
    }
  });

  it("has no duplicates", () => {
    const unique = new Set(BIMI_SUBJECT_OIDS);
    expect(unique.size).toBe(BIMI_SUBJECT_OIDS.length);
  });
});

describe("EV_SUBJECT_OIDS", () => {
  it("all entries exist in OID_NAMES", () => {
    for (const oid of EV_SUBJECT_OIDS) {
      expect(OID_NAMES[oid], `EV_SUBJECT_OIDS entry ${oid} missing from OID_NAMES`).toBeDefined();
    }
  });

  it("has no duplicates", () => {
    const unique = new Set(EV_SUBJECT_OIDS);
    expect(unique.size).toBe(EV_SUBJECT_OIDS.length);
  });

  it("does not overlap with BIMI_SUBJECT_OIDS", () => {
    const bimiSet = new Set<string>(BIMI_SUBJECT_OIDS);
    for (const oid of EV_SUBJECT_OIDS) {
      expect(bimiSet.has(oid), `${oid} appears in both arrays`).toBe(false);
    }
  });
});

// ── Resolution helpers ──────────────────────────────────────────────

describe("resolveOidName", () => {
  it("returns compact name for known OIDs", () => {
    expect(resolveOidName("2.5.29.19")).toBe("Basic Constraints");
    expect(resolveOidName("1.3.6.1.5.5.7.3.31")).toBe("BIMI");
    expect(resolveOidName("1.3.6.1.4.1.53087.1.13")).toBe("BIMI Mark Type");
  });

  it("returns raw OID for unknown entries", () => {
    expect(resolveOidName("1.2.3.4.5.6.7")).toBe("1.2.3.4.5.6.7");
  });
});

describe("resolveOidDisplayName", () => {
  it("returns verbose name when available", () => {
    expect(resolveOidDisplayName("1.3.6.1.5.5.7.3.31")).toBe("Brand Indicator for Message Identification (BIMI)");
    expect(resolveOidDisplayName("1.3.6.1.5.5.7.3.1")).toBe("TLS Server Authentication");
  });

  it("falls back to compact name when no verbose override", () => {
    expect(resolveOidDisplayName("2.5.29.19")).toBe("Basic Constraints");
    expect(resolveOidDisplayName("1.3.6.1.4.1.53087.1.13")).toBe("BIMI Mark Type");
  });

  it("falls back to raw OID when completely unknown", () => {
    expect(resolveOidDisplayName("9.9.9.9")).toBe("9.9.9.9");
  });
});

// ── Key OIDs are present ────────────────────────────────────────────

describe("expected OIDs are mapped", () => {
  const expectedOids: [string, RegExp][] = [
    // X.509 extensions
    ["2.5.29.14", /Subject Key Identifier/],
    ["2.5.29.15", /Key Usage/],
    ["2.5.29.17", /Subject Alternative Name/],
    ["2.5.29.19", /Basic Constraints/],
    ["2.5.29.31", /CRL Distribution Points/],
    ["2.5.29.32", /Certificate Policies/],
    ["2.5.29.35", /Authority Key Identifier/],
    ["2.5.29.37", /Extended Key Usage/],
    ["1.3.6.1.5.5.7.1.1", /Authority Information Access/],
    ["1.3.6.1.5.5.7.1.12", /Logotype.*BIMI/],

    // CT
    ["1.3.6.1.4.1.11129.2.4.2", /CT Precert SCTs/],
    ["1.3.6.1.4.1.11129.2.4.3", /CT Precert Poison/],

    // BIMI EKU
    ["1.3.6.1.5.5.7.3.31", /BIMI/],

    // BIMI Group
    ["1.3.6.1.4.1.53087.1.1", /BIMI General Policy/],
    ["1.3.6.1.4.1.53087.1.13", /BIMI Mark Type/],
    ["1.3.6.1.4.1.53087.3.5", /BIMI Statute Citation/],
    ["1.3.6.1.4.1.53087.3.6", /BIMI Statute URL/],
    ["1.3.6.1.4.1.53087.4.1", /BIMI Pilot/],
    ["1.3.6.1.4.1.53087.5.1", /BIMI Prior Use/],

    // CA policies
    ["2.16.840.1.114412.0.2.5", /DigiCert VMC/],
    ["2.16.840.1.114028.10.1.100", /Entrust VMC/],
    ["1.3.6.1.4.1.4146.1.95", /GlobalSign VMC/],

    // EV jurisdiction
    ["1.3.6.1.4.1.311.60.2.1.3", /Jurisdiction Country/],

    // Hash algorithms
    ["2.16.840.1.101.3.4.2.1", /SHA-256/],
    ["1.3.14.3.2.26", /SHA-1/],

    // Signature algorithms
    ["1.2.840.113549.1.1.11", /SHA-256 with RSA/],
    ["1.2.840.10045.4.3.2", /ECDSA with SHA-256/],
  ];

  for (const [oid, pattern] of expectedOids) {
    it(`maps ${oid} → ${pattern.source}`, () => {
      expect(OID_NAMES[oid]).toBeDefined();
      expect(OID_NAMES[oid]).toMatch(pattern);
    });
  }
});
