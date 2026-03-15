"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { displayIntermediateCa, displayRootCa } from "@/lib/ca-display";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";

interface IssuerChipProps {
  issuerOrg: string | null;
  rootCaOrg?: string | null;
  className?: string;
  size?: "xs" | "sm";
  compact?: boolean;
}

export function IssuerChip({ issuerOrg, rootCaOrg, className, size = "xs", compact = false }: IssuerChipProps) {
  if (!issuerOrg) return <span className="text-muted-foreground">Unknown</span>;

  const textSize = size === "xs" ? "text-xs" : "text-sm";
  const intermediateDisplay = displayIntermediateCa(issuerOrg);
  const rootDisplay = rootCaOrg ? displayRootCa(rootCaOrg) : null;

  const rootSlug = slugify(rootCaOrg || issuerOrg);
  const intermediateSlug = rootCaOrg && rootDisplay !== intermediateDisplay ? slugify(issuerOrg) : null;
  const href = `/cas/${rootSlug}${intermediateSlug ? `?intermediate=${intermediateSlug}` : ""}`;

  const showTooltip = rootDisplay && rootDisplay !== intermediateDisplay;

  const link = (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center hover:underline transition-colors duration-150 truncate",
        compact
          ? "text-muted-foreground hover:text-foreground"
          : "rounded-full bg-secondary/50 px-2 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground",
        textSize,
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {intermediateDisplay}
    </Link>
  );

  if (showTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent>Root CA: {rootDisplay}</TooltipContent>
      </Tooltip>
    );
  }

  return link;
}
