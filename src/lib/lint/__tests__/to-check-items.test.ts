import { describe, expect, it } from "vitest";
import { toLintCheckItems } from "../to-check-items";
import type { LintResult } from "../types";

function make(overrides: Partial<LintResult>): LintResult {
  return {
    rule: "test",
    severity: "error",
    source: "MCR",
    citation: "MCR §1",
    title: "Test",
    status: "pass",
    ...overrides,
  };
}

describe("toLintCheckItems", () => {
  it("maps pass to pass", () => {
    const items = toLintCheckItems([make({ status: "pass" })]);
    expect(items[0].status).toBe("pass");
    expect(items[0].summary).toBe("Passed");
  });

  it("maps error+fail to fail", () => {
    const items = toLintCheckItems([make({ status: "fail", severity: "error", detail: "bad" })]);
    expect(items[0].status).toBe("fail");
    expect(items[0].summary).toBe("bad");
  });

  it("maps warning+fail to warn", () => {
    const items = toLintCheckItems([make({ status: "fail", severity: "warning" })]);
    expect(items[0].status).toBe("warn");
  });

  it("maps notice+fail to info", () => {
    const items = toLintCheckItems([make({ status: "fail", severity: "notice" })]);
    expect(items[0].status).toBe("info");
  });

  it("maps not_applicable to skip", () => {
    const items = toLintCheckItems([make({ status: "not_applicable" })]);
    expect(items[0].status).toBe("skip");
  });

  it("sets category to spec", () => {
    const items = toLintCheckItems([make({})]);
    expect(items[0].category).toBe("spec");
  });

  it("uses citation as specRef", () => {
    const items = toLintCheckItems([make({ citation: "MCR §7.1.2.7" })]);
    expect(items[0].specRef).toBe("MCR §7.1.2.7");
  });
});
