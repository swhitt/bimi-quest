"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, Link2, ListFilter, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildHydratedUrl,
  buildShareUrl,
  hasAnyFilterParams,
  loadFilterState,
  saveFilterState,
} from "@/lib/filter-storage";
import { type FilterChip, FilterChips } from "@/components/filter-chips";
import { DateRangeFilter } from "@/components/date-range-filter";
import { FilterPanel } from "@/components/filter-panel";
import {
  CASelect,
  CountrySelect,
  IndustrySelect,
  MARK_OPTIONS,
  MarkSelect,
  PrecertSelect,
  ROOT_CA_OPTIONS,
  RootCASelect,
  TypeSelect,
  ValiditySelect,
} from "@/components/filter-selects";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CA_DISPLAY_NAMES, CA_SLUG_TO_NAME } from "@/lib/ca-slugs";
import { getDefaultFromDateISO } from "@/lib/default-dates";

/** Gate component: skip rendering (and all hooks/fetches) on pages where filters don't apply. */
const HIDDEN_PATHS = ["/check", "/privacy", "/transparency"];
const HIDDEN_PREFIXES = ["/ct/", "/tools/"];

function FilterBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const lastHydratedBase = useRef("");

  const isHidden = HIDDEN_PATHS.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isHidden) return;

    const basePath = pathname.replace(/\/page\/\d+$/, "").replace(/\/ca\/[^/]+$/, "") || "/";
    if (lastHydratedBase.current === basePath) return;
    lastHydratedBase.current = basePath;

    if (hasAnyFilterParams(searchParams, pathname)) return;

    const stored = loadFilterState();
    if (!stored) return;

    const url = buildHydratedUrl(pathname, stored);
    if (url) router.replace(url);
  }, [pathname, searchParams, router, isHidden]);

  if (isHidden) return null;
  return <FilterBarContent />;
}

/** Extract the base page path (strip /ca/slug and /page/N suffixes). */
function getBasePath(p: string): string {
  return p.replace(/\/page\/\d+$/, "").replace(/\/ca\/[^/]+$/, "") || "/";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function FilterBarContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/stats/industries")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.industries)) {
          setIndustryOptions(
            d.industries.map((i: { industry: string; count: number }) => ({
              value: i.industry,
              label: i.industry,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Read CA from /{page}/ca/{slug} pattern
  const pathMatch = pathname.match(/\/ca\/([^/]+)/);

  // Pages where CA goes in query param instead of path
  const basePath = getBasePath(pathname);
  const useQueryCa = basePath === "/domains";

  const caSlug = pathMatch ? pathMatch[1].toLowerCase() : useQueryCa ? (searchParams.get("ca") ?? "") : "";
  const ca = caSlug ? (CA_SLUG_TO_NAME[caSlug] ?? "") : "";

  // Persist filter state to sessionStorage for cross-page navigation
  useEffect(() => {
    if (hasAnyFilterParams(searchParams, pathname)) {
      saveFilterState(searchParams, caSlug);
    }
  }, [searchParams, pathname, caSlug]);

  const copyShareUrl = useCallback(() => {
    const url = buildShareUrl(pathname, searchParams, caSlug);
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Share URL copied");
    });
  }, [pathname, searchParams, caSlug]);

  const buildUrl = useCallback(
    (newCaSlug: string, updates?: Record<string, string | null>) => {
      const pagePath = getBasePath(pathname);
      const queryMode = pagePath === "/domains";
      const caSuffix = !queryMode && newCaSlug ? `/ca/${newCaSlug}` : "";
      const base = pagePath === "/" ? caSuffix || "/" : `${pagePath}${caSuffix}`;

      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");

      if (queryMode) {
        if (newCaSlug && newCaSlug !== "all") params.set("ca", newCaSlug);
        else params.delete("ca");
      } else {
        params.delete("ca");
      }

      if (updates) {
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "") {
            params.delete(key);
          } else if (value === "all" && key !== "from") {
            params.delete(key);
          } else {
            params.set(key, value);
          }
        }
      }

      const qs = params.toString();
      return qs ? `${base}?${qs}` : base;
    },
    [pathname, searchParams],
  );

  const updateSecondaryFilter = useCallback(
    (key: string, value: string) => {
      router.push(buildUrl(caSlug, { [key]: value }));
    },
    [router, buildUrl, caSlug],
  );

  const updateMultipleFilters = useCallback(
    (updates: Record<string, string | null>) => {
      router.push(buildUrl(caSlug, updates));
    },
    [router, buildUrl, caSlug],
  );

  const clearFilters = useCallback(() => {
    router.push(getBasePath(pathname));
  }, [pathname, router]);

  const rootCa = searchParams.get("root") ?? "all";
  const type = searchParams.get("type") ?? "all";
  const mark = searchParams.get("mark") ?? "all";
  const validity = searchParams.get("validity") ?? "all";
  const precert = searchParams.get("precert") ?? "all";
  const industry = searchParams.get("industry") ?? "all";
  const country = searchParams.get("country") ?? "";
  const fromRaw = searchParams.get("from");
  const dateFrom = fromRaw === "all" ? "" : (fromRaw ?? getDefaultFromDateISO());
  const dateTo = searchParams.get("to") ?? "";
  const expiresFrom = searchParams.get("expiresFrom") ?? "";
  const expiresTo = searchParams.get("expiresTo") ?? "";
  const ctFrom = searchParams.get("ctFrom") ?? "";
  const ctTo = searchParams.get("ctTo") ?? "";
  const dow = searchParams.get("dow") ?? "";
  const hour = searchParams.get("hour") ?? "";
  const timeCol = searchParams.get("timeCol") ?? "";

  const hasExplicitFrom = fromRaw !== null && fromRaw !== "all";
  const hasFilters =
    ca ||
    rootCa !== "all" ||
    type !== "all" ||
    mark !== "all" ||
    validity !== "all" ||
    precert !== "all" ||
    industry !== "all" ||
    country ||
    hasExplicitFrom ||
    dateTo ||
    expiresFrom ||
    expiresTo ||
    ctFrom ||
    ctTo ||
    dow ||
    hour;

  const filterCount =
    (ca ? 1 : 0) +
    (rootCa !== "all" ? 1 : 0) +
    (type !== "all" ? 1 : 0) +
    (mark !== "all" ? 1 : 0) +
    (validity !== "all" ? 1 : 0) +
    (precert !== "all" ? 1 : 0) +
    (industry !== "all" ? 1 : 0) +
    (country ? 1 : 0) +
    (hasExplicitFrom || dateTo ? 1 : 0) +
    (expiresFrom || expiresTo ? 1 : 0) +
    (ctFrom || ctTo ? 1 : 0) +
    (dow || hour ? 1 : 0);

  // Count filters inside the "More Filters" panel
  const secondaryFilterCount =
    (rootCa !== "all" ? 1 : 0) +
    (validity !== "all" ? 1 : 0) +
    (precert !== "all" ? 1 : 0) +
    (industry !== "all" ? 1 : 0) +
    (country ? 1 : 0) +
    (hasExplicitFrom || dateTo ? 1 : 0) +
    (expiresFrom || expiresTo ? 1 : 0) +
    (ctFrom || ctTo ? 1 : 0);

  // Build chips for all active filters
  const chips: FilterChip[] = [];
  if (ca)
    chips.push({
      key: "ca",
      label: "Intermediate CA",
      value: CA_DISPLAY_NAMES[caSlug] ?? ca,
      onRemove: () => router.push(buildUrl("", {})),
    });
  if (type !== "all")
    chips.push({
      key: "type",
      label: "Type",
      value: type,
      onRemove: () => updateSecondaryFilter("type", "all"),
    });
  if (mark !== "all")
    chips.push({
      key: "mark",
      label: "Mark",
      value: MARK_OPTIONS.find((m) => m.value === mark)?.label ?? mark,
      onRemove: () => updateSecondaryFilter("mark", "all"),
    });
  if (rootCa !== "all")
    chips.push({
      key: "root",
      label: "Root",
      value: ROOT_CA_OPTIONS.find((o) => o.value === rootCa)?.label ?? rootCa,
      onRemove: () => updateSecondaryFilter("root", "all"),
    });
  if (validity !== "all")
    chips.push({
      key: "validity",
      label: "Status",
      value: validity === "valid" ? "Valid" : "Expired",
      onRemove: () => updateSecondaryFilter("validity", "all"),
    });
  if (precert !== "all")
    chips.push({
      key: "precert",
      label: "Precert",
      value: precert === "cert" ? "Certs Only" : "Precerts Only",
      onRemove: () => updateSecondaryFilter("precert", "all"),
    });
  if (industry !== "all")
    chips.push({
      key: "industry",
      label: "Industry",
      value: industry,
      onRemove: () => updateSecondaryFilter("industry", "all"),
    });
  if (country)
    chips.push({
      key: "country",
      label: "Country",
      value: country,
      onRemove: () => updateSecondaryFilter("country", ""),
    });
  if (dateFrom) {
    const isDefault = fromRaw === null;
    chips.push({
      key: "from",
      label: isDefault ? "Showing" : "Issued from",
      value: isDefault ? "past 12 months" : dateFrom,
      onRemove: () => updateMultipleFilters({ from: "all" }),
    });
  }
  if (dateTo)
    chips.push({
      key: "to",
      label: "Issued to",
      value: dateTo,
      onRemove: () => updateSecondaryFilter("to", ""),
    });
  if (ctFrom)
    chips.push({
      key: "ctFrom",
      label: "CT log from",
      value: ctFrom,
      onRemove: () => updateSecondaryFilter("ctFrom", ""),
    });
  if (ctTo)
    chips.push({
      key: "ctTo",
      label: "CT log to",
      value: ctTo,
      onRemove: () => updateSecondaryFilter("ctTo", ""),
    });
  if (expiresFrom)
    chips.push({
      key: "expiresFrom",
      label: "Expires from",
      value: expiresFrom,
      onRemove: () => updateSecondaryFilter("expiresFrom", ""),
    });
  if (expiresTo)
    chips.push({
      key: "expiresTo",
      label: "Expires to",
      value: expiresTo,
      onRemove: () => updateSecondaryFilter("expiresTo", ""),
    });
  // DOW/hour drilldown chip
  if (dow || hour) {
    const colLabel = timeCol === "ctLogTimestamp" ? "CT log" : "Issuance";
    const dayLabel = dow ? DAY_NAMES[parseInt(dow) - 1] : "";
    const hourLabel = hour
      ? `${hour.padStart(2, "0")}:00\u2013${String((parseInt(hour) + 1) % 24).padStart(2, "0")}:00 UTC`
      : "";
    chips.push({
      key: "dow-hour",
      label: colLabel,
      value: [dayLabel, hourLabel].filter(Boolean).join(" "),
      onRemove: () => updateMultipleFilters({ dow: null, hour: null, timeCol: null }),
    });
  }

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto px-4 py-2">
        {/* ===== Mobile: Sheet trigger + inline chips ===== */}
        <div className="flex items-center gap-2 md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="flex items-center gap-1 shrink-0 text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={sheetOpen}
                aria-controls="filter-sheet"
              >
                <ListFilter className="size-4" />
                {filterCount > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {filterCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh]">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1 px-4 pb-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Intermediate CA
                    </span>
                    <CASelect
                      value={caSlug}
                      onChange={(v) => router.push(buildUrl(v === "all" ? "" : v))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Type
                    </span>
                    <div className="flex flex-col gap-2">
                      <TypeSelect value={type} onChange={(v) => updateSecondaryFilter("type", v)} className="w-full" />
                      <MarkSelect value={mark} onChange={(v) => updateSecondaryFilter("mark", v)} className="w-full" />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Certificate
                    </span>
                    <div className="flex flex-col gap-2">
                      <RootCASelect
                        value={rootCa}
                        onChange={(v) => updateSecondaryFilter("root", v)}
                        className="w-full"
                      />
                      <ValiditySelect
                        value={validity}
                        onChange={(v) => updateSecondaryFilter("validity", v)}
                        className="w-full"
                      />
                      <PrecertSelect
                        value={precert}
                        onChange={(v) => updateSecondaryFilter("precert", v)}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Issued Date
                    </span>
                    <DateRangeFilter
                      direction="past"
                      currentFrom={dateFrom}
                      currentTo={dateTo}
                      fromKey="from"
                      toKey="to"
                      fromLabel="Issued from date"
                      toLabel="Issued to date"
                      onCommit={(key, value) => {
                        if (key === "from" && !value) {
                          updateMultipleFilters({ from: "all" });
                        } else {
                          updateSecondaryFilter(key, value);
                        }
                      }}
                      onMultiUpdate={(updates) => {
                        if ("from" in updates && !updates.from) {
                          updateMultipleFilters({ ...updates, from: "all" });
                        } else {
                          updateMultipleFilters(updates);
                        }
                      }}
                      fullWidth
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      CT Log Date
                    </span>
                    <DateRangeFilter
                      direction="past"
                      currentFrom={ctFrom}
                      currentTo={ctTo}
                      fromKey="ctFrom"
                      toKey="ctTo"
                      fromLabel="CT log from date"
                      toLabel="CT log to date"
                      onCommit={updateSecondaryFilter}
                      onMultiUpdate={updateMultipleFilters}
                      fullWidth
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Expiry Date
                    </span>
                    <DateRangeFilter
                      direction="future"
                      currentFrom={expiresFrom}
                      currentTo={expiresTo}
                      fromKey="expiresFrom"
                      toKey="expiresTo"
                      fromLabel="Expires from date"
                      toLabel="Expires to date"
                      onCommit={updateSecondaryFilter}
                      onMultiUpdate={updateMultipleFilters}
                      fullWidth
                    />
                  </div>
                  {industryOptions.length > 0 && (
                    <div>
                      <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                        Industry
                      </span>
                      <IndustrySelect
                        value={industry}
                        onChange={(v) => updateSecondaryFilter("industry", v)}
                        options={industryOptions}
                        className="w-full"
                      />
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Country
                    </span>
                    <CountrySelect
                      value={country}
                      onChange={(v) => updateSecondaryFilter("country", v)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              {hasFilters && (
                <div className="px-4 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      clearFilters();
                      setSheetOpen(false);
                    }}
                    className="w-full"
                  >
                    <X className="size-3 mr-1" />
                    Clear all filters
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
          <div className="flex-1 min-w-0 overflow-x-auto">
            <FilterChips chips={chips} onClearAll={clearFilters} />
          </div>
          {chips.length > 0 && (
            <button
              onClick={copyShareUrl}
              className="shrink-0 rounded p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Copy share link"
              title="Copy share link with current filters"
            >
              <Link2 className="size-3.5" />
            </button>
          )}
        </div>

        {/* ===== Desktop: Primary selects + More Filters toggle ===== */}
        <div className="hidden md:flex items-center gap-2">
          <ListFilter className="size-4 text-muted-foreground shrink-0" />
          <CASelect value={caSlug} onChange={(v) => router.push(buildUrl(v === "all" ? "" : v))} />
          <TypeSelect value={type} onChange={(v) => updateSecondaryFilter("type", v)} />
          <MarkSelect value={mark} onChange={(v) => updateSecondaryFilter("mark", v)} />

          <div className="w-px h-5 bg-border shrink-0" />

          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setMoreOpen(!moreOpen)}>
            More Filters
            {secondaryFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full text-[10px] min-w-[18px] text-center leading-none">
                {secondaryFilterCount}
              </span>
            )}
            <ChevronDown className={cn("size-3 opacity-50 transition-transform", moreOpen && "rotate-180")} />
          </Button>
        </div>

        {/* ===== Chips row (desktop only) ===== */}
        <div className="hidden md:flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <FilterChips chips={chips} onClearAll={clearFilters} />
          </div>
          {chips.length > 0 && (
            <button
              onClick={copyShareUrl}
              className="mt-1.5 shrink-0 rounded p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Copy share link"
              title="Copy share link with current filters"
            >
              <Link2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ===== Desktop slide-down filter panel ===== */}
      <div className="hidden md:block">
        <FilterPanel
          open={moreOpen}
          rootCa={rootCa}
          validity={validity}
          precert={precert}
          industry={industry}
          industryOptions={industryOptions}
          country={country}
          dateFrom={dateFrom}
          dateTo={dateTo}
          ctFrom={ctFrom}
          ctTo={ctTo}
          expiresFrom={expiresFrom}
          expiresTo={expiresTo}
          onFilterChange={updateSecondaryFilter}
          onMultiUpdate={updateMultipleFilters}
        />
      </div>
    </div>
  );
}

export function GlobalFilterBar() {
  return (
    <Suspense fallback={null}>
      <FilterBarInner />
    </Suspense>
  );
}
