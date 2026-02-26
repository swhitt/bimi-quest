import { describe, it, expect } from "vitest";
import { validateSVGTinyPS } from "./svg";

const validSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps"
     viewBox="0 0 100 100" width="100" height="100">
  <title>Test Brand</title>
  <desc>A test logo</desc>
  <rect fill="#ff0000" width="100" height="100"/>
</svg>`;

describe("validateSVGTinyPS", () => {
  it("validates a correct SVG Tiny PS file", () => {
    const result = validateSVGTinyPS(validSvg);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing svg element", () => {
    const result = validateSVGTinyPS("<html><body>not svg</body></html>");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("No <svg> element"));
  });

  it("rejects missing baseProfile", () => {
    const svg = validSvg.replace('baseProfile="tiny-ps"', "");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("baseProfile"));
  });

  it("rejects missing version", () => {
    const svg = validSvg.replace('version="1.2"', "");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('version="1.2"'));
  });

  it("rejects non-square viewBox", () => {
    const svg = validSvg.replace("0 0 100 100", "0 0 100 200");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("not square"));
  });

  it("rejects comma-delimited viewBox", () => {
    const svg = validSvg.replace("0 0 100 100", "0,0,100,100");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("comma-delimited"));
  });

  it("rejects missing title", () => {
    const svg = validSvg.replace(/<title>.*<\/title>/, "");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("<title>"));
  });

  it("rejects empty title", () => {
    const svg = validSvg.replace("<title>Test Brand</title>", "<title></title>");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("empty"));
  });

  it("rejects disallowed elements", () => {
    const svg = validSvg.replace("</svg>", "<script>alert(1)</script></svg>");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("<script>"));
  });

  it("rejects event handlers", () => {
    const svg = validSvg.replace("<rect", '<rect onclick="alert(1)"');
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("event handler"));
  });

  it("rejects javascript URIs", () => {
    const svg = validSvg.replace(
      "</svg>",
      '<use href="javascript:alert(1)"/></svg>'
    );
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("javascript:"));
  });

  it("rejects external hrefs", () => {
    const svg = validSvg.replace(
      "</svg>",
      '<use href="https://evil.com/inject.svg"/></svg>'
    );
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("external href"));
  });

  it("rejects animation elements", () => {
    const svg = validSvg.replace("</svg>", "<animate attributeName='x'/></svg>");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("animation"));
  });

  it("rejects files over 32KB", () => {
    const bigSvg = validSvg.replace(
      "</svg>",
      `<!-- ${"x".repeat(33 * 1024)} --></svg>`
    );
    const result = validateSVGTinyPS(bigSvg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("32KB"));
  });

  it("warns on missing width/height", () => {
    const svg = validSvg
      .replace('width="100"', "")
      .replace('height="100"', "");
    const result = validateSVGTinyPS(svg);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Missing explicit width/height")
    );
  });

  it("warns on small dimensions", () => {
    const svg = validSvg
      .replace('width="100"', 'width="50"')
      .replace('height="100"', 'height="50"');
    const result = validateSVGTinyPS(svg);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("below Gmail minimum")
    );
  });

  it("warns on missing desc", () => {
    const svg = validSvg.replace(/<desc>.*<\/desc>/, "");
    const result = validateSVGTinyPS(svg);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Missing recommended <desc>")
    );
  });

  it("rejects relative units on width/height", () => {
    const svg = validSvg.replace('width="100"', 'width="100%"');
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("relative unit"));
  });

  it("rejects missing xmlns", () => {
    const svg = validSvg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("xmlns"));
  });
});
