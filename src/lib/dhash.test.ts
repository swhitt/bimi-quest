import { describe, expect, it } from "vitest";
import { computeVisualHash } from "./dhash";

const simpleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="red"/>
</svg>`;

// Same visual, different XML formatting (extra whitespace, attributes reordered)
const reformattedSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle    r="40"   cy="50" cx="50"
    fill="red"  />
</svg>`;

// Same visual but with extra viewBox padding (zoom invariance)
const paddedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 200 200">
  <circle cx="50" cy="50" r="40" fill="red"/>
</svg>`;

// Visually different SVG
const differentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" fill="blue"/>
</svg>`;

describe("computeVisualHash", () => {
  it("returns a 16-char hex string for a valid SVG", async () => {
    const hash = await computeVisualHash(simpleSvg);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces the same hash for identical SVGs", async () => {
    const a = await computeVisualHash(simpleSvg);
    const b = await computeVisualHash(simpleSvg);
    expect(a).toBe(b);
  });

  it("produces the same hash for same visual with different XML formatting", async () => {
    const a = await computeVisualHash(simpleSvg);
    const b = await computeVisualHash(reformattedSvg);
    expect(a).toBe(b);
  });

  it("produces the same hash for same visual with different viewBox padding", async () => {
    const a = await computeVisualHash(simpleSvg);
    const b = await computeVisualHash(paddedSvg);
    expect(a).toBe(b);
  });

  it("produces different hashes for visually different SVGs", async () => {
    const a = await computeVisualHash(simpleSvg);
    const b = await computeVisualHash(differentSvg);
    expect(a).not.toBe(b);
  });

  it("returns null for invalid SVG", async () => {
    const hash = await computeVisualHash("not an svg");
    expect(hash).toBeNull();
  });

  it("returns null for empty string", async () => {
    const hash = await computeVisualHash("");
    expect(hash).toBeNull();
  });
});
