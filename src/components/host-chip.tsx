"use client";

import Link from "next/link";
import { ExternalArrowIcon } from "@/components/ui/icons";
import { domainUrl, validateUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";

interface HostChipProps {
  hostname: string;
  showExternal?: boolean;
  showBimiCheck?: boolean;
  className?: string;
  size?: "xs" | "sm";
  compact?: boolean;
}

export function HostChip({
  hostname,
  showExternal = true,
  showBimiCheck = false,
  className,
  size = "xs",
  compact = false,
}: HostChipProps) {
  const textSize = size === "xs" ? "text-xs" : "text-sm";

  return (
    <span className={cn("inline-flex items-center gap-1", compact && "group/hostname", className)}>
      <Link
        href={domainUrl(hostname)}
        className={cn("font-mono text-foreground hover:underline transition-colors duration-150", textSize)}
        onClick={(e) => e.stopPropagation()}
      >
        {hostname}
      </Link>
      {showBimiCheck && (
        <Link
          href={validateUrl(hostname)}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
          aria-label={`Run BIMI check for ${hostname}`}
          title={`Run BIMI check for ${hostname}`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          </svg>
        </Link>
      )}
      {showExternal && (
        <a
          href={`https://${hostname}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center text-muted-foreground hover:text-foreground transition-colors duration-150",
            compact && "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/hostname:opacity-100",
          )}
          title={`Open ${hostname} in new tab`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalArrowIcon />
        </a>
      )}
    </span>
  );
}
