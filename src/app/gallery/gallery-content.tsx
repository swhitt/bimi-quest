"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/pagination-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Logo {
  fingerprint: string;
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

const WHITE_FILLS = new Set(["#fff", "#ffffff", "white", "rgb(255,255,255)", "rgb(255, 255, 255)"]);

/**
 * Strip baked-in white background rects from SVGs so the tile bg shows through.
 * Detects the first <rect> with a white fill that covers the full viewBox and
 * replaces it with fill="none". This lets colorful logos render against the
 * dark tile background instead of their own white canvas.
 */
function stripWhiteSvgBg(svg: string): string {
  // Parse viewBox dimensions
  const vbMatch = svg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/);
  if (!vbMatch) return svg;
  const vbW = parseFloat(vbMatch[1]);
  const vbH = parseFloat(vbMatch[2]);
  if (!vbW || !vbH) return svg;

  // Find rects in the first portion of the SVG (background rects come early)
  const searchRegion = svg.slice(0, Math.min(svg.length, 1200));
  const rectRe = /<rect\b([^>]*)\/?>|<rect\b([^>]*)>[^<]*<\/rect>/gi;
  let m;
  while ((m = rectRe.exec(searchRegion)) !== null) {
    const attrs = m[1] || m[2];

    // Check fill is white
    const fillMatch = attrs.match(/fill=["']([^"']+)["']/i);
    if (!fillMatch) continue;
    const fill = fillMatch[1].toLowerCase().trim();
    if (!WHITE_FILLS.has(fill)) continue;

    // Check dimensions cover the full canvas (within 10% tolerance)
    const wMatch = attrs.match(/\bwidth=["']([^"']+)["']/i);
    const hMatch = attrs.match(/\bheight=["']([^"']+)["']/i);
    if (!wMatch || !hMatch) continue;

    const w = wMatch[1], h = hMatch[1];
    const coversW = w === "100%" || Math.abs(parseFloat(w) - vbW) < vbW * 0.1;
    const coversH = h === "100%" || Math.abs(parseFloat(h) - vbH) < vbH * 0.1;
    if (!coversW || !coversH) continue;

    // Check position is at origin
    const xMatch = attrs.match(/\bx=["']([^"']+)["']/i);
    const yMatch = attrs.match(/\by=["']([^"']+)["']/i);
    const x = xMatch ? parseFloat(xMatch[1]) : 0;
    const y = yMatch ? parseFloat(yMatch[1]) : 0;
    if (Math.abs(x) > vbW * 0.05 || Math.abs(y) > vbH * 0.05) continue;

    // Replace this rect's fill with none
    return svg.replace(m[0], m[0].replace(/fill=["'][^"']+["']/, 'fill="none"'));
  }

  return svg;
}

/**
 * Analyze SVG markup to pick a tile background color.
 * Runs on the stripped SVG (white bg already removed) so it only sees
 * actual content colors. Dark content gets a light tile bg for contrast.
 */
function tileBgForSvg(svg: string): string {
  const DEFAULT_DARK = "rgb(38 38 38)";  // neutral-800
  const LIGHT_BG = "rgb(243 244 246)";    // gray-100

  // Check if SVG has a large visible non-white background rect (covers its own bg).
  // Skip rects with fill="none" since those are invisible clip/layout rects.
  const firstFewElements = svg.slice(0, Math.min(svg.length, 800));
  const bgRectMatch = firstFewElements.match(/<rect[^>]*(?:width=["']100%|width=["']\d{3,})[^>]*>/i);
  if (bgRectMatch && !/fill=["']none["']/i.test(bgRectMatch[0])) {
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
  // and focus on the "content" mid-range
  const contentLums = lums.filter((l) => l < 0.9);
  const avgAll = lums.reduce((a, b) => a + b, 0) / lums.length;
  const avg = contentLums.length > 0
    ? contentLums.reduce((a, b) => a + b, 0) / contentLums.length
    : avgAll;

  // Dark content on transparent bg needs a light background to be visible
  if (avg < 0.35) return LIGHT_BG;
  return DEFAULT_DARK;
}

function domainSlug(domain: string): string {
  const parts = domain.toLowerCase().replace(/[^a-z0-9.\-]/g, "").split(".");
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "logo";
}

function LogoTile({ logo }: { logo: Logo }) {
  const linkHref = logo.fingerprint
    ? `/logo/${logo.fingerprint.slice(0, 16)}/${logo.domain ? domainSlug(logo.domain) : "logo"}`
    : null;
  const [copied, setCopied] = useState(false);

  // Strip baked-in white backgrounds, then pick tile bg from content colors
  const strippedSvg = logo.svg ? stripWhiteSvgBg(logo.svg) : null;
  const bgColor = strippedSvg ? tileBgForSvg(strippedSvg) : undefined;
  const isLightBg = bgColor?.includes("243");
  const ringColor = isLightBg ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)";

  const handleCopyLink = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!linkHref) return;
    const url = `${window.location.origin}${linkHref}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [linkHref]);

  const tile = (
    <div
      className="group relative aspect-square bg-neutral-800 transition-all duration-200 ease-out hover:z-20 hover:scale-[1.25] hover:rounded-md"
      style={{
        ...(bgColor ? { backgroundColor: bgColor } : {}),
        // @ts-expect-error CSS custom property
        "--ring": ringColor,
        boxShadow: "0 0 0 0px var(--ring)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 0 3px var(--ring)`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 0 0 0px var(--ring)`; }}
    >
      {strippedSvg ? (
        <div
          className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{
            __html: sanitizeSvg(strippedSvg),
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
          No image
        </div>
      )}
      {/* Copy link button */}
      {linkHref && (
        <button
          onClick={handleCopyLink}
          className="absolute top-1 right-1 z-30 rounded bg-black/60 p-1 text-white/70 opacity-0 transition-opacity duration-150 hover:text-white group-hover:opacity-100"
          title="Copy share link"
        >
          {copied ? (
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          )}
        </button>
      )}
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <p className="max-w-48 truncate whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-center text-[10px] text-white/90 backdrop-blur-sm">
          {logo.org || logo.domain || "Unknown"}
        </p>
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

const SORT_OPTIONS = [
  { value: "score", label: "Top Scored" },
  { value: "recent", label: "Most Recent" },
];

const MIN_SCORE_OPTIONS = [
  { value: "1", label: "Score 1+" },
  { value: "2", label: "Score 2+" },
  { value: "3", label: "Score 3+" },
  { value: "5", label: "Score 5+" },
  { value: "7", label: "Score 7+" },
];

export function GalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPage = parseInt(searchParams.get("page") ?? "1") || 1;

  const [sort, setSort] = useState(searchParams.get("sort") ?? "recent");
  const [minScore, setMinScore] = useState(searchParams.get("minScore") ?? "7");
  const [infiniteScroll, setInfiniteScroll] = useState(true);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    (p: number, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      if (!append) window.scrollTo({ top: 0, behavior: "smooth" });

      fetch(`/api/gallery?page=${p}&limit=${ITEMS_PER_PAGE}&sort=${sort}&minScore=${minScore}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load");
          return res.json();
        })
        .then((result: GalleryResponse) => {
          if (append) {
            setLogos((prev) => [...prev, ...result.logos]);
          } else {
            setLogos(result.logos);
          }
          setTotal(result.total);
          setPage(p);

          const params = new URLSearchParams();
          if (p > 1) params.set("page", String(p));
          if (sort !== "recent") params.set("sort", sort);
          if (minScore !== "7") params.set("minScore", minScore);
          const qs = params.toString();
          router.replace(qs ? `/gallery?${qs}` : "/gallery", { scroll: false });
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load gallery")
        )
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [router, sort, minScore]
  );

  // Refetch when sort/minScore changes
  useEffect(() => {
    setLogos([]);
    fetchPage(1);
  }, [fetchPage]);

  // Infinite scroll observer
  useEffect(() => {
    if (!infiniteScroll || loading || loadingMore) return;
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    if (page >= totalPages) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchPage(page + 1, true);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [infiniteScroll, loading, loadingMore, page, total, fetchPage]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">{error}</p>
        <button
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => fetchPage(page)}
        >
          Retry
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Gallery controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger size="sm" className="w-[130px]" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={minScore} onValueChange={setMinScore}>
          <SelectTrigger size="sm" className="w-[110px]" aria-label="Minimum score">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIN_SCORE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={infiniteScroll}
            onChange={(e) => setInfiniteScroll(e.target.checked)}
            className="rounded border-muted-foreground/30"
          />
          Infinite scroll
        </label>
      </div>

      {!loading && logos.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No logos found.
        </div>
      )}

      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-15 bg-neutral-800">
        {loading
          ? Array.from({ length: 60 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))
          : logos.map((logo, i) => (
              <LogoTile key={logo.org ?? `logo-${i}`} logo={logo} />
            ))}
        {loadingMore &&
          Array.from({ length: 30 }).map((_, i) => (
            <Skeleton key={`more-${i}`} className="aspect-square w-full" />
          ))}
      </div>

      {/* Infinite scroll sentinel */}
      {infiniteScroll && <div ref={sentinelRef} />}

      {/* Pagination (only when not infinite scrolling) */}
      {!infiniteScroll && !loading && totalPages > 1 && (
        <PaginationBar
          pagination={{
            page,
            limit: ITEMS_PER_PAGE,
            total,
            totalPages,
          }}
          onPageChange={(p) => fetchPage(p)}
          noun="logos"
        />
      )}
    </div>
  );
}
