import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/policy";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [generalPolicy, cpsUrlPresent, caPolicyOid] = rules;

describe("e_bimi_general_policy", () => {
  it("passes for a VMC with BIMI general policy OID", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = generalPolicy(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_general_policy");
    expect(r.status).toBe("pass");
  });

  it("fails for a non-BIMI cert", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = generalPolicy(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
  });
});

describe("e_bimi_cps_url_present", () => {
  it("passes for a VMC with CPS URL", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = cpsUrlPresent(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_cps_url_present");
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable for a cert without policies", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = cpsUrlPresent(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});

describe("w_bimi_ca_policy_oid", () => {
  it("passes for a DigiCert VMC", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = caPolicyOid(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("w_bimi_ca_policy_oid");
    expect(r.status).toBe("pass");
    expect(r.detail).toContain("DigiCert");
  });
});
