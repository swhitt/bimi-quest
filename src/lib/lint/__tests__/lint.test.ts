import { describe, expect, it } from "vitest";
import { lintPem, summarize } from "../lint";
import type { LintResult } from "../types";
import { BIMI_VMC_PEM, NON_BIMI_PEM, PERFECT_BIMI_VMC_PEM } from "./fixtures";

function makeResult(severity: LintResult["severity"], status: LintResult["status"]): LintResult {
  return {
    rule: "test_rule",
    severity,
    source: "MCR",
    citation: "§1.0",
    title: "Test Rule",
    status,
  };
}

describe("summarize", () => {
  it("counts error failures", () => {
    const results = [makeResult("error", "fail")];
    const summary = summarize(results);
    expect(summary.errors).toBe(1);
    expect(summary.warnings).toBe(0);
    expect(summary.notices).toBe(0);
    expect(summary.passed).toBe(0);
  });

  it("counts warning failures", () => {
    const results = [makeResult("warning", "fail")];
    const summary = summarize(results);
    expect(summary.warnings).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it("counts notice failures", () => {
    const results = [makeResult("notice", "fail")];
    const summary = summarize(results);
    expect(summary.notices).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it("counts passed results regardless of severity", () => {
    const results = [makeResult("error", "pass"), makeResult("warning", "pass"), makeResult("notice", "pass")];
    const summary = summarize(results);
    expect(summary.passed).toBe(3);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
    expect(summary.notices).toBe(0);
  });

  it("excludes not_applicable from all counts", () => {
    const results = [makeResult("error", "not_applicable"), makeResult("warning", "not_applicable")];
    const summary = summarize(results);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
    expect(summary.notices).toBe(0);
    expect(summary.passed).toBe(0);
  });

  it("counts mixed results correctly", () => {
    const results = [
      makeResult("error", "fail"),
      makeResult("error", "fail"),
      makeResult("warning", "fail"),
      makeResult("notice", "pass"),
      makeResult("error", "not_applicable"),
    ];
    const summary = summarize(results);
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(1);
    expect(summary.notices).toBe(0);
    expect(summary.passed).toBe(1);
  });

  it("returns all zeros for empty results", () => {
    const summary = summarize([]);
    expect(summary).toEqual({ errors: 0, warnings: 0, notices: 0, passed: 0 });
  });
});

describe("lintPem integration", () => {
  it("returns expected results for a valid VMC", () => {
    const results = lintPem(BIMI_VMC_PEM);
    expect(results.length).toBeGreaterThan(10);

    // EKU rules should pass
    const ekuPresent = results.find((r) => r.rule === "e_bimi_eku_present");
    expect(ekuPresent?.status).toBe("pass");

    // Mark type should be valid
    const markType = results.find((r) => r.rule === "e_bimi_mark_type_valid");
    expect(markType?.status).toBe("pass");

    // Logotype should be present
    const logotype = results.find((r) => r.rule === "e_bimi_logotype_present");
    expect(logotype?.status).toBe("pass");

    // Summary should have reasonable counts
    const summary = summarize(results);
    expect(summary.passed).toBeGreaterThan(5);
    expect(summary.errors + summary.warnings + summary.notices + summary.passed).toBe(
      results.filter((r) => r.status !== "not_applicable").length,
    );
  });

  it("passes every rule for the perfect VMC fixture", () => {
    const results = lintPem(PERFECT_BIMI_VMC_PEM);
    const summary = summarize(results);

    // Every applicable rule must pass — zero errors, warnings, or notices
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
    expect(summary.notices).toBe(0);
    expect(summary.passed).toBeGreaterThanOrEqual(20);

    // No rule should fail
    const failures = results.filter((r) => r.status === "fail");
    expect(failures).toEqual([]);
  });

  it("returns many failures for a non-BIMI cert", () => {
    const results = lintPem(NON_BIMI_PEM);
    const summary = summarize(results);
    expect(summary.errors).toBeGreaterThan(3);
  });
});
