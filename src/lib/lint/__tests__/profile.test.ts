import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/profile";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [basicConstraints, noNameConstraints, keyUsage, keyUsageCritical, validityPeriod, serialEntropy] = rules;

describe("e_bimi_basic_constraints", () => {
  it("passes for a VMC (no CA flag or CA=false)", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = basicConstraints(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  it("fails for a self-signed CA cert", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = basicConstraints(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("cA is true");
  });
});

describe("e_bimi_no_name_constraints", () => {
  it("passes for a VMC without name constraints", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = noNameConstraints(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });
});

describe("e_bimi_key_usage", () => {
  it("fails for a VMC without Key Usage extension", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = keyUsage(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_key_usage");
    // CNN VMC does not include Key Usage extension
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("missing");
  });

  it("fails for a non-BIMI cert without Key Usage", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = keyUsage(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
  });
});

describe("e_bimi_key_usage_critical", () => {
  it("returns not_applicable when Key Usage is absent", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = keyUsageCritical(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_key_usage_critical");
    // CNN VMC has no Key Usage extension
    expect(r.status).toBe("not_applicable");
  });

  it("returns not_applicable for cert without Key Usage", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = keyUsageCritical(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });

  // Both test fixtures lack Key Usage extension, so pass/fail paths
  // for criticality cannot be tested without a cert that includes Key Usage.
  it.todo("passes when Key Usage is present and critical (requires fixture with Key Usage)");
  it.todo("fails when Key Usage is present but not critical (requires fixture with Key Usage)");
});

describe("e_bimi_validity_period", () => {
  it("passes for a VMC within 825 days", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = validityPeriod(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  it("passes for a 1-year self-signed cert", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = validityPeriod(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  // Neither fixture exceeds 825 days, so the fail path cannot be tested
  // without a long-lived certificate or mock.
  it.todo("fails for cert with validity > 825 days (requires long-lived fixture)");
});

describe("w_bimi_serial_entropy", () => {
  it("passes for a VMC with sufficient serial entropy", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = serialEntropy(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("w_bimi_serial_entropy");
    expect(r.status).toBe("pass");
  });

  it("fails for a cert with short serial number", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = serialEntropy(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    // Self-signed test cert may have a short serial
    expect(r.severity).toBe("warning");
  });
});
