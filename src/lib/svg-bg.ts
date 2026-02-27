/** Parse a hex color (3 or 6 chars, no #) into [r, g, b] 0-255 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Perceived luminance (0 = black, 1 = white) */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Common SVG named colors mapped to approximate luminance
const NAMED_COLOR_LUM: Record<string, number> = {
  black: 0, navy: 0.06, darkblue: 0.07, darkgreen: 0.12, maroon: 0.09,
  purple: 0.12, indigo: 0.08, midnightblue: 0.06, darkslategray: 0.18,
  darkred: 0.09, dimgray: 0.41, gray: 0.5, grey: 0.5, darkgray: 0.66,
  silver: 0.75, lightgray: 0.83, gainsboro: 0.86, whitesmoke: 0.96,
  white: 1, snow: 0.99, ivory: 0.99, ghostwhite: 0.99, mintcream: 0.99,
  azure: 0.98, aliceblue: 0.97, beige: 0.96, linen: 0.97, seashell: 0.98,
  red: 0.30, green: 0.29, blue: 0.11, yellow: 0.89, orange: 0.55,
  cyan: 0.70, magenta: 0.28, lime: 0.72, pink: 0.75, gold: 0.70,
  tomato: 0.39, coral: 0.50, salmon: 0.57, crimson: 0.21, firebrick: 0.19,
  brown: 0.16, chocolate: 0.28, sienna: 0.24, tan: 0.69, wheat: 0.85,
  teal: 0.23, steelblue: 0.29, royalblue: 0.21, dodgerblue: 0.36,
  cornflowerblue: 0.45, skyblue: 0.68, deepskyblue: 0.48,
};

const SKIP_COLORS = new Set(["none", "transparent", "inherit", "currentcolor", "url"]);

const WHITE_FILLS = new Set(["#fff", "#ffffff", "white", "rgb(255,255,255)", "rgb(255, 255, 255)"]);

/**
 * Strip baked-in white background rects from SVGs so the tile bg shows through.
 * Detects the first <rect> with a white fill that covers the full viewBox and
 * replaces it with fill="none". This lets colorful logos render against the
 * dark tile background instead of their own white canvas.
 */
export function stripWhiteSvgBg(svg: string): string {
  const vbMatch = svg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/);
  if (!vbMatch) return svg;
  const vbW = parseFloat(vbMatch[1]);
  const vbH = parseFloat(vbMatch[2]);
  if (!vbW || !vbH) return svg;

  const searchRegion = svg.slice(0, Math.min(svg.length, 1200));
  const rectRe = /<rect\b([^>]*)\/?>|<rect\b([^>]*)>[^<]*<\/rect>/gi;
  let m;
  while ((m = rectRe.exec(searchRegion)) !== null) {
    const attrs = m[1] || m[2];

    const fillMatch = attrs.match(/fill=["']([^"']+)["']/i);
    if (!fillMatch) continue;
    const fill = fillMatch[1].toLowerCase().trim();
    if (!WHITE_FILLS.has(fill)) continue;

    const wMatch = attrs.match(/\bwidth=["']([^"']+)["']/i);
    const hMatch = attrs.match(/\bheight=["']([^"']+)["']/i);
    if (!wMatch || !hMatch) continue;

    const w = wMatch[1], h = hMatch[1];
    const coversW = w === "100%" || Math.abs(parseFloat(w) - vbW) < vbW * 0.1;
    const coversH = h === "100%" || Math.abs(parseFloat(h) - vbH) < vbH * 0.1;
    if (!coversW || !coversH) continue;

    const xMatch = attrs.match(/\bx=["']([^"']+)["']/i);
    const yMatch = attrs.match(/\by=["']([^"']+)["']/i);
    const x = xMatch ? parseFloat(xMatch[1]) : 0;
    const y = yMatch ? parseFloat(yMatch[1]) : 0;
    if (Math.abs(x) > vbW * 0.05 || Math.abs(y) > vbH * 0.05) continue;

    return svg.replace(m[0], m[0].replace(/fill=["'][^"']+["']/, 'fill="none"'));
  }

  return svg;
}

export const DARK_BG = "rgb(38 38 38)";   // neutral-800
export const LIGHT_BG = "rgb(243 244 246)"; // gray-100

/**
 * Analyze SVG markup to pick a background color.
 * Runs on the stripped SVG (white bg already removed) so it only sees
 * actual content colors. Dark content gets a light bg for contrast.
 */
export function tileBgForSvg(svg: string): string {
  // Check if SVG has a large visible non-white background rect
  const firstFewElements = svg.slice(0, Math.min(svg.length, 800));
  const bgRectMatch = firstFewElements.match(/<rect[^>]*(?:width=["']100%|width=["']\d{3,})[^>]*>/i);
  if (bgRectMatch && !/fill=["']none["']/i.test(bgRectMatch[0])) {
    return DARK_BG;
  }

  const lums: number[] = [];

  for (const m of svg.matchAll(/#([0-9a-fA-F]{3})\b|#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[1] || m[2];
    const [r, g, b] = hexToRgb(hex);
    lums.push(luminance(r, g, b));
  }

  for (const m of svg.matchAll(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    lums.push(luminance(+m[1], +m[2], +m[3]));
  }

  for (const m of svg.matchAll(/(?:fill|stroke|color|stop-color)\s*[:=]\s*["']?\s*([a-zA-Z]+)/gi)) {
    const name = m[1].toLowerCase();
    if (SKIP_COLORS.has(name)) continue;
    if (name in NAMED_COLOR_LUM) lums.push(NAMED_COLOR_LUM[name]);
  }

  if (lums.length === 0) return LIGHT_BG;

  const contentLums = lums.filter((l) => l < 0.9);
  const avgAll = lums.reduce((a, b) => a + b, 0) / lums.length;
  const avg = contentLums.length > 0
    ? contentLums.reduce((a, b) => a + b, 0) / contentLums.length
    : avgAll;

  if (avg < 0.35) return LIGHT_BG;
  return DARK_BG;
}

/** Whether the bg color is the light variant (for ring/text contrast decisions) */
export function isLightBg(bg: string): boolean {
  return bg.includes("243");
}
