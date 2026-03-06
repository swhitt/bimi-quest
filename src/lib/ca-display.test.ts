import { describe, expect, it } from "vitest";
import { displayIntermediateCa, displayIntermediateWithRoot, displayRootCa, normalizeIssuerOrg } from "./ca-display";

describe("displayRootCa", () => {
  it("maps 'DigiCert, Inc.' to 'DigiCert'", () => {
    expect(displayRootCa("DigiCert, Inc.")).toBe("DigiCert");
  });

  it("maps 'Entrust, Inc.' to 'Entrust'", () => {
    expect(displayRootCa("Entrust, Inc.")).toBe("Entrust");
  });

  it("maps 'GlobalSign nv-sa' to 'GlobalSign'", () => {
    expect(displayRootCa("GlobalSign nv-sa")).toBe("GlobalSign");
  });

  it("maps 'SSL Corporation' to 'SSL.com'", () => {
    expect(displayRootCa("SSL Corporation")).toBe("SSL.com");
  });

  it("returns 'Unknown' for null", () => {
    expect(displayRootCa(null)).toBe("Unknown");
  });

  it("passes through unknown values as-is", () => {
    expect(displayRootCa("Some New CA")).toBe("Some New CA");
  });
});

describe("displayIntermediateCa", () => {
  it("maps 'Sectigo Limited' to 'Sectigo'", () => {
    expect(displayIntermediateCa("Sectigo Limited")).toBe("Sectigo");
  });

  it("maps 'DigiCert, Inc.' to 'DigiCert'", () => {
    expect(displayIntermediateCa("DigiCert, Inc.")).toBe("DigiCert");
  });

  it("returns 'Unknown' for null", () => {
    expect(displayIntermediateCa(null)).toBe("Unknown");
  });

  it("passes through unknown values", () => {
    expect(displayIntermediateCa("Acme Corp")).toBe("Acme Corp");
  });
});

describe("displayIntermediateWithRoot", () => {
  it("returns just intermediate when root matches", () => {
    expect(displayIntermediateWithRoot("DigiCert, Inc.", "DigiCert, Inc.")).toBe("DigiCert");
  });

  it("returns 'Sectigo (via SSL.com)' when they differ", () => {
    expect(displayIntermediateWithRoot("Sectigo Limited", "SSL Corporation")).toBe("Sectigo (via SSL.com)");
  });

  it("returns just intermediate when rootCaOrg is null", () => {
    expect(displayIntermediateWithRoot("DigiCert, Inc.", null)).toBe("DigiCert");
  });
});

describe("normalizeIssuerOrg", () => {
  it("normalizes 'DigiCert, Inc.' to 'DigiCert'", () => {
    expect(normalizeIssuerOrg("DigiCert, Inc.")).toBe("DigiCert");
  });

  it("normalizes 'DigiCert\\, Inc.' to 'DigiCert'", () => {
    expect(normalizeIssuerOrg("DigiCert\\, Inc.")).toBe("DigiCert");
  });

  it("normalizes 'Entrust, Inc.' to 'Entrust'", () => {
    expect(normalizeIssuerOrg("Entrust, Inc.")).toBe("Entrust");
  });

  it("normalizes 'GlobalSign NV-SA' to 'GlobalSign nv-sa'", () => {
    expect(normalizeIssuerOrg("GlobalSign NV-SA")).toBe("GlobalSign nv-sa");
  });

  it("returns null for null", () => {
    expect(normalizeIssuerOrg(null)).toBeNull();
  });

  it("trims trailing backslash", () => {
    expect(normalizeIssuerOrg("Some CA\\")).toBe("Some CA");
  });

  it("passes through unknown values", () => {
    expect(normalizeIssuerOrg("Acme Corp")).toBe("Acme Corp");
  });
});
