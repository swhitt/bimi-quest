"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, SlidersHorizontal } from "lucide-react";
import {
  ALL_CA_SLUGS,
  CA_DISPLAY_NAMES,
  CA_SLUG_TO_NAME,
  ROOT_CA_OPTIONS,
} from "@/lib/ca-slugs";
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
  const [isOpen, setIsOpen] = useState(false);
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
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Read CA from path segment /ca/slug
  const pathMatch = pathname.match(/^\/ca\/([^/]+)/);
  const caSlug = pathMatch ? pathMatch[1].toLowerCase() : "";
  const ca = caSlug ? (CA_SLUG_TO_NAME[caSlug] ?? "") : "";

  // Build a URL preserving secondary filters, with the CA in the path
  const buildUrl = useCallback(
    (newCaSlug: string, updates?: Record<string, string | null>) => {
      // Strip /page/N suffix and /ca/slug prefix to get the base page path
      let pagePath = pathname.replace(/\/page\/\d+$/, "");
      if (pagePath.startsWith("/ca/")) {
        const segs = pagePath.split("/").filter(Boolean);
        pagePath = "/" + segs.slice(2).join("/");
        if (pagePath === "/") pagePath = "/";
      }

      const base = newCaSlug
        ? `/ca/${newCaSlug}${pagePath === "/" ? "" : pagePath}`
        : pagePath;

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
    [pathname, searchParams]
  );

  const updateSecondaryFilter = useCallback(
    (key: string, value: string) => {
      router.push(buildUrl(caSlug, { [key]: value }));
    },
    [router, buildUrl, caSlug]
  );

  const clearFilters = useCallback(() => {
    let pagePath = pathname.replace(/\/page\/\d+$/, "");
    if (pagePath.startsWith("/ca/")) {
      const segs = pagePath.split("/").filter(Boolean);
      pagePath = "/" + segs.slice(2).join("/");
      if (pagePath === "/") pagePath = "/";
    }
    router.push(pagePath);
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

  const hasFilters = ca || rootCa !== "all" || type !== "all" || mark !== "all" || validity !== "all" || precert !== "all" || industry !== "all" || dateFrom || dateTo || expiresFrom || expiresTo;

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

  // Shared filter controls rendered with optional width override for mobile
  const caSelect = (className?: string) => (
    <Select
      value={caSlug || "all"}
      onValueChange={(v) => router.push(buildUrl(v === "all" ? "" : v))}
    >
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
    <Select
      value={rootCa}
      onValueChange={(v) => updateSecondaryFilter("root", v)}
    >
      <SelectTrigger size="sm" aria-label="Filter by root CA" className={className ?? "w-[140px]"}>
        <SelectValue placeholder="All Root CAs" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Root CAs</SelectItem>
        {ROOT_CA_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const typeSelect = (className?: string) => (
    <Select
      value={type}
      onValueChange={(v) => updateSecondaryFilter("type", v)}
    >
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
    <Select
      value={mark}
      onValueChange={(v) => updateSecondaryFilter("mark", v)}
    >
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
    <Select
      value={validity}
      onValueChange={(v) => updateSecondaryFilter("validity", v)}
    >
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
    <Select
      value={precert}
      onValueChange={(v) => updateSecondaryFilter("precert", v)}
    >
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
      <Select
        value={industry}
        onValueChange={(v) => updateSecondaryFilter("industry", v)}
      >
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

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto px-4 py-2">
        {/* Mobile toggle */}
        <div className="flex items-center justify-between md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {hasFilters && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                {filterCount}
              </span>
            )}
          </button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>

        {/* Mobile expanded (stacked vertically) */}
        {isOpen && (
          <div className="flex flex-col gap-2 pt-2 md:hidden">
            {caSelect("w-full")}
            {rootCaSelect("w-full")}
            {typeSelect("w-full")}
            {markSelect("w-full")}
            {validitySelect("w-full")}
            {precertSelect("w-full")}
            {industrySelect("w-full")}
            {dateRange(true)}
            {expiresRange(true)}
          </div>
        )}

        {/* Desktop inline (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground shrink-0" />
          {caSelect()}
          {rootCaSelect()}
          {typeSelect()}
          {markSelect()}
          {validitySelect()}
          {precertSelect()}
          {industrySelect()}
          {dateRange()}
          {expiresRange()}
          {hasFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>
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
