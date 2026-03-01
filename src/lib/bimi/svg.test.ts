import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { validateSVGTinyPS, decompressSvgIfNeeded, computeSvgHash, categorizeSvgChecks } from "./svg";

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
    const svg = validSvg.replace("</svg>", '<use href="javascript:alert(1)"/></svg>');
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("javascript:"));
  });

  it("rejects external hrefs", () => {
    const svg = validSvg.replace("</svg>", '<use href="https://evil.com/inject.svg"/></svg>');
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
    const bigSvg = validSvg.replace("</svg>", `<!-- ${"x".repeat(33 * 1024)} --></svg>`);
    const result = validateSVGTinyPS(bigSvg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("32KB"));
  });

  it("warns on missing width/height", () => {
    const svg = validSvg.replace('width="100"', "").replace('height="100"', "");
    const result = validateSVGTinyPS(svg);
    expect(result.warnings).toContainEqual(expect.stringContaining("Missing explicit width/height attributes"));
  });

  it("warns on small dimensions", () => {
    const svg = validSvg.replace('width="100"', 'width="50"').replace('height="100"', 'height="50"');
    const result = validateSVGTinyPS(svg);
    expect(result.warnings).toContainEqual(expect.stringContaining("below Gmail minimum"));
  });

  it("warns on missing desc", () => {
    const svg = validSvg.replace(/<desc>.*<\/desc>/, "");
    const result = validateSVGTinyPS(svg);
    expect(result.warnings).toContainEqual(expect.stringContaining("Missing recommended <desc>"));
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

  it("rejects invalid playbackOrder", () => {
    const svg = validSvg.replace("<svg", '<svg playbackOrder="forwardOnly"');
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('playbackOrder="forwardOnly"'));
  });

  it("accepts valid playbackOrder", () => {
    const svg = validSvg.replace("<svg", '<svg playbackOrder="all"');
    const result = validateSVGTinyPS(svg);
    expect(result.errors).not.toContainEqual(expect.stringContaining("playbackOrder"));
  });

  it("rejects invalid timelineBegin", () => {
    const svg = validSvg.replace("<svg", '<svg timelineBegin="onRequest"');
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('timelineBegin="onRequest"'));
  });

  it("accepts valid timelineBegin", () => {
    const svg = validSvg.replace("<svg", '<svg timelineBegin="onLoad"');
    const result = validateSVGTinyPS(svg);
    expect(result.errors).not.toContainEqual(expect.stringContaining("timelineBegin"));
  });

  it("rejects text editable not set to none", () => {
    const svg = validSvg.replace("</svg>", '<text editable="simple">Hello</text></svg>');
    const result = validateSVGTinyPS(svg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('editable="simple"'));
  });

  it("accepts text editable=none", () => {
    const svg = validSvg.replace("</svg>", '<text editable="none">Hello</text></svg>');
    const result = validateSVGTinyPS(svg);
    expect(result.errors).not.toContainEqual(expect.stringContaining("editable"));
  });
});

describe("decompressSvgIfNeeded", () => {
  it("returns plain SVG unchanged", () => {
    const buf = Buffer.from(validSvg, "utf-8");
    expect(decompressSvgIfNeeded(buf)).toBe(validSvg);
  });

  it("decompresses gzipped SVG", () => {
    const compressed = gzipSync(Buffer.from(validSvg, "utf-8"));
    expect(decompressSvgIfNeeded(compressed)).toBe(validSvg);
  });

  it("works with Uint8Array input", () => {
    const compressed = gzipSync(Buffer.from(validSvg, "utf-8"));
    const uint8 = new Uint8Array(compressed);
    expect(decompressSvgIfNeeded(uint8)).toBe(validSvg);
  });
});

describe("computeSvgHash", () => {
  it("returns a 64-character hex string", () => {
    const hash = computeSvgHash(validSvg);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns consistent hashes for same input", () => {
    expect(computeSvgHash(validSvg)).toBe(computeSvgHash(validSvg));
  });

  it("returns different hashes for different input", () => {
    expect(computeSvgHash(validSvg)).not.toBe(computeSvgHash("different"));
  });
});

describe("categorizeSvgChecks", () => {
  it("returns a pass item for a valid SVG", () => {
    const result = validateSVGTinyPS(validSvg);
    const items = categorizeSvgChecks(result);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("pass");
    expect(items[0].category).toBe("spec");
  });

  it("categorizes spec errors as fail with spec category", () => {
    const svg = validSvg.replace('baseProfile="tiny-ps"', "");
    const result = validateSVGTinyPS(svg);
    const items = categorizeSvgChecks(result);
    const specFails = items.filter((i) => i.category === "spec" && i.status === "fail");
    expect(specFails.length).toBeGreaterThan(0);
  });

  it("categorizes Gmail warnings as compatibility", () => {
    const svg = validSvg.replace('width="100"', 'width="50"').replace('height="100"', 'height="50"');
    const result = validateSVGTinyPS(svg);
    const items = categorizeSvgChecks(result);
    const compatWarns = items.filter((i) => i.category === "compatibility" && i.status === "warn");
    expect(compatWarns.length).toBeGreaterThan(0);
    expect(compatWarns[0].summary).toContain("Gmail");
  });
});
