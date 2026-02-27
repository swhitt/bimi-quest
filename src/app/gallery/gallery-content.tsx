"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/pagination-bar";

interface Logo {
  svgHash: string;
  svg: string | null;
  org: string | null;
  domain: string | null;
  certType: string | null;
  issuer: string | null;
  rootCa: string | null;
  count: number;
}

interface GalleryResponse {
  logos: Logo[];
  total: number;
  page: number;
  limit: number;
}

const ITEMS_PER_PAGE = 200;

/** Parse a hex color (3 or 6 chars, no #) into [r, g, b] 0-255 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Perceived luminance (0 = black, 1 = white) */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Common SVG named colors mapped to approximate luminance
const NAMED_COLOR_LUM: Record<string, number> = {
  black: 0, navy: 0.06, darkblue: 0.07, darkgreen: 0.12, maroon: 0.09,
  purple: 0.12, indigo: 0.08, midnightblue: 0.06, darkslategray: 0.18,
  darkred: 0.09, dimgray: 0.41, gray: 0.5, grey: 0.5, darkgray: 0.66,
  silver: 0.75, lightgray: 0.83, gainsboro: 0.86, whitesmoke: 0.96,
  white: 1, snow: 0.99, ivory: 0.99, ghostwhite: 0.99, mintcream: 0.99,
  azure: 0.98, aliceblue: 0.97, beige: 0.96, linen: 0.97, seashell: 0.98,
  red: 0.30, green: 0.29, blue: 0.11, yellow: 0.89, orange: 0.55,
  cyan: 0.70, magenta: 0.28, lime: 0.72, pink: 0.75, gold: 0.70,
  tomato: 0.39, coral: 0.50, salmon: 0.57, crimson: 0.21, firebrick: 0.19,
  brown: 0.16, chocolate: 0.28, sienna: 0.24, tan: 0.69, wheat: 0.85,
  teal: 0.23, steelblue: 0.29, royalblue: 0.21, dodgerblue: 0.36,
  cornflowerblue: 0.45, skyblue: 0.68, deepskyblue: 0.48,
};

const SKIP_COLORS = new Set(["none", "transparent", "inherit", "currentcolor", "url"]);

/**
 * Analyze SVG markup to pick a tile background color.
 * Extracts ALL colors from the SVG (attributes, inline styles, style blocks)
 * to determine if the content is dark (needs light bg) or light (dark bg is fine).
 */
function tileBgForSvg(svg: string): string {
  const DEFAULT_DARK = "rgb(38 38 38)";  // neutral-800
  const LIGHT_BG = "rgb(243 244 246)";    // gray-100

  // Check if SVG has a large background rect (covers its own bg)
  // Match rect with width >= 100 or width="100%" near the start of the SVG
  const firstFewElements = svg.slice(0, Math.min(svg.length, 800));
  if (/<rect[^>]*(?:width=["']100%|width=["']\d{3,})/i.test(firstFewElements)) {
    return DEFAULT_DARK;
  }

  const lums: number[] = [];

  // 1. Extract ALL hex colors from anywhere in the SVG
  for (const m of svg.matchAll(/#([0-9a-fA-F]{3})\b|#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[1] || m[2];
    const [r, g, b] = hexToRgb(hex);
    lums.push(luminance(r, g, b));
  }

  // 2. Extract rgb() / rgba() colors
  for (const m of svg.matchAll(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    lums.push(luminance(+m[1], +m[2], +m[3]));
  }

  // 3. Extract named colors from fill/stroke/color/stop-color properties
  for (const m of svg.matchAll(/(?:fill|stroke|color|stop-color)\s*[:=]\s*["']?\s*([a-zA-Z]+)/gi)) {
    const name = m[1].toLowerCase();
    if (SKIP_COLORS.has(name)) continue;
    if (name in NAMED_COLOR_LUM) lums.push(NAMED_COLOR_LUM[name]);
  }

  // 4. SVG default fill is black — if no colors found at all, content is black
  if (lums.length === 0) return LIGHT_BG;

  // Filter out very light colors (likely backgrounds baked into the SVG)
  // and very dark colors to focus on the "content" mid-range
  const contentLums = lums.filter((l) => l < 0.9);
  const avgAll = lums.reduce((a, b) => a + b, 0) / lums.length;
  const avg = contentLums.length > 0
    ? contentLums.reduce((a, b) => a + b, 0) / contentLums.length
    : avgAll;

  // Dark content on transparent bg needs a light background to be visible
  if (avg < 0.35) return LIGHT_BG;
  return DEFAULT_DARK;
}

function LogoTile({ logo }: { logo: Logo }) {
  const linkHref = logo.org
    ? `/orgs/${encodeURIComponent(logo.org)}`
    : logo.domain
      ? `/hosts/${encodeURIComponent(logo.domain)}`
      : null;

  const bgColor = logo.svg ? tileBgForSvg(logo.svg) : undefined;

  const tile = (
    <div
      className="group relative aspect-square border border-white/[0.06] bg-neutral-800 transition-all duration-300 ease-out hover:z-20 hover:scale-[1.35] hover:rounded-lg"
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {logo.svg ? (
        <div
          className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{
            __html: sanitizeSvg(logo.svg),
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
          No image
        </div>
      )}
      {/* Floating tooltip below the tile */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 scale-90 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
        <div className="relative whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 shadow-xl ring-1 ring-white/10">
          {/* Arrow */}
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-neutral-900 ring-1 ring-white/10 [clip-path:polygon(0_0,100%_0,0_100%)]" />
          <p className="text-center text-[10px] font-bold text-white">
            {logo.org || "Unknown"}
          </p>
          <p className="text-center text-[8px] text-white/50">
            {logo.domain || "---"}
          </p>
          <div className="mt-0.5 flex items-center justify-center gap-1 text-[8px]">
            {logo.certType && (
              <span className="rounded-full bg-white/15 px-1 py-px text-white/70">
                {logo.certType}
              </span>
            )}
            {logo.issuer && (
              <span className="text-white/40">{logo.issuer}</span>
            )}
            {logo.rootCa && logo.rootCa !== logo.issuer && (
              <span className="text-white/30">/ {logo.rootCa}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (linkHref) {
    return (
      <Link href={linkHref} className="block">
        {tile}
      </Link>
    );
  }
  return tile;
}

export function GalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPage = parseInt(searchParams.get("page") ?? "1") || 1;

  const [data, setData] = useState<GalleryResponse>({
    logos: [],
    total: 0,
    page: initialPage,
    limit: ITEMS_PER_PAGE,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback((page: number) => {
    setLoading(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    fetch(`/api/gallery?page=${page}&limit=${ITEMS_PER_PAGE}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((result: GalleryResponse) => {
        setData(result);
        const url = page > 1 ? `/gallery?page=${page}` : "/gallery";
        router.replace(url, { scroll: false });
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load gallery")
      )
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    fetchPage(initialPage);
  }, [fetchPage, initialPage]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">{error}</p>
        <button
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => fetchPage(data.page)}
        >
          Retry
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <div className="space-y-6">
      {!loading && data.logos.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No logos found.
        </div>
      )}

      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-15">
        {loading
          ? Array.from({ length: 60 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))
          : data.logos.map((logo, i) => (
              <LogoTile key={logo.org ?? `logo-${i}`} logo={logo} />
            ))}
      </div>

      {!loading && totalPages > 1 && (
        <PaginationBar
          pagination={{
            page: data.page,
            limit: data.limit,
            total: data.total,
            totalPages,
          }}
          onPageChange={fetchPage}
          noun="logos"
        />
      )}
    </div>
  );
}
