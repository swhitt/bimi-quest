import { describe, it, expect } from "vitest";
import { validateSvgRng, rngToCheckItems } from "./svg-rng";

const validSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps"
     viewBox="0 0 100 100">
  <title>Test Brand</title>
  <rect fill="#ff0000" width="100" height="100"/>
</svg>`;

describe("validateSvgRng", () => {
  it("passes a valid SVG Tiny PS file", async () => {
    const result = await validateSvgRng(validSvg);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects SVG with disallowed element", async () => {
    const svg = validSvg.replace(
      "</svg>",
      "<script>alert(1)</script></svg>"
    );
    const result = await validateSvgRng(svg);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /script/i.test(e))).toBe(true);
  });

  it("rejects SVG with disallowed attribute", async () => {
    const svg = validSvg.replace("<rect", '<rect onclick="alert(1)"');
    const result = await validateSvgRng(svg);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects completely invalid XML", async () => {
    const result = await validateSvgRng("not xml at all <><>");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("rngToCheckItems", () => {
  it("returns a pass item for valid results", () => {
    const items = rngToCheckItems({ valid: true, errors: [] });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("pass");
    expect(items[0].id).toBe("rng-schema");
    expect(items[0].category).toBe("spec");
  });

  it("returns fail items for each error", () => {
    const items = rngToCheckItems({
      valid: false,
      errors: ["element script not allowed", "attribute onclick not expected"],
    });
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe("fail");
    expect(items[0].id).toBe("rng-error-0");
    expect(items[0].summary).toBe("element script not allowed");
    expect(items[0].specRef).toBe("draft-svg-tiny-ps-abrotman");
    expect(items[1].id).toBe("rng-error-1");
  });
});
