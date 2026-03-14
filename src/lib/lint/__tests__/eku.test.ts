import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/eku";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [ekuPresent, ekuSingle] = rules;

describe("e_bimi_eku_present", () => {
  it("passes for a valid VMC with BIMI EKU", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = ekuPresent(cert, BIMI_VMC_PEM);
    expect(result).not.toBeNull();
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_eku_present");
    expect(r.status).toBe("pass");
  });

  it("fails for a non-BIMI cert", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = ekuPresent(cert, NON_BIMI_PEM);
    expect(result).not.toBeNull();
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("1.3.6.1.5.5.7.3.31");
  });
});

describe("e_bimi_eku_single", () => {
  it("passes when BIMI is the only EKU", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = ekuSingle(cert, BIMI_VMC_PEM);
    expect(result).not.toBeNull();
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_eku_single");
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable for a cert without EKU", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = ekuSingle(cert, NON_BIMI_PEM);
    expect(result).not.toBeNull();
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});
