"use client";

import { Moon, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LogoSvg } from "@/components/logo-svg";
import { Button } from "@/components/ui/button";
import { ChainLinkIcon } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSmartBg } from "@/hooks/use-smart-bg";
import { logoUrl } from "@/lib/entity-urls";
import { DARK_BG, LIGHT_BG } from "@/lib/svg-bg";
import { cn } from "@/lib/utils";

export type LogoCardSize = "xs" | "sm" | "md" | "lg" | "tile";

export interface LogoCardProps {
  svg?: string | null;
  svgUrl?: string | null;
  tileBg?: "light" | "dark" | null;

  size?: LogoCardSize;
  alt?: string;
  className?: string;

  fingerprint?: string | null;
  domain?: string | null;
  asLink?: boolean;

  showToggle?: boolean;
  showShare?: boolean;
}

const SIZE_CLASSES: Record<LogoCardSize, string> = {
  xs: "size-5",
  sm: "size-8",
  md: "w-[200px] h-[200px]",
  lg: "w-72 h-72",
  tile: "h-full w-full",
};

const PADDING: Record<LogoCardSize, string> = {
  xs: "p-0.5",
  sm: "p-1",
  md: "p-4",
  lg: "p-5",
  tile: "",
};

const ROUNDING: Record<LogoCardSize, string> = {
  xs: "rounded",
  sm: "rounded",
  md: "rounded-xl",
  lg: "rounded-2xl",
  tile: "",
};

function LogoCardInner({
  svg,
  svgUrl,
  tileBg,
  size = "md",
  alt = "",
  className,
  fingerprint,
  showToggle,
  showShare,
  isWrappedInLink,
}: Omit<LogoCardProps, "asLink" | "domain"> & { isWrappedInLink?: boolean }) {
  const defaultToggle = size === "md" || size === "lg";
  const shouldToggle = showToggle ?? defaultToggle;

  const { bgColor, isLight, cycleBg, displaySvg } = useSmartBg(svg ?? null, tileBg);

  const isInline = !!svg;
  const dim = size === "xs" ? 20 : size === "sm" ? 32 : size === "md" ? 200 : 288;

  const ringClass = isLight ? "ring-black/10" : "ring-white/10";
  const hasRing = size !== "tile";

  const content =
    isInline && displaySvg ? (
      <LogoSvg svg={displaySvg} alt={alt} className="h-full w-full" />
    ) : svgUrl ? (
      <Image
        src={svgUrl}
        alt={alt}
        loading="lazy"
        width={dim}
        height={dim}
        unoptimized
        className="h-full w-full object-contain"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-muted/50 text-xs text-muted-foreground">
        No image
      </div>
    );

  return (
    <div className={cn("relative group", className)}>
      <div
        className={cn(
          SIZE_CLASSES[size],
          PADDING[size],
          ROUNDING[size],
          "transition-colors duration-200 overflow-hidden",
          "[&>div>svg]:h-full [&>div>svg]:w-full",
          hasRing && "ring-1",
          hasRing && ringClass,
        )}
        style={{ backgroundColor: bgColor }}
      >
        {content}
      </div>

      {/* Background toggle button */}
      {shouldToggle && (
        <div
          className={cn(
            "absolute opacity-0 group-hover:opacity-100 transition-opacity",
            size === "lg" ? "bottom-3 right-3" : "bottom-2 right-2",
          )}
        >
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              cycleBg();
            }}
            title={isLight ? "Switch to dark background" : "Switch to light background"}
            className="backdrop-blur-sm bg-background/80 shadow-md"
          >
            {isLight ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          </Button>
        </div>
      )}

      {/* Share link – use <span> when already inside an <a> to avoid nested anchors */}
      {showShare && fingerprint && (
        <div className="flex justify-center mt-2">
          {isWrappedInLink ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <ChainLinkIcon className="size-3.5" />
              Share
            </span>
          ) : (
            <Link
              href={logoUrl(fingerprint)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ChainLinkIcon className="size-3.5" />
              Share
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function LogoCardWithTooltip({
  svgUrl,
  tileBg,
  alt,
  children,
}: {
  svgUrl?: string | null;
  tileBg?: "light" | "dark" | null;
  alt: string;
  children: React.ReactNode;
}) {
  const previewBg = tileBg === "light" ? LIGHT_BG : DARK_BG;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="p-1">
        {svgUrl ? (
          <Image
            src={svgUrl}
            alt={alt}
            width={160}
            height={160}
            unoptimized
            className="size-40 rounded object-contain"
            style={{ backgroundColor: previewBg }}
          />
        ) : (
          <div className="size-40 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function LogoCard(props: LogoCardProps) {
  const { fingerprint, asLink, size = "md", svgUrl, tileBg, alt = "" } = props;
  const shouldLink = asLink ?? !!fingerprint;
  const href = fingerprint ? logoUrl(fingerprint) : null;
  const needsTooltip = (size === "xs" || size === "sm") && svgUrl;

  const inner = <LogoCardInner {...props} isWrappedInLink={shouldLink && !!href} />;

  // xs/sm: wrap with tooltip for hover preview
  const withTooltip = needsTooltip ? (
    <LogoCardWithTooltip svgUrl={svgUrl} tileBg={tileBg} alt={alt}>
      {shouldLink && href ? (
        <Link href={href} onClick={(e) => e.stopPropagation()} aria-label={alt}>
          {inner}
        </Link>
      ) : (
        <span>{inner}</span>
      )}
    </LogoCardWithTooltip>
  ) : null;

  if (withTooltip) return withTooltip;

  // md/lg/tile: optionally wrap in Link
  if (shouldLink && href) {
    return (
      <Link href={href} onClick={(e) => e.stopPropagation()} aria-label={alt}>
        {inner}
      </Link>
    );
  }

  return inner;
}
