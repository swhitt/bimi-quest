"use client";

import { ListFilter } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";
import { ChainLinkIcon } from "@/components/ui/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { domainSlug } from "@/lib/domain-slug";
import { errorMessage } from "@/lib/utils";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { isLightBg, stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";
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

export interface GalleryResponse {
  logos: Logo[];
  total: number;
  page: number;
  limit: number;
}

const ITEMS_PER_PAGE = 100;

/* ── Preset definitions ─────────────────────────────────────────────── */

type PresetKey = "recent" | "hall-of-fame" | "best-logos";

interface PresetConfig {
  sort: string;
  minScore?: number;
  maxScore?: number;
  minLogoQuality?: number;
  minColorRichness?: number;
}

const PRESETS: Record<PresetKey, PresetConfig> = {
  recent: { sort: "recent", minScore: 1 },
  "hall-of-fame": { sort: "quality", minScore: 5, minLogoQuality: 6 },
  "best-logos": { sort: "quality", minScore: 1, minLogoQuality: 6 },
};

const PRESET_LABELS: Record<PresetKey, string> = {
  recent: "Latest",
  "hall-of-fame": "Hall of Fame",
  "best-logos": "Best Logos",
};

const PRESET_DESCRIPTIONS: Record<PresetKey, string> = {
  recent: "Most recently issued certificates",
  "hall-of-fame": "Impressive logos from well-known brands",
  "best-logos": "High-quality logo designs across all brands",
};

const LEGACY_MAP: Record<string, PresetKey> = {
  showcase: "hall-of-fame",
  "full-color": "best-logos",
  "new-arrivals": "recent",
  "hidden-gems": "best-logos",
};

const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];

/* ── Filter option definitions ──────────────────────────────────────── */

interface FilterOption {
  value: string;
  label: string;
  min?: number;
  max?: number;
}

const NOTABILITY_OPTIONS: FilterOption[] = [
  { value: "any", label: "Any" },
  { value: "7+", label: "Famous (7+)", min: 7 },
  { value: "5+", label: "Well-known (5+)", min: 5 },
  { value: "3-6", label: "Mid-tier (3-6)", min: 3, max: 6 },
  { value: "1-4", label: "Obscure (1-4)", min: 1, max: 4 },
  { value: "1-2", label: "Unknown (1-2)", min: 1, max: 2 },
];

const LOGO_QUALITY_OPTIONS: FilterOption[] = [
  { value: "any", label: "Any" },
  { value: "8+", label: "Excellent (8+)", min: 8 },
  { value: "6+", label: "Good (6+)", min: 6 },
  { value: "4+", label: "Fair (4+)", min: 4 },
  { value: "1-3", label: "Poor (1-3)", min: 1, max: 3 },
];

const COLOR_RICHNESS_OPTIONS: FilterOption[] = [
  { value: "any", label: "Any" },
  { value: "8+", label: "Vibrant (8+)", min: 8 },
  { value: "6+", label: "Colorful (6+)", min: 6 },
  { value: "4+", label: "Some color (4+)", min: 4 },
  { value: "1-3", label: "Monochrome (1-3)", min: 1, max: 3 },
];

interface CustomFilters {
  notability: string;
  logoQuality: string;
  colorRichness: string;
}

const DEFAULT_FILTERS: CustomFilters = { notability: "any", logoQuality: "any", colorRichness: "any" };

/* ── Helpers ────────────────────────────────────────────────────────── */

function hasCustomFilters(f: CustomFilters): boolean {
  return f.notability !== "any" || f.logoQuality !== "any" || f.colorRichness !== "any";
}

/** Build API query params from either a preset or custom filters. */
function buildGalleryParams(preset: PresetKey | null, filters: CustomFilters): URLSearchParams {
  const p = new URLSearchParams();

  if (preset) {
    const cfg = PRESETS[preset];
    p.set("sort", cfg.sort);
    if (cfg.minScore != null) p.set("minScore", String(cfg.minScore));
    if (cfg.maxScore != null) p.set("maxScore", String(cfg.maxScore));
    if (cfg.minLogoQuality != null) p.set("minLogoQuality", String(cfg.minLogoQuality));
    if (cfg.minColorRichness != null) p.set("minColorRichness", String(cfg.minColorRichness));
  } else {
    // Custom mode: default sort is recent
    p.set("sort", "recent");

    const nota = NOTABILITY_OPTIONS.find((o) => o.value === filters.notability);
    if (nota?.min != null) p.set("minScore", String(nota.min));
    if (nota?.max != null) p.set("maxScore", String(nota.max));

    const lq = LOGO_QUALITY_OPTIONS.find((o) => o.value === filters.logoQuality);
    if (lq?.min != null) p.set("minLogoQuality", String(lq.min));

    const cr = COLOR_RICHNESS_OPTIONS.find((o) => o.value === filters.colorRichness);
    if (cr?.min != null) p.set("minColorRichness", String(cr.min));
  }

  return p;
}

/* ── LogoTile (unchanged except tooltip) ────────────────────────────── */

function LogoTile({ logo }: { logo: Logo }) {
  const linkHref = logo.fingerprint
    ? `/logo/${logo.fingerprint.slice(0, 16)}/${logo.domain ? domainSlug(logo.domain) : "logo"}`
    : null;
  const [copied, setCopied] = useState(false);
  const [lazyRef, isVisible] = useLazyRender<HTMLDivElement>("300px");

  const { bgColor, lightBg, strippedSvg } = useMemo(() => {
    const stripped = logo.svg ? stripWhiteSvgBg(logo.svg) : null;
    const bg = stripped ? tileBgForSvg(stripped) : undefined;
    const light = bg ? isLightBg(bg) : false;
    return {
      strippedSvg: stripped,
      bgColor: bg,
      lightBg: light,
    };
  }, [logo.svg]);

  const sanitizedHtml = useMemo(() => {
    if (!isVisible || !strippedSvg) return null;
    return sanitizeSvg(strippedSvg);
  }, [isVisible, strippedSvg]);

  const handleCopyLink = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!linkHref) return;
      const url = `${window.location.origin}${linkHref}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [linkHref],
  );

  const tile = (
    <div
      ref={lazyRef}
      className="group relative aspect-square bg-neutral-800 transition-all duration-200 ease-out hover:z-20 hover:ring-2 hover:ring-primary/50"
      style={bgColor ? { backgroundColor: bgColor } : undefined}
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
        <div
          className="h-full w-full animate-pulse rounded-sm"
          style={{
            backgroundColor: lightBg ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
          }}
        />
      )}
      {linkHref && (
        <button
          onClick={handleCopyLink}
          className="absolute top-1 right-1 z-30 rounded bg-black/60 p-1 text-white/70 opacity-0 transition-opacity duration-150 hover:text-white group-hover:opacity-100"
          title="Copy share link"
        >
          {copied ? (
            <svg
              className="size-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <ChainLinkIcon />
          )}
        </button>
      )}
      {/* Persistent mobile org label (touch devices lack hover) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1 sm:hidden">
        <span className="text-[9px] text-white/90 line-clamp-1">{logo.org || logo.domain || "?"}</span>
      </div>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-1/2 bottom-full z-40 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <div className="rounded bg-black/90 px-2 py-1.5 backdrop-blur-sm text-[10px] leading-tight whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-white">{(logo.org || logo.domain || "?").slice(0, 28)}</span>
            {logo.certType && (
              <span
                className={`px-1 py-px rounded text-[9px] font-medium ${
                  logo.certType === "VMC" ? "bg-blue-500/40 text-blue-200" : "bg-purple-500/40 text-purple-200"
                }`}
              >
                {logo.certType}
              </span>
            )}
            {logo.score != null && (
              <span className="text-gray-400 tabular-nums" title="Notability score">
                ★ {logo.score}/10
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 text-gray-400 max-w-64 sm:max-w-80">
            <span className="truncate">{[logo.domain, logo.issuer].filter(Boolean).join(" · ")}</span>
            {logo.ctLogTimestamp && (
              <span className="shrink-0 text-gray-500">
                {" "}
                · {new Date(logo.ctLogTimestamp).toLocaleDateString("en-CA")}
              </span>
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

/* ── GalleryContent ─────────────────────────────────────────────────── */

export function GalleryContent({ initialLogos, initialTotal }: { initialLogos?: Logo[]; initialTotal?: number }) {
  const searchParams = useSearchParams();
  const { buildApiParams } = useGlobalFilters();
  const filterQuery = buildApiParams();
  const initialPage = parseInt(searchParams.get("page") ?? "1") || 1;

  // Resolve initial preset from URL ?view= param
  const initPreset = (() => {
    const v = searchParams.get("view");
    if (v && v in PRESETS) return v as PresetKey;
    if (v && v in LEGACY_MAP) return LEGACY_MAP[v];
    // No view param and no legacy sort/score params → default to recent
    if (!searchParams.get("sort") && !searchParams.get("minScore")) return "recent" as PresetKey;
    return null;
  })();

  const [activePreset, setActivePreset] = useState<PresetKey | null>(initPreset);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customFilters, setCustomFilters] = useState<CustomFilters>(DEFAULT_FILTERS);
  const [dedupSvg, setDedupSvg] = useState(searchParams.get("unique") !== "0");
  const [infiniteScroll, setInfiniteScroll] = useState(true);
  const [logos, setLogos] = useState<Logo[]>(initialLogos ?? []);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(!initialLogos);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasInitialData = useRef(!!initialLogos);

  const fetchPage = useCallback(
    (p: number, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      if (!append) window.scrollTo({ top: 0, behavior: "smooth" });

      const galleryParams = buildGalleryParams(activePreset, customFilters);
      const localParams = new URLSearchParams(filterQuery);
      // Merge gallery-specific params
      for (const [k, v] of galleryParams) localParams.set(k, v);
      localParams.set("page", String(p));
      localParams.set("limit", String(ITEMS_PER_PAGE));
      if (dedupSvg) localParams.set("dedupSvg", "true");

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

          // Update URL: ?view=<preset> for presets, nothing for custom
          const urlParams = new URLSearchParams();
          if (activePreset) urlParams.set("view", activePreset);
          if (dedupSvg) urlParams.set("unique", "1");
          const basePath = window.location.pathname.replace(/\/page\/\d+$/, "");
          const pageSuffix = p > 1 ? `/page/${p}` : "";
          const qs = urlParams.toString();
          window.history.replaceState(null, "", `${basePath}${pageSuffix}${qs ? `?${qs}` : ""}`);
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [activePreset, customFilters, dedupSvg, filterQuery],
  );

  // Refetch when preset/filters/dedup change
  useEffect(() => {
    // Skip the first fetch if the server provided initial data
    if (hasInitialData.current) {
      hasInitialData.current = false;
      return;
    }
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
      { rootMargin: "1200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [infiniteScroll, loading, loadingMore, page, total, fetchPage]);

  const handlePresetClick = useCallback((key: PresetKey) => {
    setActivePreset(key);
    setCustomFilters(DEFAULT_FILTERS);
  }, []);

  const handleFilterChange = useCallback((field: keyof CustomFilters, value: string) => {
    setActivePreset(null);
    setCustomFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

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
  const isCustom = hasCustomFilters(customFilters);

  return (
    <div className="space-y-4">
      {/* Gallery controls */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset tabs */}
          <div className="flex items-center gap-1">
            {PRESET_KEYS.map((key) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handlePresetClick(key)}
                    aria-pressed={activePreset === key}
                    className={`rounded px-3 py-2 text-xs font-medium transition-colors ${
                      activePreset === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    {PRESET_LABELS[key]}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{PRESET_DESCRIPTIONS[key]}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Gear icon for advanced filters */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            aria-pressed={filtersOpen}
            className={`relative rounded-md p-1.5 transition-colors ${
              filtersOpen
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Advanced filters"
          >
            <ListFilter className="size-4" />
            {isCustom && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />}
          </button>

          {/* Right-aligned checkboxes */}
          <div className="ml-auto flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="flex items-center gap-1.5 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dedupSvg}
                    onChange={(e) => setDedupSvg(e.target.checked)}
                    className="size-4 rounded border-muted-foreground/30"
                  />
                  Unique logos
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom">Hide duplicate logos that appear on multiple certificates</TooltipContent>
            </Tooltip>
            <label className="flex items-center gap-1.5 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={infiniteScroll}
                onChange={(e) => setInfiniteScroll(e.target.checked)}
                className="size-4 rounded border-muted-foreground/30"
              />
              Infinite scroll
            </label>
          </div>
        </div>

        {/* Collapsible filter row */}
        {filtersOpen && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground shrink-0 cursor-default border-b border-dotted border-muted-foreground/40">
                    Brand notability:
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">How well-known the company is (1-10)</TooltipContent>
              </Tooltip>
              <Select value={customFilters.notability} onValueChange={(v) => handleFilterChange("notability", v)}>
                <SelectTrigger size="sm" className="w-full sm:w-[140px]" aria-label="Brand notability filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTABILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground shrink-0 cursor-default border-b border-dotted border-muted-foreground/40">
                    Logo quality:
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Design quality and detail of the SVG logo (1-10)</TooltipContent>
              </Tooltip>
              <Select value={customFilters.logoQuality} onValueChange={(v) => handleFilterChange("logoQuality", v)}>
                <SelectTrigger size="sm" className="w-full sm:w-[140px]" aria-label="Logo quality filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_QUALITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground shrink-0 cursor-default border-b border-dotted border-muted-foreground/40">
                    Color richness:
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">How colorful vs monochrome the logo is (1-10)</TooltipContent>
              </Tooltip>
              <Select value={customFilters.colorRichness} onValueChange={(v) => handleFilterChange("colorRichness", v)}>
                <SelectTrigger size="sm" className="w-full sm:w-[140px]" aria-label="Color richness filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_RICHNESS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {!loading && logos.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">No logos found.</div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 bg-neutral-800">
        {loading
          ? Array.from({ length: 60 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)
          : logos.map((logo, i) => <LogoTile key={`${logo.svgHash}-${logo.fingerprint || i}`} logo={logo} />)}
        {loadingMore &&
          Array.from({ length: 30 }).map((_, i) => <Skeleton key={`more-${i}`} className="aspect-square w-full" />)}
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
