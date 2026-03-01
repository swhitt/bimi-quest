import { hexToRgb, luminance, NAMED_COLOR_RGB, SKIP_COLORS } from "@/lib/svg-bg";

/** Convert RGB to HSL; returns [h (0-360), s (0-1), l (0-1)] */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

/**
 * Score color richness of an SVG on a 1-10 scale using regex color extraction.
 * Factors: chromatic fraction, white penalty, average saturation, hue diversity.
 */
export function computeColorRichness(svg: string): number {
  const colors: { r: number; g: number; b: number }[] = [];

  // Extract hex colors
  for (const m of svg.matchAll(/#([0-9a-fA-F]{3})\b|#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[1] || m[2];
    const [r, g, b] = hexToRgb(hex);
    colors.push({ r, g, b });
  }

  // Extract rgb() colors
  for (const m of svg.matchAll(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    colors.push({ r: +m[1], g: +m[2], b: +m[3] });
  }

  // Extract named colors from fill/stroke/color/stop-color attributes
  for (const m of svg.matchAll(/(?:fill|stroke|color|stop-color)\s*[:=]\s*["']?\s*([a-zA-Z]+)/gi)) {
    const name = m[1].toLowerCase();
    if (SKIP_COLORS.has(name)) continue;
    const rgb = NAMED_COLOR_RGB[name];
    if (rgb) colors.push({ r: rgb[0], g: rgb[1], b: rgb[2] });
  }

  if (colors.length === 0) return 1;

  const hsls = colors.map((c) => rgbToHsl(c.r, c.g, c.b));
  const lums = colors.map((c) => luminance(c.r, c.g, c.b));

  // Chromatic fraction: colors with saturation > 0.1
  const chromatic = hsls.filter(([, s]) => s > 0.1);
  const chromaticFraction = chromatic.length / colors.length;

  // White fraction: colors with luminance > 0.9
  const whiteFraction = lums.filter((l) => l > 0.9).length / colors.length;

  // Average saturation of chromatic colors
  const avgSaturation =
    chromatic.length > 0
      ? chromatic.reduce((sum, [, s]) => sum + s, 0) / chromatic.length
      : 0;

  // Hue diversity: count distinct 30-degree buckets among chromatic colors
  const hueBuckets = new Set(chromatic.map(([h]) => Math.floor(h / 30)));
  const hueDiversity = Math.min(hueBuckets.size / 6, 1); // normalize: 6+ buckets = max

  // Weighted score: emphasize chromatic fraction and hue diversity
  const raw =
    chromaticFraction * 0.3 +
    (1 - whiteFraction) * 0.15 +
    avgSaturation * 0.25 +
    hueDiversity * 0.3;

  // Map 0-1 to 1-10
  return Math.max(1, Math.min(10, Math.round(raw * 9 + 1)));
}
