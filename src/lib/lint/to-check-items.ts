import type { BimiCheckItem } from "@/lib/bimi/types";
import type { LintResult } from "./types";

export function toLintCheckItems(results: LintResult[]): BimiCheckItem[] {
  return results.map((r) => ({
    id: r.rule,
    category: "spec" as const,
    label: r.title,
    status: mapStatus(r),
    summary: r.status === "pass" ? "Passed" : (r.detail ?? "Failed"),
    detail: r.detail,
    specRef: r.citation,
  }));
}

function mapStatus(r: LintResult): BimiCheckItem["status"] {
  if (r.status === "not_applicable") return "skip";
  if (r.status === "pass") return "pass";
  if (r.severity === "error") return "fail";
  if (r.severity === "warning") return "warn";
  return "info";
}
