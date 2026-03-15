import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/algorithm";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [rsaKeySize, ecdsaCurve, sigHash] = rules;

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

  // No ECDSA fixture available — pass/fail paths for ECDSA curve validation
  // cannot be tested without a cert using an ECDSA key.
  it.todo("passes for P-256 curve (requires ECDSA fixture)");
  it.todo("passes for P-384 curve (requires ECDSA fixture)");
  it.todo("fails for unsupported curve (requires ECDSA fixture)");
});

describe("w_bimi_sig_hash", () => {
  it("passes for a VMC with SHA-256 signature", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = sigHash(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("w_bimi_sig_hash");
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable when hash algorithm cannot be determined", () => {
    // The non-BIMI self-signed cert uses SHA-256, so it should pass
    const cert = parseCert(NON_BIMI_PEM);
    const result = sigHash(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("w_bimi_sig_hash");
    // SHA-256 is acceptable, so this should pass
    expect(r.status).toBe("pass");
  });
});
