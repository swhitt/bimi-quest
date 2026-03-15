import type { LintRule } from "../types";

const rsaKeySize: LintRule = (cert) => {
  const alg = cert.publicKey.algorithm as { name?: string; modulusLength?: number };
  if (!alg.name?.includes("RSA")) {
    return {
      rule: "w_bimi_rsa_key_size",
      severity: "warning",
      source: "MCR",
      citation: "MCR §6.1.5",
      title: "RSA key must be at least 2048 bits",
      status: "not_applicable",
    };
  }
  const bits = alg.modulusLength ?? 0;
  return {
    rule: "w_bimi_rsa_key_size",
    severity: "warning",
    source: "MCR",
    citation: "MCR §6.1.5",
    title: "RSA key must be at least 2048 bits",
    status: bits >= 2048 ? "pass" : "fail",
    detail: bits < 2048 ? `RSA key size is ${bits} bits (minimum 2048)` : undefined,
  };
};

const ecdsaCurve: LintRule = (cert) => {
  const alg = cert.publicKey.algorithm as { name?: string; namedCurve?: string };
  if (alg.name !== "ECDSA") {
    return {
      rule: "w_bimi_ecdsa_curve",
      severity: "warning",
      source: "MCR",
      citation: "MCR §6.1.5",
      title: "ECDSA key must use P-256 or P-384",
      status: "not_applicable",
    };
  }
  const curve = alg.namedCurve ?? "";
  const valid = curve === "P-256" || curve === "P-384";
  return {
    rule: "w_bimi_ecdsa_curve",
    severity: "warning",
    source: "MCR",
    citation: "MCR §6.1.5",
    title: "ECDSA key must use P-256 or P-384",
    status: valid ? "pass" : "fail",
    detail: valid ? undefined : `ECDSA curve is ${curve} (expected P-256 or P-384)`,
  };
};

const ACCEPTABLE_SIG_HASHES = new Set(["SHA-256", "SHA-384", "SHA-512"]);

const sigHash: LintRule = (cert) => {
  const sigAlg = cert.signatureAlgorithm as { name?: string; hash?: { name?: string } };
  const hashName = sigAlg.hash?.name;
  if (!hashName) {
    return {
      rule: "w_bimi_sig_hash",
      severity: "warning",
      source: "MCR",
      citation: "MCR §6.1.5",
      title: "Signature hash should be SHA-256 or stronger",
      status: "not_applicable",
      detail: "Could not determine signature hash algorithm",
    };
  }
  const acceptable = ACCEPTABLE_SIG_HASHES.has(hashName);
  return {
    rule: "w_bimi_sig_hash",
    severity: "warning",
    source: "MCR",
    citation: "MCR §6.1.5",
    title: "Signature hash should be SHA-256 or stronger",
    status: acceptable ? "pass" : "fail",
    detail: acceptable ? undefined : `Signature uses ${hashName} (SHA-256 or stronger recommended)`,
  };
};

export const rules: LintRule[] = [rsaKeySize, ecdsaCurve, sigHash];
