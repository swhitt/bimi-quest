import { describe, expect, it } from "vitest";
import { computeGrade } from "./grade";
import type { BimiCheckItem } from "./types";

function makeCheck(
  overrides: Partial<BimiCheckItem> & Pick<BimiCheckItem, "id" | "category" | "status">,
): BimiCheckItem {
  return {
    label: overrides.id,
    summary: `${overrides.id} ${overrides.status}`,
    ...overrides,
  };
}

describe("computeGrade", () => {
  describe("F - declined", () => {
    it("returns F with declined message when declined=true", () => {
      const result = computeGrade([], true);
      expect(result.grade).toBe("F");
      expect(result.summary).toBe("Domain has explicitly declined BIMI");
    });

    it("declined=true overrides any passing checks", () => {
      const checks = [makeCheck({ id: "bimi-dns", category: "spec", status: "pass" })];
      const result = computeGrade(checks, true);
      expect(result.grade).toBe("F");
      expect(result.summary).toBe("Domain has explicitly declined BIMI");
    });
  });

  describe("F - no bimi-dns", () => {
    it("returns F when bimi-dns spec check is failing", () => {
      const checks = [makeCheck({ id: "bimi-dns", category: "spec", status: "fail" })];
      const result = computeGrade(checks);
      expect(result.grade).toBe("F");
      expect(result.summary).toBe("No BIMI record found");
    });

    it("bimi-dns fail in compatibility category does not trigger this path", () => {
      // A bimi-dns fail under compatibility should not be treated as "no BIMI record"
      const checks = [makeCheck({ id: "bimi-dns", category: "compatibility", status: "fail" })];
      const result = computeGrade(checks);
      // compatibility fails count toward compatWarns, landing on B
      expect(result.grade).toBe("B");
    });
  });

  describe("F - 3+ spec failures", () => {
    it("returns F when there are exactly 3 spec failures", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "spec", status: "fail" }),
        makeCheck({ id: "check-b", category: "spec", status: "fail" }),
        makeCheck({ id: "check-c", category: "spec", status: "fail" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("F");
      expect(result.summary).toBe("3 spec compliance failures");
    });

    it("returns F when there are more than 3 spec failures", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "spec", status: "fail" }),
        makeCheck({ id: "check-b", category: "spec", status: "fail" }),
        makeCheck({ id: "check-c", category: "spec", status: "fail" }),
        makeCheck({ id: "check-d", category: "spec", status: "fail" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("F");
      expect(result.summary).toBe("4 spec compliance failures");
    });
  });

  describe("D - 2 spec failures", () => {
    it("returns D when there are exactly 2 spec failures", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "spec", status: "fail" }),
        makeCheck({ id: "check-b", category: "spec", status: "fail" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("D");
      expect(result.summary).toBe("2 spec compliance failures need attention");
    });
  });

  describe("C - 1 spec failure", () => {
    it("returns C with the failing check summary when there is 1 spec failure", () => {
      const checks = [
        makeCheck({ id: "vmc-valid", category: "spec", status: "fail", summary: "VMC certificate is expired" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("C");
      expect(result.summary).toBe("Spec issue: VMC certificate is expired");
    });
  });

  describe("B - warnings (spec or compatibility)", () => {
    it("returns B for 1 spec warning", () => {
      const checks = [makeCheck({ id: "check-a", category: "spec", status: "warn" })];
      const result = computeGrade(checks);
      expect(result.grade).toBe("B");
      expect(result.summary).toBe("Spec compliant with 1 spec warning");
    });

    it("returns B for multiple spec warnings", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "spec", status: "warn" }),
        makeCheck({ id: "check-b", category: "spec", status: "warn" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("B");
      expect(result.summary).toBe("Spec compliant with 2 spec warnings");
    });

    it("returns B for 1 compatibility warning", () => {
      const checks = [makeCheck({ id: "check-a", category: "compatibility", status: "warn" })];
      const result = computeGrade(checks);
      expect(result.grade).toBe("B");
      expect(result.summary).toBe("Spec compliant with 1 compatibility warning");
    });

    it("returns B for multiple compatibility warnings", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "compatibility", status: "warn" }),
        makeCheck({ id: "check-b", category: "compatibility", status: "warn" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("B");
      expect(result.summary).toBe("Spec compliant with 2 compatibility warnings");
    });

    it("combines spec and compatibility warning counts", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "spec", status: "warn" }),
        makeCheck({ id: "check-b", category: "compatibility", status: "warn" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("B");
      expect(result.summary).toBe("Spec compliant with 1 spec and 1 compatibility warnings");
    });

    it("treats compatibility fails as compatibility warnings for grading purposes", () => {
      const checks = [makeCheck({ id: "check-a", category: "compatibility", status: "fail" })];
      const result = computeGrade(checks);
      expect(result.grade).toBe("B");
      expect(result.summary).toBe("Spec compliant with 1 compatibility warning");
    });
  });

  describe("A - clean", () => {
    it("returns A when there are no checks", () => {
      const result = computeGrade([]);
      expect(result.grade).toBe("A");
      expect(result.summary).toBe("Full BIMI compliance across all checks");
    });

    it("returns A when all checks pass", () => {
      const checks = [
        makeCheck({ id: "bimi-dns", category: "spec", status: "pass" }),
        makeCheck({ id: "vmc-valid", category: "spec", status: "pass" }),
        makeCheck({ id: "check-a", category: "compatibility", status: "pass" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("A");
      expect(result.summary).toBe("Full BIMI compliance across all checks");
    });

    it("returns A when all checks are skipped or info", () => {
      const checks = [
        makeCheck({ id: "check-a", category: "spec", status: "skip" }),
        makeCheck({ id: "check-b", category: "compatibility", status: "info" }),
      ];
      const result = computeGrade(checks);
      expect(result.grade).toBe("A");
      expect(result.summary).toBe("Full BIMI compliance across all checks");
    });

    it("declined defaults to false when not provided", () => {
      const result = computeGrade([]);
      expect(result.grade).toBe("A");
    });
  });
});
