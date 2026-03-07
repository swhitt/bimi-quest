"use client";

import Link from "next/link";
import { certUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";

interface CertChipProps {
  fingerprint: string;
  label?: string;
  certType?: string | null;
  className?: string;
  size?: "xs" | "sm";
  compact?: boolean;
}

export function CertChip({ fingerprint, label, certType, className, size = "xs", compact = false }: CertChipProps) {
  const textSize = size === "xs" ? "text-xs" : "text-sm";
  const displayText = label ?? fingerprint.slice(0, 12);

  return (
    <Link
      href={certUrl(fingerprint)}
      className={cn(
        "inline-flex items-center gap-1 font-mono hover:underline transition-colors duration-150",
        compact
          ? "text-primary hover:text-primary"
          : "rounded-full bg-secondary/50 px-2 py-0.5 text-foreground/90 hover:bg-secondary hover:text-foreground",
        textSize,
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {displayText}
      {certType && <span className="text-[10px] font-sans font-medium text-muted-foreground">{certType}</span>}
    </Link>
  );
}
