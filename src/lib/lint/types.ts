import type { X509Certificate } from "@peculiar/x509";

export type LintSeverity = "error" | "warning" | "notice";
export type LintSource = "MCR" | "RFC3709" | "RFC5280" | "CABF";
export type LintStatus = "pass" | "fail" | "not_applicable";

export interface LintResult {
  rule: string;
  severity: LintSeverity;
  source: LintSource;
  citation: string;
  title: string;
  status: LintStatus;
  detail?: string;
}

export type LintRule = (cert: X509Certificate, pem: string) => LintResult | LintResult[] | null;

export interface LintSummary {
  errors: number;
  warnings: number;
  notices: number;
  passed: number;
}
