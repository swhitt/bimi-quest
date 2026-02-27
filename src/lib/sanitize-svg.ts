const ALLOWED_TAGS = [
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "clipPath",
  "mask",
  "symbol",
  "linearGradient",
  "radialGradient",
  "stop",
  "title",
  "desc",
  "metadata",
  "switch",
  "solidColor",
];

const ALLOWED_ATTRS = [
  "viewBox",
  "xmlns",
  "version",
  "width",
  "height",
  "x",
  "y",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "stroke-opacity",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "opacity",
  "transform",
  "id",
  "class",
  "clip-path",
  "mask",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "letter-spacing",
  "word-spacing",
  "text-decoration",
  "points",
  "x1",
  "y1",
  "x2",
  "y2",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "href",
  "preserveAspectRatio",
  "overflow",
  "display",
  "visibility",
  "color",
  "baseProfile",
];

/** Add viewBox from width/height if missing, so SVGs scale properly */
function ensureViewBox(svg: string): string {
  if (/viewBox\s*=/i.test(svg)) return svg;
  const wMatch = svg.match(/<svg[^>]*\bwidth=["'](\d+(?:\.\d+)?)/i);
  const hMatch = svg.match(/<svg[^>]*\bheight=["'](\d+(?:\.\d+)?)/i);
  if (!wMatch || !hMatch) return svg;
  return svg.replace(/<svg\b/, `<svg viewBox="0 0 ${wMatch[1]} ${hMatch[1]}"`);
}

// Lazy-loaded DOMPurify instance (client-only, avoids jsdom on server)
let purify: typeof import("dompurify").default | null = null;

/** Sanitize SVG markup, stripping scripts and event handlers */
export function sanitizeSvg(raw: string): string {
  const normalized = ensureViewBox(raw);
  // During SSR pass through as-is; all callers are "use client" components
  if (typeof window === "undefined") return normalized;
  if (!purify) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    purify = require("dompurify").default;
  }
  return purify!.sanitize(normalized, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ADD_TAGS: ["solidColor"],
  });
}
