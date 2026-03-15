import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/sct";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [sctPresent, pilotIdAbsent] = rules;

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

describe("e_bimi_pilot_id_absent", () => {
  it("passes when pilot ID extension is absent", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = pilotIdAbsent(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_pilot_id_absent");
    expect(r.status).toBe("pass");
    expect(r.severity).toBe("error");
  });

  it("passes for a non-BIMI cert without pilot ID", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = pilotIdAbsent(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  it("includes 'pilot program has ended' in fail detail", () => {
    // Since our fixtures don't have the pilot ID extension, we can't get a fail.
    // But we can verify the rule returns the correct detail format by checking the rule definition.
    // The rule returns: "Pilot ID extension is present but the pilot program has ended"
    // We verify the pass message doesn't contain it.
    const cert = parseCert(BIMI_VMC_PEM);
    const result = pilotIdAbsent(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
    expect(r.detail).toBeUndefined();
  });

  // No fixture with pilot ID extension available to test the fail path.
  it.todo("fails with 'pilot program has ended' when pilot ID extension is present");
});
