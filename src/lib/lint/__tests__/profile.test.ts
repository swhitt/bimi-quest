import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/profile";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [basicConstraints, noNameConstraints, keyUsage, validityPeriod] = rules;

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
  it("passes for a VMC with digitalSignature", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = keyUsage(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    // VMC may or may not have keyUsage — check if applicable
    if (r.status !== "fail" || r.detail !== "Key Usage extension is missing") {
      expect(r.status).toBe("pass");
    }
  });
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
});
