import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/mark-type";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [markTypeValid, markTypeDnFields] = rules;

describe("e_bimi_mark_type_valid", () => {
  it("passes for a VMC with 'Registered Mark'", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = markTypeValid(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_mark_type_valid");
    expect(r.status).toBe("pass");
  });

  it("fails for a non-BIMI cert without mark type", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = markTypeValid(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("not found");
  });
});

describe("e_bimi_mark_type_dn_fields", () => {
  it("checks required trademark DN fields for Registered Mark", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = markTypeDnFields(cert, BIMI_VMC_PEM);
    expect(result).not.toBeNull();
    const results = Array.isArray(result) ? result : [result!];
    // CNN VMC is "Registered Mark" — should check 3 trademark fields
    expect(results.length).toBe(3);
    // Country and Registration ID should pass; Office may or may not be present
    const country = results.find((r) => r.title.includes("Country"));
    const regId = results.find((r) => r.title.includes("Registration ID"));
    expect(country?.status).toBe("pass");
    expect(regId?.status).toBe("pass");
  });

  it("returns not_applicable for non-BIMI cert", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = markTypeDnFields(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});
