import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/algorithm";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [rsaKeySize, ecdsaCurve] = rules;

describe("w_bimi_rsa_key_size", () => {
  it("passes for a VMC with 2048-bit RSA key", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = rsaKeySize(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("w_bimi_rsa_key_size");
    expect(r.status).toBe("pass");
  });

  it("fails for a 512-bit RSA key", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = rsaKeySize(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("512");
  });
});

describe("w_bimi_ecdsa_curve", () => {
  it("returns not_applicable for RSA certs", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = ecdsaCurve(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});
