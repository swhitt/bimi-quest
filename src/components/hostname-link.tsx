"use client";

import Link from "next/link";
import { ExternalArrowIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface HostnameLinkProps {
  hostname: string;
  showExternal?: boolean;
  className?: string;
  size?: "xs" | "sm";
  compact?: boolean;
}

export function HostnameLink({
  hostname,
  showExternal = true,
  className,
  size = "xs",
  compact = false,
}: HostnameLinkProps) {
  const textSize = size === "xs" ? "text-xs" : "text-sm";

  return (
    <span className={cn("inline-flex items-center gap-1", compact && "group/hostname", className)}>
      <Link
        href={`/hosts/${encodeURIComponent(hostname)}`}
        className={cn(
          "font-mono text-muted-foreground hover:text-foreground hover:underline transition-colors duration-150",
          textSize,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {hostname}
      </Link>
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
