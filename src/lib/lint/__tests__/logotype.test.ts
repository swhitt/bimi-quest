import { X509Certificate } from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { rules } from "../rules/logotype";
import { BIMI_VMC_PEM, NON_BIMI_PEM } from "./fixtures";

function parseCert(pem: string): X509Certificate {
  const der = pemToDer(pem);
  return new X509Certificate(toArrayBuffer(der));
}

const [logotypePresent, logotypeDataUri, svgCompressed, svgTinyPs, logotypeHashSha256] = rules;

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
});

describe("e_bimi_svg_tiny_ps", () => {
  it("passes for a VMC with valid SVG content", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = svgTinyPs(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("pass");
  });
});

describe("w_bimi_logotype_hash_sha256", () => {
  it("warns for a VMC using SHA-1 instead of SHA-256", () => {
    const cert = parseCert(BIMI_VMC_PEM);
    const result = logotypeHashSha256(cert, BIMI_VMC_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    // This particular VMC uses SHA-1 for the logotype hash
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("warning");
  });

  it("returns not_applicable for cert without logotype", () => {
    const cert = parseCert(NON_BIMI_PEM);
    const result = logotypeHashSha256(cert, NON_BIMI_PEM);
    const r = Array.isArray(result) ? result[0] : result!;
    expect(r.status).toBe("not_applicable");
  });
});
