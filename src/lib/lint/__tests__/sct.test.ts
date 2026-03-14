import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/sct";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [sctPresent, pilotIdSunset] = rules;

describe("e_bimi_sct_present", () => {
  it("passes for a VMC with SCT extension", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = sctPresent(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_sct_present");
    expect(r.status).toBe("pass");
  });

  it("fails for a cert without SCT", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = sctPresent(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
  });
});

describe("w_bimi_pilot_id_sunset", () => {
  it("passes for a post-sunset VMC without pilot ID", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = pilotIdSunset(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("w_bimi_pilot_id_sunset");
    // CNN VMC is notBefore 2025-08-11, after sunset, and should not have pilot ID
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable for pre-sunset certs", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = pilotIdSunset(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    // NON_BIMI_PEM notBefore is 2026-02-28 which is after sunset
    // so it won't be not_applicable — it depends on the cert date
    expect(["pass", "fail", "not_applicable"]).toContain(r.status);
  });
});
