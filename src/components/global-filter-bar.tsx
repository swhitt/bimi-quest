"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FilterChips, type FilterChip } from "@/components/filter-chips";
import { X, ListFilter, ChevronDown } from "lucide-react";
import { ALL_CA_SLUGS, CA_DISPLAY_NAMES, CA_SLUG_TO_NAME, ROOT_CA_OPTIONS } from "@/lib/ca-slugs";
import { ALL_MARK_TYPES } from "@/lib/mark-types";

const CERT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "VMC", label: "VMC" },
  { value: "CMC", label: "CMC" },
];

const MARK_OPTIONS = [
  { value: "all", label: "All Marks" },
  ...ALL_MARK_TYPES.map((m) => ({ value: m.value, label: m.title })),
];

const VALIDITY_OPTIONS = [
  { value: "all", label: "Any Status" },
  { value: "valid", label: "Valid" },
  { value: "expired", label: "Expired" },
];

const PRECERT_OPTIONS = [
  { value: "all", label: "Cert & Precert" },
  { value: "cert", label: "Certs Only" },
  { value: "precert", label: "Precerts Only" },
];

function FilterBarInner() {
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
  const caSlug = pathMatch ? pathMatch[1].toLowerCase() : "";
  const ca = caSlug ? (CA_SLUG_TO_NAME[caSlug] ?? "") : "";

  // Extract the base page path (strip /ca/slug and /page/N suffixes)
  function getBasePath(p: string): string {
    return p.replace(/\/page\/\d+$/, "").replace(/\/ca\/[^/]+$/, "") || "/";
  }

  // Build a URL preserving secondary filters, with the CA in the path
  const buildUrl = useCallback(
    (newCaSlug: string, updates?: Record<string, string | null>) => {
      const pagePath = getBasePath(pathname);
      const caSuffix = newCaSlug ? `/ca/${newCaSlug}` : "";
      const base = pagePath === "/" ? caSuffix || "/" : `${pagePath}${caSuffix}`;

      const params = new URLSearchParams(searchParams.toString());
      params.delete("ca");
      params.delete("page");

      if (updates) {
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "" || value === "all") {
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

  const clearFilters = useCallback(() => {
    router.push(getBasePath(pathname));
  }, [pathname, router]);

  // Don't show on validate or about pages
  if (pathname === "/validate" || pathname === "/privacy") return null;

  const rootCa = searchParams.get("root") ?? "all";
  const type = searchParams.get("type") ?? "all";
  const mark = searchParams.get("mark") ?? "all";
  const validity = searchParams.get("validity") ?? "all";
  const precert = searchParams.get("precert") ?? "all";
  const industry = searchParams.get("industry") ?? "all";
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const expiresFrom = searchParams.get("expiresFrom") ?? "";
  const expiresTo = searchParams.get("expiresTo") ?? "";

  const hasFilters =
    ca ||
    rootCa !== "all" ||
    type !== "all" ||
    mark !== "all" ||
    validity !== "all" ||
    precert !== "all" ||
    industry !== "all" ||
    dateFrom ||
    dateTo ||
    expiresFrom ||
    expiresTo;

  const filterCount =
    (ca ? 1 : 0) +
    (rootCa !== "all" ? 1 : 0) +
    (type !== "all" ? 1 : 0) +
    (mark !== "all" ? 1 : 0) +
    (validity !== "all" ? 1 : 0) +
    (precert !== "all" ? 1 : 0) +
    (industry !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (expiresFrom ? 1 : 0) +
    (expiresTo ? 1 : 0);

  // Count only filters that live inside the "More Filters" popover
  const secondaryFilterCount =
    (rootCa !== "all" ? 1 : 0) +
    (validity !== "all" ? 1 : 0) +
    (precert !== "all" ? 1 : 0) +
    (industry !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (expiresFrom ? 1 : 0) +
    (expiresTo ? 1 : 0);

  // Build chips for all active filters
  const chips: FilterChip[] = [];
  if (ca)
    chips.push({
      key: "ca",
      label: "Issuer",
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
  if (dateFrom)
    chips.push({
      key: "from",
      label: "Issued from",
      value: dateFrom,
      onRemove: () => updateSecondaryFilter("from", ""),
    });
  if (dateTo)
    chips.push({
      key: "to",
      label: "Issued to",
      value: dateTo,
      onRemove: () => updateSecondaryFilter("to", ""),
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

  // --- Shared filter controls (accept className override for mobile full-width) ---

  const caSelect = (className?: string) => (
    <Select value={caSlug || "all"} onValueChange={(v) => router.push(buildUrl(v === "all" ? "" : v))}>
      <SelectTrigger size="sm" aria-label="Filter by issuing CA" className={className ?? "w-[140px]"}>
        <SelectValue placeholder="All Issuers" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Issuers</SelectItem>
        {ALL_CA_SLUGS.map((slug) => (
          <SelectItem key={slug} value={slug}>
            {CA_DISPLAY_NAMES[slug]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const rootCaSelect = (className?: string) => (
    <Select value={rootCa} onValueChange={(v) => updateSecondaryFilter("root", v)}>
      <SelectTrigger size="sm" aria-label="Filter by root CA" className={className ?? "w-[140px]"}>
        <SelectValue placeholder="All Roots" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Roots</SelectItem>
        {ROOT_CA_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const typeSelect = (className?: string) => (
    <Select value={type} onValueChange={(v) => updateSecondaryFilter("type", v)}>
      <SelectTrigger size="sm" aria-label="Filter by certificate type" className={className ?? "w-[110px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CERT_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const markSelect = (className?: string) => (
    <Select value={mark} onValueChange={(v) => updateSecondaryFilter("mark", v)}>
      <SelectTrigger size="sm" aria-label="Filter by mark type" className={className ?? "w-[160px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MARK_OPTIONS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const validitySelect = (className?: string) => (
    <Select value={validity} onValueChange={(v) => updateSecondaryFilter("validity", v)}>
      <SelectTrigger size="sm" aria-label="Filter by validity status" className={className ?? "w-[120px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VALIDITY_OPTIONS.map((v) => (
          <SelectItem key={v.value} value={v.value}>
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const precertSelect = (className?: string) => (
    <Select value={precert} onValueChange={(v) => updateSecondaryFilter("precert", v)}>
      <SelectTrigger size="sm" aria-label="Filter by precertificate status" className={className ?? "w-[140px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRECERT_OPTIONS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const industrySelect = (className?: string) =>
    industryOptions.length > 0 ? (
      <Select value={industry} onValueChange={(v) => updateSecondaryFilter("industry", v)}>
        <SelectTrigger size="sm" aria-label="Filter by industry" className={className ?? "w-[170px]"}>
          <SelectValue placeholder="All Industries" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Industries</SelectItem>
          {industryOptions.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const dateRange = (fullWidth?: boolean) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider shrink-0">Issued</span>
      <Input
        type="date"
        value={dateFrom}
        onChange={(e) => updateSecondaryFilter("from", e.target.value)}
        aria-label="Issued from date"
        className={fullWidth ? "h-8 flex-1 text-xs" : "h-8 w-[130px] text-xs"}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={dateTo}
        onChange={(e) => updateSecondaryFilter("to", e.target.value)}
        aria-label="Issued to date"
        className={fullWidth ? "h-8 flex-1 text-xs" : "h-8 w-[130px] text-xs"}
      />
    </div>
  );

  const expiresRange = (fullWidth?: boolean) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider shrink-0">Expires</span>
      <Input
        type="date"
        value={expiresFrom}
        onChange={(e) => updateSecondaryFilter("expiresFrom", e.target.value)}
        aria-label="Expires from date"
        className={fullWidth ? "h-8 flex-1 text-xs" : "h-8 w-[130px] text-xs"}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={expiresTo}
        onChange={(e) => updateSecondaryFilter("expiresTo", e.target.value)}
        aria-label="Expires to date"
        className={fullWidth ? "h-8 flex-1 text-xs" : "h-8 w-[130px] text-xs"}
      />
    </div>
  );

  // --- Grouped secondary filters (reused in popover and mobile sheet) ---

  const secondaryFilters = (fullWidth?: boolean) => (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">Certificate</span>
        <div className={fullWidth ? "flex flex-col gap-2" : "flex items-center gap-2 flex-wrap"}>
          {rootCaSelect(fullWidth ? "w-full" : "w-[140px]")}
          {validitySelect(fullWidth ? "w-full" : "w-[120px]")}
          {precertSelect(fullWidth ? "w-full" : "w-[140px]")}
        </div>
      </div>
      <div>
        <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">Issued Date</span>
        {dateRange(fullWidth)}
      </div>
      <div>
        <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">Expiry Date</span>
        {expiresRange(fullWidth)}
      </div>
      {industryOptions.length > 0 && (
        <div>
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">Category</span>
          {industrySelect(fullWidth ? "w-full" : "w-[170px]")}
        </div>
      )}
    </div>
  );

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto px-4 py-2">
        {/* ===== Mobile: Sheet trigger ===== */}
        <div className="flex items-center justify-between md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={sheetOpen}
                aria-controls="filter-sheet"
              >
                <ListFilter className="size-4" />
                Filters
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
                      Issuer
                    </span>
                    {caSelect("w-full")}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                      Type
                    </span>
                    <div className="flex flex-col gap-2">
                      {typeSelect("w-full")}
                      {markSelect("w-full")}
                    </div>
                  </div>
                  {secondaryFilters(true)}
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
          {hasFilters && (
            <Button variant="ghost" size="xs" onClick={clearFilters} className="text-muted-foreground">
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>

        {/* ===== Desktop: Primary selects + More Filters popover ===== */}
        <div className="hidden md:flex items-center gap-2">
          <ListFilter className="size-4 text-muted-foreground shrink-0" />
          {caSelect()}
          {typeSelect()}
          {markSelect()}

          <div className="w-px h-5 bg-border shrink-0" />

          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                More Filters
                {secondaryFilterCount > 0 && (
                  <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full text-[10px] min-w-[18px] text-center leading-none">
                    {secondaryFilterCount}
                  </span>
                )}
                <ChevronDown className="size-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[480px] p-4"
              onInteractOutside={(e) => {
                // Don't close popover when interacting with Select dropdowns
                // (they portal outside the popover)
                const target = e.target as HTMLElement | null;
                if (target?.closest("[data-radix-select-content]")) {
                  e.preventDefault();
                }
              }}
            >
              {secondaryFilters()}
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="xs" onClick={clearFilters} className="text-muted-foreground">
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>

        {/* ===== Chips row (both mobile and desktop) ===== */}
        <FilterChips chips={chips} onClearAll={clearFilters} />
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
