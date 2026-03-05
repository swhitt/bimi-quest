/**
 * SVG sanitizer using DOMPurify for both client and server.
 *
 * Client: uses the browser's native DOM via dompurify directly.
 * Server: uses dompurify + jsdom (jsdom provides the DOM implementation).
 *
 * The old regex-based server fallback was bypassable (e.g. self-closing
 * <script/>, xlink:href="javascript:..."). DOMPurify handles these correctly.
 */

type PurifyInstance = { sanitize: (dirty: string, cfg: Record<string, unknown>) => string };

let _purify: PurifyInstance | null = null;
let _tried = false;

function getPurify(): PurifyInstance | null {
  if (_purify) return _purify;
  if (_tried) return null;
  _tried = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createDOMPurify = require("dompurify");
    const factory = createDOMPurify.default || createDOMPurify;

    if (typeof window !== "undefined") {
      // Browser: call the factory with the native window
      _purify = factory(window) as PurifyInstance;
      return _purify;
    }

    // Server: dompurify needs a DOM implementation from jsdom.
    // jsdom must be a direct dependency so Vercel's bundler traces it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM("");
    _purify = factory(dom.window) as PurifyInstance;
    return _purify;
  } catch {
    // jsdom not available (e.g. edge runtime); fall through to null
    return null;
  }
}

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
];

/** DOMPurify config shared by all sanitization calls */
const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ALLOWED_TAGS,
  ALLOWED_ATTR: ALLOWED_ATTRS,
  ADD_TAGS: ["solidColor"],
};

/** Add viewBox from width/height if missing, so SVGs scale properly */
function ensureViewBox(svg: string): string {
  if (/viewBox\s*=/i.test(svg)) return svg;
  const wMatch = svg.match(/<svg[^>]*\bwidth=["'](\d+(?:\.\d+)?)/i);
  const hMatch = svg.match(/<svg[^>]*\bheight=["'](\d+(?:\.\d+)?)/i);
  if (!wMatch || !hMatch) return svg;
  return svg.replace(/<svg\b/, `<svg viewBox="0 0 ${wMatch[1]} ${hMatch[1]}"`);
}

/** Strip attributes/content that browsers silently remove from parsed SVG DOM,
 *  so server-rendered HTML matches what the browser produces during hydration. */
function stripBrowserDropped(svg: string): string {
  return (
    svg
      // baseProfile is deprecated in SVG 2; browsers drop it from the DOM
      .replace(/\s+baseProfile\s*=\s*"[^"]*"/gi, "")
      .replace(/\s+baseProfile\s*=\s*'[^']*'/gi, "")
      // HTML/XML comments are stripped by DOMPurify and some browser parsers
      .replace(/<!--[\s\S]*?-->/g, "")
  );
}

/** Sanitize SVG markup, stripping scripts and event handlers.
 *  Uses DOMPurify on both client and server for proper DOM-based sanitization. */
export function sanitizeSvg(raw: string): string {
  // Strip XML declaration and leading whitespace so server and client produce
  // identical output (DOMPurify strips it client-side, causing hydration mismatch)
  const stripped = raw.replace(/^\s*<\?xml[^?]*\?>\s*/i, "");
  const normalized = ensureViewBox(stripBrowserDropped(stripped));

  const purify = getPurify();
  if (purify) {
    return purify.sanitize(normalized, PURIFY_CONFIG);
  }

  // If jsdom is genuinely unavailable (edge runtime), throw rather than
  // silently returning empty string — callers must know sanitization failed.
  throw new Error("SVG sanitization unavailable: DOMPurify could not be initialized");
}

/**
 * Sanitize SVG for the proxy route. Same sanitization as sanitizeSvg but
 * without viewBox injection or baseProfile stripping (content is served
 * as-is, not hydrated).
 */
export function sanitizeSvgForProxy(raw: string): string {
  const purify = getPurify();
  if (purify) {
    return purify.sanitize(raw, PURIFY_CONFIG);
  }
  throw new Error("SVG sanitization unavailable: DOMPurify could not be initialized");
}
