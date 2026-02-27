"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

  // Strip baked-in white backgrounds, then pick tile bg from content colors
  const strippedSvg = logo.svg ? stripWhiteSvgBg(logo.svg) : null;
  const bgColor = strippedSvg ? tileBgForSvg(strippedSvg) : undefined;
  const lightBg = bgColor ? isLightBg(bgColor) : false;
  const ringColor = lightBg ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)";

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
        <div className="w-60 rounded bg-black/85 px-2.5 py-2 backdrop-blur-sm space-y-1">
          <div className="font-semibold text-white text-xs leading-tight line-clamp-2">
            {logo.org || logo.domain || "Unknown"}
          </div>
          <div className="flex items-center justify-between gap-2">
            {logo.certType && (
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                logo.certType === "VMC"
                  ? "bg-blue-500/40 text-blue-100"
                  : "bg-purple-500/40 text-purple-100"
              }`}>
                {logo.certType}
              </span>
            )}
            {logo.score != null && (
              <span className="text-[10px] text-gray-300 whitespace-nowrap tabular-nums">
                {logo.score}/10
              </span>
            )}
          </div>
          {logo.domain && (
            <div className="text-[10px] text-gray-300 truncate">{logo.domain}</div>
          )}
          {logo.issuer && (
            <div className="text-[10px] text-gray-400 truncate">{logo.issuer}</div>
          )}
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

      fetch(`/api/logos?page=${p}&limit=${ITEMS_PER_PAGE}&sort=${sort}&minScore=${minScore}`)
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
          if (sort !== "recent") params.set("sort", sort);
          if (minScore !== "7") params.set("minScore", minScore);
          const pageSuffix = p > 1 ? `/page/${p}` : "";
          const qs = params.toString();
          router.replace(`/logos${pageSuffix}${qs ? `?${qs}` : ""}`, { scroll: false });
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
