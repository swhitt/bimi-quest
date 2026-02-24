export interface SVGValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validate that an SVG meets BIMI SVG Tiny PS requirements */
export function validateSVGTinyPS(svgContent: string): SVGValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = svgContent.trim();

  // Must contain an <svg> element
  if (!/<svg[\s>]/i.test(trimmed)) {
    errors.push("No <svg> element found");
    return { valid: false, errors, warnings };
  }

  // Extract the <svg> opening tag attributes
  const svgTagMatch = trimmed.match(/<svg([^>]*)>/i);
  const svgAttrs = svgTagMatch ? svgTagMatch[1] : "";

  // Should have baseProfile="tiny-ps"
  if (!/baseProfile\s*=\s*["']tiny-ps["']/i.test(svgAttrs)) {
    warnings.push('Missing baseProfile="tiny-ps" attribute');
  }

  // Should have version="1.2"
  if (!/version\s*=\s*["']1\.2["']/i.test(svgAttrs)) {
    warnings.push('Missing version="1.2" attribute');
  }

  // Must have a viewBox attribute
  if (!/viewBox\s*=/i.test(svgAttrs)) {
    errors.push("Missing viewBox attribute on <svg> element");
  } else {
    // Check if viewBox is square
    const viewBoxMatch = svgAttrs.match(
      /viewBox\s*=\s*["']([^"']*)["']/i
    );
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/\s+/);
      if (parts.length === 4) {
        const width = parseFloat(parts[2]);
        const height = parseFloat(parts[3]);
        if (width !== height) {
          errors.push(
            `viewBox is not square: ${width}x${height} (BIMI requires square logos)`
          );
        }
      }
    }
  }

  // Must not contain <script> elements
  if (/<script[\s>]/i.test(trimmed)) {
    errors.push("Contains <script> elements (not allowed in SVG Tiny PS)");
  }

  // Must not contain <foreignObject>
  if (/<foreignObject[\s>]/i.test(trimmed)) {
    errors.push(
      "Contains <foreignObject> elements (not allowed in SVG Tiny PS)"
    );
  }

  // Must not contain external references (xlink:href to external URLs)
  const externalRefPattern =
    /xlink:href\s*=\s*["'](https?:\/\/|\/\/)[^"']*["']/gi;
  if (externalRefPattern.test(trimmed)) {
    errors.push("Contains external references (xlink:href to external URLs)");
  }

  // Check for href to external URLs (SVG 2 syntax)
  const hrefExternalPattern =
    /\bhref\s*=\s*["'](https?:\/\/|\/\/)[^"']*["']/gi;
  if (hrefExternalPattern.test(trimmed)) {
    errors.push("Contains external href references");
  }

  // Must not use external stylesheets
  if (/<\?xml-stylesheet/i.test(trimmed)) {
    errors.push("Contains external stylesheet reference");
  }

  // Should not contain interactive elements
  const interactiveElements = [
    "animate",
    "animateMotion",
    "animateTransform",
    "set",
    "cursor",
  ];
  for (const el of interactiveElements) {
    if (new RegExp(`<${el}[\\s>]`, "i").test(trimmed)) {
      warnings.push(`Contains <${el}> element (may not be supported)`);
    }
  }

  // Check for embedded raster images (technically allowed but worth noting)
  if (/<image[\s>]/i.test(trimmed)) {
    warnings.push(
      "Contains <image> element (embedded raster images may affect rendering)"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
