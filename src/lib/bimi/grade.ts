import type { BimiCheckItem, BimiGradeResult } from "./types";

/**
 * Compute a letter grade from structured BIMI check results.
 *
 * Rules:
 *   F  - domain declined BIMI, no BIMI record, or 3+ spec failures
 *   D  - 2 spec failures
 *   C  - 1 spec failure
 *   B  - all spec checks pass, some spec or compatibility warnings
 *   A  - everything clean
 */
export function computeGrade(checks: BimiCheckItem[], declined: boolean = false): BimiGradeResult {
  if (declined) {
    return { grade: "F", summary: "Domain has explicitly declined BIMI" };
  }

  const specChecks = checks.filter((c) => c.category === "spec");
  const compatChecks = checks.filter((c) => c.category === "compatibility");

  const specFails = specChecks.filter((c) => c.status === "fail");
  const specWarns = specChecks.filter((c) => c.status === "warn");
  const compatWarns = compatChecks.filter((c) => c.status === "warn" || c.status === "fail");

  // No BIMI record at all
  const noBimi = specChecks.find((c) => c.id === "bimi-dns" && c.status === "fail");
  if (noBimi) {
    return { grade: "F", summary: "No BIMI record found" };
  }

  if (specFails.length >= 3) {
    return {
      grade: "F",
      summary: `${specFails.length} spec compliance failures`,
    };
  }

  if (specFails.length >= 2) {
    return {
      grade: "D",
      summary: `${specFails.length} spec compliance failures need attention`,
    };
  }

  if (specFails.length === 1) {
    return {
      grade: "C",
      summary: `Spec issue: ${specFails[0].summary}`,
    };
  }

  const totalWarns = specWarns.length + compatWarns.length;
  if (totalWarns > 0) {
    const parts: string[] = [];
    if (specWarns.length > 0) parts.push(`${specWarns.length} spec`);
    if (compatWarns.length > 0) parts.push(`${compatWarns.length} compatibility`);
    return {
      grade: "B",
      summary: `Spec compliant with ${parts.join(" and ")} warning${totalWarns > 1 ? "s" : ""}`,
    };
  }

  return { grade: "A", summary: "Full BIMI compliance across all checks" };
}
