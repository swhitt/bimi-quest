import { describe, expect, it } from "vitest";
import { summarize } from "../lint";
import type { LintResult } from "../types";

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
