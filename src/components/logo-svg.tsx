"use client";

import { sanitizeSvg } from "@/lib/sanitize-svg";

export function LogoSvg({ svg, className, alt }: { svg: string; className?: string; alt?: string }) {
  return (
    <div
      role="img"
      aria-label={alt ?? "Logo"}
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}
