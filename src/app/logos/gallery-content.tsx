"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { stripWhiteSvgBg, tileBgForSvg, isLightBg } from "@/lib/svg-bg";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/pagination-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { useLazyRender } from "@/lib/use-lazy-render";

interface Logo {
  fingerprint: string;
  svgHash: string;
  svg: string | null;
  org: string | null;
  domain: string | null;
  certType: string | null;
  issuer: string | null;
  rootCa: string | null;
  score: number | null;
  logoQuality: number | null;
  ctLogTimestamp: string | null;
  count: number;
}

interface GalleryResponse {
  logos: Logo[];
  total: number;
  page: number;
  limit: number;
}

const ITEMS_PER_PAGE = 100;

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
  const [lazyRef, isVisible] = useLazyRender<HTMLDivElement>("300px");

  // Compute background color eagerly so the placeholder matches the final tile color.
  // These are cheap regex scans compared to DOMPurify sanitization + DOM insertion.
  const { bgColor, lightBg, ringColor, strippedSvg } = useMemo(() => {
    const stripped = logo.svg ? stripWhiteSvgBg(logo.svg) : null;
    const bg = stripped ? tileBgForSvg(stripped) : undefined;
    const light = bg ? isLightBg(bg) : false;
    return {
      strippedSvg: stripped,
      bgColor: bg,
      lightBg: light,
      ringColor: light ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)",
    };
  }, [logo.svg]);

  // Defer the expensive DOMPurify sanitization until the tile is in view
  const sanitizedHtml = useMemo(() => {
    if (!isVisible || !strippedSvg) return null;
    return sanitizeSvg(strippedSvg);
  }, [isVisible, strippedSvg]);

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
      ref={lazyRef}
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
      {isVisible ? (
        sanitizedHtml ? (
          <div
            className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
            No image
          </div>
        )
      ) : (
        /* Placeholder: colored box matching final bg, with a subtle shimmer */
        <div className="h-full w-full animate-pulse rounded-sm" style={{
          backgroundColor: lightBg ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
        }} />
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
      {/* Tooltip — positioned above tile to avoid z-fight with scaled tile */}
      <div className="pointer-events-none absolute left-1/2 bottom-full z-40 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <div className="rounded bg-black/90 px-2 py-1.5 backdrop-blur-sm text-[10px] leading-tight whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-white">{(logo.org || logo.domain || "?").slice(0, 28)}</span>
            {logo.certType && (
              <span className={`px-1 py-px rounded text-[9px] font-medium ${
                logo.certType === "VMC" ? "bg-blue-500/40 text-blue-200" : "bg-purple-500/40 text-purple-200"
              }`}>{logo.certType}</span>
            )}
            {logo.score != null && (
              <span className="text-gray-400 tabular-nums" title="Notability score: brand recognition and email volume">★ {logo.score}/10</span>
            )}
            {logo.logoQuality != null && (
              <span className="text-gray-400 tabular-nums" title="Logo visual quality score">◆ {logo.logoQuality}/10</span>
            )}
          </div>
          <div className="text-gray-400 truncate max-w-52">
            {[logo.domain, logo.issuer, logo.ctLogTimestamp ? new Date(logo.ctLogTimestamp).toLocaleDateString("en-CA") : null].filter(Boolean).join(" · ")}
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

const SORT_OPTIONS = [
  { value: "score", label: "Top Scored" },
  { value: "quality", label: "Best Logos" },
  { value: "recent", label: "Most Recent" },
];

const SCORE_RANGE_OPTIONS = [
  { value: "1-10", label: "All (1-10)", min: 1, max: 10 },
  { value: "7-10", label: "Top (7-10)", min: 7, max: 10 },
  { value: "5-10", label: "High (5+)", min: 5, max: 10 },
  { value: "3-6", label: "Mid (3-6)", min: 3, max: 6 },
  { value: "1-3", label: "Low (1-3)", min: 1, max: 3 },
  { value: "1-2", label: "Bottom (1-2)", min: 1, max: 2 },
];

export function GalleryContent() {
  const searchParams = useSearchParams();
  const { buildApiParams } = useGlobalFilters();
  const filterQuery = buildApiParams();
  const initialPage = parseInt(searchParams.get("page") ?? "1") || 1;

  const [sort, setSort] = useState(searchParams.get("sort") ?? "recent");
  const initRange = (() => {
    const min = searchParams.get("minScore");
    const max = searchParams.get("maxScore");
    if (min && max) return `${min}-${max}`;
    if (min) return `${min}-10`;
    return "5-10";
  })();
  const [scoreRange, setScoreRange] = useState(initRange);
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

      const range = SCORE_RANGE_OPTIONS.find((o) => o.value === scoreRange) ?? SCORE_RANGE_OPTIONS[2];
      const localParams = new URLSearchParams(filterQuery);
      localParams.set("page", String(p));
      localParams.set("limit", String(ITEMS_PER_PAGE));
      localParams.set("sort", sort);
      localParams.set("minScore", String(range.min));
      if (range.max < 10) localParams.set("maxScore", String(range.max));
      fetch(`/api/logos?${localParams}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load");
          return res.json();
        })
        .then((result: GalleryResponse) => {
          if (append) {
            setLogos((prev) => {
              const seen = new Set(prev.map((l) => l.fingerprint));
              const fresh = result.logos.filter((l) => !seen.has(l.fingerprint));
              return [...prev, ...fresh];
            });
          } else {
            setLogos(result.logos);
          }
          setTotal(result.total);
          setPage(p);

          // Update URL without triggering Next.js navigation (avoids middleware re-render)
          const params = new URLSearchParams();
          if (sort !== "recent") params.set("sort", sort);
          if (scoreRange !== "5-10") params.set("score", scoreRange);
          const basePath = window.location.pathname.replace(/\/page\/\d+$/, "");
          const pageSuffix = p > 1 ? `/page/${p}` : "";
          const qs = params.toString();
          window.history.replaceState(null, "", `${basePath}${pageSuffix}${qs ? `?${qs}` : ""}`);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load gallery")
        )
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [sort, scoreRange, filterQuery]
  );

  // Refetch when sort/minScore/filters change
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
      { rootMargin: "1200px" }
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

        <Select value={scoreRange} onValueChange={setScoreRange}>
          <SelectTrigger size="sm" className="w-[130px]" aria-label="Score range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCORE_RANGE_OPTIONS.map((o) => (
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
              <LogoTile key={`${logo.svgHash}-${logo.fingerprint || i}`} logo={logo} />
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
