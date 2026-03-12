import { describe, expect, it } from "vitest";
import { ALLOWED_COLUMNS, backfillSvgProperty } from "./backfill-svg-property";

describe("backfillSvgProperty column whitelist", () => {
  it("allows logo_color_richness", () => {
    expect(ALLOWED_COLUMNS.has("logo_color_richness")).toBe(true);
  });

  it("allows logo_tile_bg", () => {
    expect(ALLOWED_COLUMNS.has("logo_tile_bg")).toBe(true);
  });

  it("allows logotype_visual_hash", () => {
    expect(ALLOWED_COLUMNS.has("logotype_visual_hash")).toBe(true);
  });

  it("allows logo_quality_score", () => {
    expect(ALLOWED_COLUMNS.has("logo_quality_score")).toBe(true);
  });

  it("rejects unknown columns", () => {
    expect(ALLOWED_COLUMNS.has("id")).toBe(false);
    expect(ALLOWED_COLUMNS.has("logotype_svg")).toBe(false);
    expect(ALLOWED_COLUMNS.has("'; DROP TABLE certificates; --")).toBe(false);
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
