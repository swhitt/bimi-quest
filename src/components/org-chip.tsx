"use client";

import Link from "next/link";
import { orgUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";

interface OrgChipProps {
  org: string;
  className?: string;
  size?: "xs" | "sm";
  compact?: boolean;
}

export function OrgChip({ org, className, size = "xs", compact = false }: OrgChipProps) {
  const textSize = size === "xs" ? "text-xs" : "text-sm";

  return (
    <Link
      href={orgUrl(org)}
      className={cn(
        "inline-flex items-center hover:underline transition-colors duration-150 truncate",
        compact
          ? "text-foreground hover:text-foreground"
          : "rounded-full bg-secondary/50 px-2 py-0.5 text-foreground/90 hover:bg-secondary hover:text-foreground",
        textSize,
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {org}
    </Link>
  );
}
