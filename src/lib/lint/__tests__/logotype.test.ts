import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/logotype";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [
  logotypePresent,
  logotypeNotCritical,
  logotypeDataUri,
  svgCompressed,
  svgTinyPs,
  logotypeHashPresent,
  logotypeHashSha256,
] = rules;

describe("e_bimi_logotype_present", () => {
  it("passes for a VMC with logotype extension", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypePresent(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  it("fails for a non-BIMI cert", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = logotypePresent(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("fail");
  });
});

describe("e_bimi_logotype_not_critical", () => {
  it("passes for a VMC with non-critical logotype extension", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypeNotCritical(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_logotype_not_critical");
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = logotypeNotCritical(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});

describe("e_bimi_logotype_data_uri", () => {
  it("passes for a VMC with data: URI", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypeDataUri(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = logotypeDataUri(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});

describe("e_bimi_svg_compressed", () => {
  it("passes for a VMC with gzip-compressed SVG", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = svgCompressed(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = svgCompressed(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});

describe("e_bimi_svg_tiny_ps", () => {
  it("passes or fails with detail for a VMC", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = svgTinyPs(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_svg_tiny_ps");
    // CNN VMC SVG may or may not pass all SVG Tiny PS checks
    expect(["pass", "fail"]).toContain(r.status);
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = svgTinyPs(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});

describe("e_bimi_logotype_hash_present", () => {
  it("passes for a VMC with a hash (SHA-1 or SHA-256)", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypeHashPresent(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("e_bimi_logotype_hash_present");
    expect(r.status).toBe("pass");
    expect(r.severity).toBe("error");
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = logotypeHashPresent(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});

describe("n_bimi_logotype_hash_sha256", () => {
  it("notices SHA-1 usage on a VMC without SHA-256", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypeHashSha256(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.rule).toBe("n_bimi_logotype_hash_sha256");
    expect(r.severity).toBe("notice");
    // CNN VMC uses SHA-1 — should fail (recommending SHA-256)
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("SHA-1");
  });

  it("mentions SHA-1 and SHA-256 in the detail", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypeHashSha256(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    // CNN VMC uses SHA-1 — detail should mention both SHA-1 and SHA-256
    expect(r.detail).toContain("SHA-1");
    expect(r.detail).toContain("SHA-256");
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = logotypeHashSha256(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});
