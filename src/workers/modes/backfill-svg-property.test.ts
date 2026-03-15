import { describe, expect, it } from "vitest";
import { ALLOWED_COLUMNS, backfillSvgProperty } from "./backfill-svg-property";

describe("backfillSvgProperty column whitelist", () => {
  it("allows color_richness", () => {
    expect(ALLOWED_COLUMNS.has("color_richness")).toBe(true);
  });

  it("allows tile_bg", () => {
    expect(ALLOWED_COLUMNS.has("tile_bg")).toBe(true);
  });

  it("allows visual_hash", () => {
    expect(ALLOWED_COLUMNS.has("visual_hash")).toBe(true);
  });

  it("allows quality_score", () => {
    expect(ALLOWED_COLUMNS.has("quality_score")).toBe(true);
  });

  it("rejects unknown columns", () => {
    expect(ALLOWED_COLUMNS.has("id")).toBe(false);
    expect(ALLOWED_COLUMNS.has("svg_content")).toBe(false);
    expect(ALLOWED_COLUMNS.has("'; DROP TABLE logos; --")).toBe(false);
  });

  it("throws when backfillSvgProperty is called with an invalid column", async () => {
    const fakeSql = (() => {}) as never;
    await expect(
      backfillSvgProperty(fakeSql, {
        label: "test",
        targetColumn: "evil_column",
        compute: () => null,
        batchUpdate: async () => {},
      }),
    ).rejects.toThrow("Invalid target column: evil_column");
  });
});
