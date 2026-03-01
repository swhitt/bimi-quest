/** Parse a hex color (3 or 6 chars, no #) into [r, g, b] 0-255 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Perceived luminance (0 = black, 1 = white) */
export function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Common SVG named colors mapped to RGB values */
export const NAMED_COLOR_RGB: Record<string, [number, number, number]> = {
  black: [0, 0, 0], navy: [0, 0, 128], darkblue: [0, 0, 139], darkgreen: [0, 100, 0],
  maroon: [128, 0, 0], purple: [128, 0, 128], indigo: [75, 0, 130], midnightblue: [25, 25, 112],
  darkslategray: [47, 79, 79], darkred: [139, 0, 0], dimgray: [105, 105, 105],
  gray: [128, 128, 128], grey: [128, 128, 128], darkgray: [169, 169, 169],
  silver: [192, 192, 192], lightgray: [211, 211, 211], gainsboro: [220, 220, 220],
  whitesmoke: [245, 245, 245], white: [255, 255, 255], snow: [255, 250, 250],
  ivory: [255, 255, 240], ghostwhite: [248, 248, 255], mintcream: [245, 255, 250],
  azure: [240, 255, 255], aliceblue: [240, 248, 255], beige: [245, 245, 220],
  linen: [250, 240, 230], seashell: [255, 245, 238],
  red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
  orange: [255, 165, 0], cyan: [0, 255, 255], magenta: [255, 0, 255], lime: [0, 255, 0],
  pink: [255, 192, 203], gold: [255, 215, 0], tomato: [255, 99, 71], coral: [255, 127, 80],
  salmon: [250, 128, 114], crimson: [220, 20, 60], firebrick: [178, 34, 34],
  brown: [165, 42, 42], chocolate: [210, 105, 30], sienna: [160, 82, 45],
  tan: [210, 180, 140], wheat: [245, 222, 179],
  teal: [0, 128, 128], steelblue: [70, 130, 180], royalblue: [65, 105, 225],
  dodgerblue: [30, 144, 255], cornflowerblue: [100, 149, 237], skyblue: [135, 206, 235],
  deepskyblue: [0, 191, 255],
};

// Derived luminance map from RGB source of truth
const NAMED_COLOR_LUM: Record<string, number> = Object.fromEntries(
  Object.entries(NAMED_COLOR_RGB).map(([name, [r, g, b]]) => [name, luminance(r, g, b)])
);

export const SKIP_COLORS = new Set(["none", "transparent", "inherit", "currentcolor", "url"]);

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
