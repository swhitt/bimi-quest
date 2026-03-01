import type { BimiCheckItem } from "./types";
import { decompressIfGzipped, sha256Hex } from "@/lib/pem";

export interface SVGValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MAX_SIZE_BYTES = 32 * 1024; // 32KB per BIMI spec
const MAX_TITLE_LENGTH = 64;

// Elements allowed by the SVG Tiny PS RelaxNG schema (svg_tiny_ps.rng).
// Any element not in this set is a schema violation.
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "circle",
  "defs",
  "desc",
  "ellipse",
  "font",
  "font-face",
  "g",
  "glyph",
  "hkern",
  "line",
  "linearGradient",
  "metadata",
  "path",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "solidColor",
  "stop",
  "text",
  "textArea",
  "title",
  "use",
]);

// Units that are relative and not allowed on width/height in BIMI SVGs.
// Only absolute units (px, pt, cm, mm, in) or unitless values are acceptable.
const RELATIVE_UNITS = /(%|em|ex|rem|vw|vh|vmin|vmax)$/i;

/**
 * Validate an SVG against the BIMI SVG Tiny PS profile.
 *
 * Checks are split into three layers:
 * 1. SVG Tiny PS schema (RelaxNG) - element whitelist, required attributes, attribute constraints
 * 2. BIMI-level requirements - square aspect ratio, file size, <title>, security
 * 3. Gmail compatibility - minimum dimensions, explicit width/height
 *
 * Based on:
 * - SSLcom/bimi svg_tiny_ps.rng schema
 * - SSLcom/bimi validator.rb and security.rb
 * - BIMI Group SVG guidelines
 * - draft-brand-indicators-for-message-identification
 */
export function validateSVGTinyPS(svgContent: string): SVGValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = svgContent.trim();

  // Must contain an <svg> element
  if (!/<svg[\s>]/i.test(trimmed)) {
    errors.push("No <svg> element found");
    return { valid: false, errors, warnings };
  }

  // --- BIMI-level: file size (32KB max) ---
  const sizeBytes = new TextEncoder().encode(trimmed).length;
  if (sizeBytes > MAX_SIZE_BYTES) {
    errors.push(
      `File size ${(sizeBytes / 1024).toFixed(1)}KB exceeds 32KB limit`
    );
  }

  // Extract the <svg> opening tag attributes
  const svgTagMatch = trimmed.match(/<svg([^>]*)>/i);
  const svgAttrs = svgTagMatch ? svgTagMatch[1] : "";

  // =============================================
  // SVG Tiny PS schema checks
  // =============================================

  // baseProfile="tiny-ps" (required by schema)
  if (!/baseProfile\s*=\s*["']tiny-ps["']/i.test(svgAttrs)) {
    errors.push('Missing required baseProfile="tiny-ps" attribute');
  }

  // version="1.2" (required by schema)
  if (!/version\s*=\s*["']1\.2["']/i.test(svgAttrs)) {
    errors.push('Missing required version="1.2" attribute');
  }

  // SVG Tiny PS attribute constraints (if present, must have specific values)
  checkAttrValue(svgAttrs, "zoomAndPan", "disable", errors);
  checkAttrValue(svgAttrs, "focusable", "false", errors);
  checkAttrValue(svgAttrs, "externalResourcesRequired", "false", errors);
  checkAttrValue(svgAttrs, "snapshotTime", "none", errors);
  checkAttrValue(svgAttrs, "playbackOrder", "all", errors);
  checkAttrValue(svgAttrs, "timelineBegin", "onLoad", errors);

  // Element whitelist - extract all element names and check against allowed set
  const elementMatches = trimmed.matchAll(/<([a-zA-Z][\w.-]*)/g);
  const disallowedElements = new Set<string>();
  for (const m of elementMatches) {
    const elName = m[1];
    if (elName === "xml" || elName === "DOCTYPE") continue;
    if (!ALLOWED_ELEMENTS.has(elName)) {
      disallowedElements.add(elName);
    }
  }
  for (const el of disallowedElements) {
    errors.push(
      `Contains <${el}> element (not in SVG Tiny PS allowed elements)`
    );
  }

  // =============================================
  // BIMI-level requirements
  // =============================================

  // --- viewBox and square aspect ratio ---
  if (!/viewBox\s*=/i.test(svgAttrs)) {
    warnings.push("Missing viewBox attribute (recommended for consistent rendering)");
  } else {
    const viewBoxMatch = svgAttrs.match(
      /viewBox\s*=\s*["']([^"']*)["']/i
    );
    if (viewBoxMatch) {
      const raw = viewBoxMatch[1].trim();

      // viewBox must be space-delimited per BIMI guidelines
      if (raw.includes(",")) {
        errors.push(
          "viewBox uses comma-delimited values (must be space-delimited per BIMI spec)"
        );
      }

      const parts = raw.split(/[\s,]+/);
      if (parts.length === 4) {
        const width = parseFloat(parts[2]);
        const height = parseFloat(parts[3]);
        if (Math.abs(width - height) > 0.01) {
          errors.push(
            `viewBox is not square: ${width}x${height} (BIMI requires 1:1 aspect ratio)`
          );
        }
      } else {
        errors.push(
          `Invalid viewBox format: expected 4 values, got ${parts.length}`
        );
      }
    }
  }

  // --- <title> element: required, non-empty, max 64 chars ---
  const titleMatch = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) {
    errors.push("Missing required <title> element (must contain brand name)");
  } else {
    const titleText = titleMatch[1].trim();
    if (titleText.length === 0) {
      errors.push("<title> element is empty (must contain brand name)");
    } else if (titleText.length > MAX_TITLE_LENGTH) {
      errors.push(
        `<title> exceeds ${MAX_TITLE_LENGTH} characters (${titleText.length})`
      );
    }
  }

  // --- <desc> recommended ---
  const descMatch = trimmed.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
  if (!descMatch) {
    warnings.push("Missing recommended <desc> element for accessibility");
  } else if (descMatch[1].trim().length === 0) {
    warnings.push("<desc> element is empty");
  }

  // =============================================
  // Security checks
  // =============================================

  // No event handler attributes (onclick, onload, etc.)
  if (/\bon\w+\s*=\s*["']/i.test(trimmed)) {
    errors.push("Contains event handler attributes (not allowed in SVG Tiny PS)");
  }

  // No javascript: URIs in href/xlink:href attributes (case-insensitive)
  if (/(?:xlink:)?href\s*=\s*["']\s*javascript\s*:/i.test(trimmed)) {
    errors.push("Contains javascript: URI in href attribute");
  }

  // No data:text/html URIs (XSS vector)
  if (/(?:xlink:)?href\s*=\s*["']\s*data\s*:\s*text\/html/i.test(trimmed)) {
    errors.push("Contains data:text/html URI (potential XSS vector)");
  }

  // No external URL references in href attributes
  if (/(?:xlink:)?href\s*=\s*["'](https?:\/\/|\/\/)/gi.test(trimmed)) {
    errors.push("Contains external href references");
  }

  // No external stylesheet processing instructions
  if (/<\?xml-stylesheet/i.test(trimmed)) {
    errors.push("Contains external stylesheet reference");
  }

  // Check url() references in both attributes and <style> blocks
  // External URLs and javascript: inside url() are not allowed
  const urlFuncMatches = trimmed.matchAll(/url\(\s*['"]?\s*([^)'"]+)/gi);
  for (const m of urlFuncMatches) {
    const ref = m[1].trim();
    if (/^(https?:)?\/\//i.test(ref)) {
      errors.push("Contains external url() reference");
      break;
    }
    if (/^javascript\s*:/i.test(ref)) {
      errors.push("Contains javascript: in url() reference");
      break;
    }
  }

  // Check <style> blocks for @import
  const styleBlocks = trimmed.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (styleBlocks) {
    for (const style of styleBlocks) {
      if (/@import/i.test(style)) {
        errors.push("Contains @import in <style> (no external resources allowed)");
        break;
      }
    }
  }

  // =============================================
  // Namespace check
  // =============================================

  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svgAttrs)) {
    errors.push('Missing required xmlns="http://www.w3.org/2000/svg"');
  }

  // =============================================
  // Gmail compatibility warnings
  // =============================================

  // width/height: check for relative units (always an error) and absolute dimensions
  const widthMatch = svgAttrs.match(/\bwidth\s*=\s*["']([^"']*)["']/i);
  const heightMatch = svgAttrs.match(/\bheight\s*=\s*["']([^"']*)["']/i);

  if (widthMatch && RELATIVE_UNITS.test(widthMatch[1].trim())) {
    errors.push(
      `width uses relative unit "${widthMatch[1].trim()}" (only absolute units allowed)`
    );
  }
  if (heightMatch && RELATIVE_UNITS.test(heightMatch[1].trim())) {
    errors.push(
      `height uses relative unit "${heightMatch[1].trim()}" (only absolute units allowed)`
    );
  }

  if (!widthMatch || !heightMatch) {
    warnings.push(
      "Missing explicit width/height attributes (recommended for Gmail compatibility)"
    );
  } else {
    const w = parseFloat(widthMatch[1]);
    const h = parseFloat(heightMatch[1]);
    if (!isNaN(w) && !isNaN(h)) {
      if (w < 96 || h < 96) {
        warnings.push(
          `Dimensions ${w}x${h} below Gmail minimum of 96x96`
        );
      }
    }
  }

  // x/y on root <svg> should be removed
  if (/\bx\s*=\s*["']/i.test(svgAttrs)) {
    warnings.push("Root <svg> element should not have an x attribute");
  }
  if (/\by\s*=\s*["']/i.test(svgAttrs)) {
    warnings.push("Root <svg> element should not have a y attribute");
  }

  // <text> elements work but paths are more portable
  if (/<text[\s>]/i.test(trimmed)) {
    warnings.push(
      "Contains <text> elements (converting to paths improves cross-client portability)"
    );
  }

  // <text editable> must be "none" if present (SVG Tiny PS constraint)
  const textEditableMatches = trimmed.matchAll(
    /<text[^>]*\beditable\s*=\s*["']([^"']*)["'][^>]*/gi
  );
  for (const m of textEditableMatches) {
    if (m[1].trim().toLowerCase() !== "none") {
      errors.push(
        `<text> has editable="${m[1].trim()}" (must be "none" per SVG Tiny PS)`
      );
    }
  }

  // =============================================
  // Apple Mail compatibility warnings
  // =============================================

  // Apple Mail renders at various sizes (14pt in list, 30pt in message header).
  // Complex SVGs with very fine detail may not render well at small sizes.
  const pathCount = (trimmed.match(/<path[\s>]/gi) || []).length;
  if (pathCount > 500) {
    warnings.push(
      `High path count (${pathCount}) may render poorly at Apple Mail's smaller display sizes (14pt)`
    );
  }

  // Check for transforms that might cause rendering differences across clients
  if (/<animate/i.test(trimmed) || /<set[\s>]/i.test(trimmed)) {
    errors.push("Contains animation elements (not allowed in BIMI SVGs)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * If the given attribute is present on the <svg> tag, verify it has the expected value.
 * These are SVG Tiny PS constraints: the attributes are optional, but if present
 * they must have a specific value.
 */
function checkAttrValue(
  svgAttrs: string,
  attr: string,
  expected: string,
  errors: string[]
) {
  const re = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = svgAttrs.match(re);
  if (match && match[1].trim().toLowerCase() !== expected.toLowerCase()) {
    errors.push(
      `${attr}="${match[1].trim()}" (must be "${expected}" per SVG Tiny PS)`
    );
  }
}

/**
 * Decompress SVGZ (gzip-compressed SVG) if needed.
 * Detects gzip by checking for the magic bytes 0x1f 0x8b.
 */
export function decompressSvgIfNeeded(buffer: Buffer | Uint8Array): string {
  return decompressIfGzipped(new Uint8Array(buffer)) ?? Buffer.from(buffer).toString("utf-8");
}

/** Compute a hex-encoded SHA-256 hash of SVG content. */
export const computeSvgHash = sha256Hex;

/**
 * Map SVG validation errors/warnings to structured BimiCheckItem entries.
 */
export function categorizeSvgChecks(
  result: SVGValidationResult
): BimiCheckItem[] {
  const items: BimiCheckItem[] = [];

  // Compatibility-related keywords (Gmail, Apple Mail, dimensions, portability)
  const compatPatterns =
    /gmail|apple mail|portability|dimensions|width\/height|display size/i;

  if (result.errors.length === 0 && result.warnings.length === 0) {
    items.push({
      id: "svg-valid",
      category: "spec",
      label: "SVG Tiny PS",
      status: "pass",
      summary: "SVG passes all SVG Tiny PS checks",
    });
    return items;
  }

  for (const error of result.errors) {
    const isCompat = compatPatterns.test(error);
    items.push({
      id: `svg-err-${items.length}`,
      category: isCompat ? "compatibility" : "spec",
      label: isCompat ? "Compatibility" : "SVG Tiny PS",
      status: "fail",
      summary: error,
      remediation: getSvgRemediation(error),
    });
  }

  for (const warning of result.warnings) {
    const isCompat = compatPatterns.test(warning);
    items.push({
      id: `svg-warn-${items.length}`,
      category: isCompat ? "compatibility" : "spec",
      label: isCompat ? "Compatibility" : "SVG Tiny PS",
      status: "warn",
      summary: warning,
      remediation: getSvgRemediation(warning),
    });
  }

  return items;
}

const SVG_REMEDIATION_MAP: [RegExp, string][] = [
  [/Missing.*viewBox/i, "Add a viewBox attribute to the root <svg> element, e.g. viewBox=\"0 0 100 100\" using your logo's dimensions."],
  [/not square|aspect ratio/i, "Make the viewBox width and height equal (e.g., \"0 0 100 100\") so the logo is a perfect square."],
  [/Contains <(\w+)> element/i, "Remove the disallowed element from your SVG. Only elements in the SVG Tiny PS profile are permitted."],
  [/Missing required baseProfile/i, "Add baseProfile=\"tiny-ps\" to the root <svg> element."],
  [/Missing required version/i, "Add version=\"1.2\" to the root <svg> element."],
  [/Missing required xmlns/i, "Add xmlns=\"http://www.w3.org/2000/svg\" to the root <svg> element."],
  [/Missing required <title>/i, "Add a <title> element inside your <svg> containing your brand name, e.g. <title>Acme Corp</title>."],
  [/<title>.*empty/i, "Put your brand name inside the <title> element, e.g. <title>Acme Corp</title>."],
  [/<title>.*exceeds/i, "Shorten your <title> text to 64 characters or fewer."],
  [/event handler/i, "Remove all on* attributes (onclick, onload, etc.) from your SVG elements."],
  [/javascript.*URI|javascript.*url/i, "Remove any javascript: references from href and url() values."],
  [/external.*href|external.*url/i, "Remove all external URL references. SVG Tiny PS does not allow linking to external resources."],
  [/animation elements/i, "Remove <animate>, <set>, and other animation elements. BIMI SVGs must be static."],
  [/File size.*exceeds/i, "Reduce your SVG file size to under 32KB. Simplify paths, remove unnecessary metadata, or use an SVG optimizer."],
  [/comma-delimited/i, "Change the viewBox value to use spaces instead of commas, e.g. viewBox=\"0 0 100 100\"."],
  [/@import/i, "Remove @import rules from <style> blocks. External stylesheets are not allowed."],
  [/external stylesheet/i, "Remove the <?xml-stylesheet?> processing instruction. External stylesheets are not allowed."],
  [/data:text\/html/i, "Remove any data:text/html URIs from href attributes."],
  [/relative unit/i, "Use absolute units (px, pt, cm, mm, in) or unitless values for width and height instead of relative units like em, rem, or %."],
  [/Missing explicit width\/height/i, "Add explicit width and height attributes to the root <svg> element (e.g., width=\"100\" height=\"100\") for better Gmail compatibility."],
  [/below Gmail minimum/i, "Increase the width and height attributes to at least 96x96 for Gmail compatibility."],
  [/Missing recommended <desc>/i, "Add a <desc> element inside your <svg> with a brief description of the logo for accessibility."],
  [/<desc>.*empty/i, "Add a description inside the <desc> element for accessibility."],
  [/should not have an? [xy] attribute/i, "Remove the x and y attributes from the root <svg> element."],
  [/<text> elements/i, "Convert <text> elements to <path> elements for consistent rendering across email clients. Most vector editors can do this via \"Convert to Outlines\"."],
  [/High path count/i, "Simplify your SVG to reduce the number of paths. Complex logos may not render well at small sizes in some email clients."],
  [/editable=.*must be "none"/i, "Set the editable attribute to \"none\" on all <text> elements, or remove it entirely."],
  [/zoomAndPan/i, "Set zoomAndPan=\"disable\" on the root <svg> element, or remove the attribute."],
  [/focusable/i, "Set focusable=\"false\" on the root <svg> element, or remove the attribute."],
  [/externalResourcesRequired/i, "Set externalResourcesRequired=\"false\" on the root <svg> element, or remove the attribute."],
  [/Invalid viewBox format/i, "The viewBox attribute needs exactly 4 space-separated numbers: min-x, min-y, width, and height (e.g., \"0 0 100 100\")."],
];

function getSvgRemediation(message: string): string | undefined {
  for (const [pattern, fix] of SVG_REMEDIATION_MAP) {
    if (pattern.test(message)) return fix;
  }
  return undefined;
}
