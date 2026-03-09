"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { sanitizeSvg } from "@/lib/sanitize-svg";

/**
 * Safe SVG renderer. Sanitizes the markup and constrains the <svg> element
 * to fill its container so oversized SVGs never break layout.
 */
export function LogoSvg({ svg, className, alt }: { svg: string; className?: string; alt?: string }) {
  const sanitized = useMemo(() => sanitizeSvg(svg), [svg]);
  return (
    <div
      role="img"
      aria-label={alt ?? "Logo"}
      className={cn("[&>svg]:h-full [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
