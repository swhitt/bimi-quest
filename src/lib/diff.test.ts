import { describe, expect, it } from "vitest";
import { computeDiff, type DiffLine } from "./diff";

describe("computeDiff", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(computeDiff([], [])).toEqual([]);
  });

  describe("all-added (a is empty)", () => {
    it("returns all added lines when a is empty", () => {
      const result = computeDiff([], ["x", "y"]);
      expect(result).toEqual<DiffLine[]>([
        { type: "added", text: "x", certLineNo: null, webLineNo: 1 },
        { type: "added", text: "y", certLineNo: null, webLineNo: 2 },
      ]);
    });

    it("assigns sequential webLineNo values starting at 1", () => {
      const lines = ["alpha", "beta", "gamma"];
      const result = computeDiff([], lines);
      result.forEach((line, idx) => {
        expect(line.type).toBe("added");
        expect(line.certLineNo).toBeNull();
        expect(line.webLineNo).toBe(idx + 1);
        expect(line.text).toBe(lines[idx]);
      });
    });
  });

  describe("all-removed (b is empty)", () => {
    it("returns all removed lines when b is empty", () => {
      const result = computeDiff(["x", "y"], []);
      expect(result).toEqual<DiffLine[]>([
        { type: "removed", text: "x", certLineNo: 1, webLineNo: null },
        { type: "removed", text: "y", certLineNo: 2, webLineNo: null },
      ]);
    });

    it("assigns sequential certLineNo values starting at 1", () => {
      const lines = ["alpha", "beta", "gamma"];
      const result = computeDiff(lines, []);
      result.forEach((line, idx) => {
        expect(line.type).toBe("removed");
        expect(line.certLineNo).toBe(idx + 1);
        expect(line.webLineNo).toBeNull();
        expect(line.text).toBe(lines[idx]);
      });
    });
  });

  describe("identical arrays", () => {
    it("returns all unchanged lines when arrays are identical", () => {
      const lines = ["alpha", "beta", "gamma"];
      const result = computeDiff(lines, lines);
      expect(result).toEqual<DiffLine[]>([
        { type: "unchanged", text: "alpha", certLineNo: 1, webLineNo: 1 },
        { type: "unchanged", text: "beta", certLineNo: 2, webLineNo: 2 },
        { type: "unchanged", text: "gamma", certLineNo: 3, webLineNo: 3 },
      ]);
    });

    it("sets both certLineNo and webLineNo for unchanged lines", () => {
      const lines = ["line1", "line2"];
      const result = computeDiff(lines, lines);
      result.forEach((line, idx) => {
        expect(line.type).toBe("unchanged");
        expect(line.certLineNo).toBe(idx + 1);
        expect(line.webLineNo).toBe(idx + 1);
      });
    });
  });

  describe("mixed changes", () => {
    it("handles a single line replacement", () => {
      // a=["old"], b=["new"] — no common elements.
      // The LCS backtracker prefers "left" (added) before "up" (removed) when
      // scores tie, so the added line appears before the removed line.
      const result = computeDiff(["old"], ["new"]);
      expect(result).toEqual<DiffLine[]>([
        { type: "added", text: "new", certLineNo: null, webLineNo: 1 },
        { type: "removed", text: "old", certLineNo: 1, webLineNo: null },
      ]);
    });

    it("preserves unchanged prefix and suffix around a changed middle", () => {
      // a: header, changed-a, footer
      // b: header, changed-b, footer
      const a = ["header", "old-middle", "footer"];
      const b = ["header", "new-middle", "footer"];
      const result = computeDiff(a, b);

      // The LCS backtracker prefers "left" (added) over "up" (removed) on ties,
      // so the added line appears before the removed line for replaced content.
      expect(result).toEqual<DiffLine[]>([
        { type: "unchanged", text: "header", certLineNo: 1, webLineNo: 1 },
        { type: "added", text: "new-middle", certLineNo: null, webLineNo: 2 },
        { type: "removed", text: "old-middle", certLineNo: 2, webLineNo: null },
        { type: "unchanged", text: "footer", certLineNo: 3, webLineNo: 3 },
      ]);
    });

    it("tracks line numbers correctly when lines are added at the beginning", () => {
      // b has an extra line prepended
      const a = ["b", "c"];
      const b = ["a", "b", "c"];
      const result = computeDiff(a, b);

      // "a" is new (added), "b" and "c" are unchanged
      expect(result).toEqual<DiffLine[]>([
        { type: "added", text: "a", certLineNo: null, webLineNo: 1 },
        { type: "unchanged", text: "b", certLineNo: 1, webLineNo: 2 },
        { type: "unchanged", text: "c", certLineNo: 2, webLineNo: 3 },
      ]);
    });

    it("tracks line numbers correctly when lines are removed at the beginning", () => {
      // a has an extra line at the start
      const a = ["a", "b", "c"];
      const b = ["b", "c"];
      const result = computeDiff(a, b);

      expect(result).toEqual<DiffLine[]>([
        { type: "removed", text: "a", certLineNo: 1, webLineNo: null },
        { type: "unchanged", text: "b", certLineNo: 2, webLineNo: 1 },
        { type: "unchanged", text: "c", certLineNo: 3, webLineNo: 2 },
      ]);
    });

    it("handles interleaved additions and removals", () => {
      // a: 1, 2, 3
      // b: 1, X, 3
      // Line 2 removed, X added
      const a = ["1", "2", "3"];
      const b = ["1", "X", "3"];
      const result = computeDiff(a, b);

      // The LCS backtracker prefers "left" (added) over "up" (removed) on ties,
      // so the added line appears before the removed line for replaced content.
      expect(result).toEqual<DiffLine[]>([
        { type: "unchanged", text: "1", certLineNo: 1, webLineNo: 1 },
        { type: "added", text: "X", certLineNo: null, webLineNo: 2 },
        { type: "removed", text: "2", certLineNo: 2, webLineNo: null },
        { type: "unchanged", text: "3", certLineNo: 3, webLineNo: 3 },
      ]);
    });

    it("certLineNo and webLineNo diverge when lines are inserted", () => {
      // Inserting two lines into b shifts webLineNo ahead of certLineNo
      const a = ["a", "z"];
      const b = ["a", "b", "c", "z"];
      const result = computeDiff(a, b);

      const unchanged = result.filter((l) => l.type === "unchanged");
      // "a" is certLineNo:1 / webLineNo:1
      expect(unchanged[0]).toMatchObject({ text: "a", certLineNo: 1, webLineNo: 1 });
      // "z" is certLineNo:2 but webLineNo:4 (shifted by two inserts)
      expect(unchanged[1]).toMatchObject({ text: "z", certLineNo: 2, webLineNo: 4 });

      const added = result.filter((l) => l.type === "added");
      expect(added).toHaveLength(2);
      expect(added[0]).toMatchObject({ text: "b", certLineNo: null, webLineNo: 2 });
      expect(added[1]).toMatchObject({ text: "c", certLineNo: null, webLineNo: 3 });
    });

    it("never sets certLineNo on added lines or webLineNo on removed lines", () => {
      const a = ["only-in-a", "shared"];
      const b = ["shared", "only-in-b"];
      const result = computeDiff(a, b);

      for (const line of result) {
        if (line.type === "added") {
          expect(line.certLineNo).toBeNull();
          expect(line.webLineNo).not.toBeNull();
        } else if (line.type === "removed") {
          expect(line.certLineNo).not.toBeNull();
          expect(line.webLineNo).toBeNull();
        } else {
          expect(line.certLineNo).not.toBeNull();
          expect(line.webLineNo).not.toBeNull();
        }
      }
    });
  });

  describe("large-input fallback (> 2000 lines)", () => {
    it("falls back when a exceeds 2000 lines", () => {
      const a = Array.from({ length: 2001 }, (_, i) => `line-a-${i}`);
      const b = ["x"];
      const result = computeDiff(a, b);

      // All a lines come first as removed, then all b lines as added
      const removed = result.filter((l) => l.type === "removed");
      const added = result.filter((l) => l.type === "added");

      expect(removed).toHaveLength(a.length);
      expect(added).toHaveLength(b.length);

      // Removed block appears before added block
      const firstAddedIdx = result.findIndex((l) => l.type === "added");
      const lastRemovedIdx = result.findLastIndex((l) => l.type === "removed");
      expect(lastRemovedIdx).toBeLessThan(firstAddedIdx);
    });

    it("falls back when b exceeds 2000 lines", () => {
      const a = ["x"];
      const b = Array.from({ length: 2001 }, (_, i) => `line-b-${i}`);
      const result = computeDiff(a, b);

      const removed = result.filter((l) => l.type === "removed");
      const added = result.filter((l) => l.type === "added");

      expect(removed).toHaveLength(a.length);
      expect(added).toHaveLength(b.length);
    });

    it("assigns correct certLineNo (1-based) in fallback removed block", () => {
      const a = Array.from({ length: 2001 }, (_, i) => `a${i}`);
      const result = computeDiff(a, []);

      result.forEach((line, idx) => {
        expect(line.type).toBe("removed");
        expect(line.certLineNo).toBe(idx + 1);
        expect(line.webLineNo).toBeNull();
        expect(line.text).toBe(a[idx]);
      });
    });

    it("assigns correct webLineNo (1-based) in fallback added block", () => {
      const b = Array.from({ length: 2001 }, (_, i) => `b${i}`);
      const result = computeDiff([], b);

      result.forEach((line, idx) => {
        expect(line.type).toBe("added");
        expect(line.certLineNo).toBeNull();
        expect(line.webLineNo).toBe(idx + 1);
        expect(line.text).toBe(b[idx]);
      });
    });

    it("does not fall back when both arrays are exactly 2000 lines", () => {
      // At exactly 2000 lines, the LCS path is used — result must contain unchanged lines
      const lines = Array.from({ length: 2000 }, (_, i) => `line-${i}`);
      const result = computeDiff(lines, lines);
      const unchanged = result.filter((l) => l.type === "unchanged");
      expect(unchanged).toHaveLength(2000);
    });

    it("fallback produces no unchanged lines", () => {
      const a = Array.from({ length: 2001 }, (_, i) => `same-${i}`);
      const b = [...a]; // identical content, but fallback ignores LCS
      const result = computeDiff(a, b);
      const unchanged = result.filter((l) => l.type === "unchanged");
      expect(unchanged).toHaveLength(0);
    });
  });
});
