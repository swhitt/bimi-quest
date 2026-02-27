"use client";

import { sanitizeSvg } from "@/lib/sanitize-svg";

export function LogoSvg({ svg, className }: { svg: string; className?: string }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}
