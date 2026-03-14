import { X509Certificate } from "@peculiar/x509";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import type { LintResult, LintRule, LintSummary } from "./types";

const allRules: LintRule[] = [];

export function lintBimiCert(cert: X509Certificate, pem: string): LintResult[] {
  return allRules.flatMap((rule) => {
    const result = rule(cert, pem);
    if (result === null) return [];
    return Array.isArray(result) ? result : [result];
  });
}

export function lintPem(pem: string): LintResult[] {
  const der = pemToDer(pem);
  const cert = new X509Certificate(toArrayBuffer(der));
  return lintBimiCert(cert, pem);
}

export function summarize(results: LintResult[]): LintSummary {
  let errors = 0;
  let warnings = 0;
  let notices = 0;
  let passed = 0;

  for (const r of results) {
    if (r.status === "not_applicable") continue;
    if (r.status === "pass") {
      passed++;
      continue;
    }
    switch (r.severity) {
      case "error":
        errors++;
        break;
      case "warning":
        warnings++;
        break;
      case "notice":
        notices++;
        break;
    }
  }

  return { errors, warnings, notices, passed };
}
