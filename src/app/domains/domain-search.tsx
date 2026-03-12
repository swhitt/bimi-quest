"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { caSlugToName } from "@/lib/ca-slugs";
import { PaginationBar } from "@/components/pagination-bar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { LogoCard } from "@/components/logo-card";
import { resolveRuaProviders } from "@/lib/rua-providers";
import { cn } from "@/lib/utils";

// --- Types ---

interface DomainResult {
  domain: string;
  bimiGrade: string | null;
  dmarcPolicy: string | null;
  dmarcRecordRaw: string | null;
  bimiLogoUrl: string | null;
  bimiRecordRaw: string | null;
  bimiAuthorityUrl: string | null;
  svgTinyPsValid: boolean | null;
  svgValidationErrors: string[] | null;
  svgIndicatorHash: string | null;
  svgTileBg: string | null;
  dmarcValid: boolean | null;
  dmarcRua: string | null;
  svgDataUri: string | null;
  lastChecked: string | null;
}

interface SearchResponse {
  data: DomainResult[];
  pagination: {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
}

// --- Constants ---

const FILTER_PATHS = [
  "meta.grade",
  "bimi.logoUrl",
  "bimi.authorityUrl",
  "bimi.declined",
  "bimi.selector",
  "bimi.orgDomainFallback",
  "dmarc.policy",
  "dmarc.sp",
  "dmarc.pct",
  "dmarc.rua",
  "dmarc.adkim",
  "dmarc.aspf",
  "dmarc.validForBimi",
  "svg.found",
  "svg.tinyPsValid",
  "svg.indicatorHash",
  "certificate.found",
  "certificate.certType",
  "certificate.issuer",
] as const;

const OPERATORS = ["eq", "neq", "contains", "exists", "not_exists"] as const;

const PRESETS: { label: string; params: Record<string, string> }[] = [
  { label: "VMC", params: { f: "certificate.certType:eq:VMC", q: "" } },
  { label: "CMC", params: { f: "certificate.certType:eq:CMC", q: "" } },
  { label: "Has Logo No Cert", params: { f: "bimi.logoUrl:exists,certificate.certType:not_exists", q: "" } },
  { label: "Invalid SVG", params: { f: "svg.tinyPsValid:eq:false", q: "" } },
  { label: "BIMI Declined", params: { f: "bimi.declined:eq:true", q: "" } },
  { label: "DMARC None", params: { f: "dmarc.policy:eq:none", q: "" } },
  { label: "No DMARC", params: { f: "dmarc.policy:not_exists", q: "" } },
];

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-500/15 text-green-700 dark:text-green-400",
  B: "bg-lime-500/15 text-lime-700 dark:text-lime-400",
  C: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  D: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  F: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const DMARC_POLICY_COLORS: Record<string, string> = {
  reject: "bg-green-500/15 text-green-700 dark:text-green-400",
  quarantine: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  none: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const SORTABLE_COLUMNS = [
  { key: "domain", label: "Domain" },
  { key: "bimiGrade", label: "Grade" },
  { key: "dmarcPolicy", label: "DMARC Policy" },
  { key: "lastChecked", label: "Last Checked" },
] as const;

const DEFAULT_PAGE_LIMIT = 50;

// --- Helpers ---

interface FilterChip {
  path: string;
  op: string;
  value?: string;
}

function parseFilters(raw: string): FilterChip[] {
  if (!raw) return [];
  return raw.split(",").map((segment) => {
    const parts = segment.split(":");
    return {
      path: parts[0],
      op: parts[1],
      value: parts.length > 2 ? parts.slice(2).join(":") : undefined,
    };
  });
}

function serializeFilters(filters: FilterChip[]): string {
  return filters
    .map((f) => {
      const parts = [f.path, f.op];
      if (f.value !== undefined) parts.push(f.value);
      return parts.join(":");
    })
    .join(",");
}

function operatorNeedsValue(op: string): boolean {
  return op !== "exists" && op !== "not_exists";
}

// --- Component ---

export function DomainSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const f = searchParams.get("f") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const sort = searchParams.get("sort") ?? "domain";
  const dir = searchParams.get("dir") ?? "asc";

  // Global filter params (set by GlobalFilterBar)
  const gfCa = searchParams.get("ca") ?? "";
  const gfType = searchParams.get("type") ?? "";
  const gfFrom = searchParams.get("from") ?? "";
  const gfTo = searchParams.get("to") ?? "";

  const [inputValue, setInputValue] = useState(q);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);

  // Filter builder state
  const [mounted, setMounted] = useState(false);
  const [newFilterPath, setNewFilterPath] = useState<string>("");
  const [newFilterOp, setNewFilterOp] = useState<string>("eq");
  const [newFilterValue, setNewFilterValue] = useState<string>("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Reset selection when results change
  useEffect(() => {
    setSelectedRowIndex(-1);
  }, [results]);

  // Global keyboard shortcuts for j/k navigation, Enter, /, Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
        setSelectedRowIndex(-1);
        return;
      }

      // j/k/Enter only when not focused on an input
      if (isInput) return;

      const rowCount = results?.data.length ?? 0;
      if (rowCount === 0) return;

      if (e.key === "j") {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.min(prev + 1, rowCount - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && selectedRowIndex >= 0) {
        e.preventDefault();
        const row = results?.data[selectedRowIndex];
        if (row) router.push(`/domains/${encodeURIComponent(row.domain)}`);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [results, selectedRowIndex, router]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const filters = parseFilters(f);

  function updateUrl(newParams: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(newParams)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    window.history.replaceState({}, "", url.toString());
  }

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const currentUrl = new URL(window.location.href);
      const currentQ = currentUrl.searchParams.get("q") ?? "";
      const currentF = currentUrl.searchParams.get("f") ?? "";
      const currentPage = currentUrl.searchParams.get("page") ?? "1";
      const currentSort = currentUrl.searchParams.get("sort") ?? "domain";
      const currentDir = currentUrl.searchParams.get("dir") ?? "asc";

      if (currentQ) params.set("q", currentQ);
      if (currentF) params.set("f", currentF);
      params.set("page", currentPage);
      const currentLimit = currentUrl.searchParams.get("limit") ?? String(DEFAULT_PAGE_LIMIT);
      params.set("limit", currentLimit);
      params.set("sort", currentSort);
      params.set("dir", currentDir);

      // Forward global filter params
      const caSlug = currentUrl.searchParams.get("ca") ?? "";
      const caName = caSlug ? caSlugToName(caSlug) : undefined;
      if (caName) params.set("ca", caName);
      const currentType = currentUrl.searchParams.get("type") ?? "";
      if (currentType) params.set("type", currentType);
      const currentFrom = currentUrl.searchParams.get("from") ?? "";
      if (currentFrom) params.set("from", currentFrom);
      const currentTo = currentUrl.searchParams.get("to") ?? "";
      if (currentTo) params.set("to", currentTo);

      let res = await fetch(`/api/domains/search?${params.toString()}`);
      // Retry once on transient 503 (Neon cold start)
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 500));
        res = await fetch(`/api/domains/search?${params.toString()}`);
      }
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data: SearchResponse = await res.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and whenever URL params change (including global filters)
  useEffect(() => {
    fetchResults();
  }, [q, f, page, sort, dir, gfCa, gfType, gfFrom, gfTo, fetchResults]);

  // Debounced search input
  function handleSearchInput(value: string) {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateUrl({ q: value || null, page: null });
    }, 300);
  }

  function addFilter() {
    if (!newFilterPath || !newFilterOp) return;
    if (operatorNeedsValue(newFilterOp) && !newFilterValue) return;

    const chip: FilterChip = {
      path: newFilterPath,
      op: newFilterOp,
      value: operatorNeedsValue(newFilterOp) ? newFilterValue : undefined,
    };
    const updated = [...filters, chip];
    updateUrl({ f: serializeFilters(updated) || null, page: null });
    setNewFilterPath("");
    setNewFilterOp("eq");
    setNewFilterValue("");
  }

  function removeFilter(index: number) {
    const updated = filters.filter((_, i) => i !== index);
    updateUrl({ f: serializeFilters(updated) || null, page: null });
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setInputValue(preset.params.q ?? "");
    updateUrl({
      q: preset.params.q || null,
      f: preset.params.f || null,
      page: null,
      sort: null,
      dir: null,
    });
  }

  function handleSort(column: string) {
    if (sort === column) {
      updateUrl({ dir: dir === "asc" ? "desc" : "asc" });
    } else {
      updateUrl({ sort: column, dir: "asc" });
    }
  }

  function handlePageChange(newPage: number) {
    updateUrl({ page: newPage > 1 ? String(newPage) : null });
  }

  const sortIndicator = (column: string) => {
    if (sort !== column) return null;
    return dir === "asc" ? " \u2191" : " \u2193";
  };

  return (
    <div className="space-y-4">
      {/* Search input */}
      <Input
        ref={searchInputRef}
        type="text"
        placeholder="Search domains..."
        value={inputValue}
        onChange={(e) => handleSearchInput(e.target.value)}
        className="font-mono"
      />

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.label} variant="outline" size="sm" onClick={() => applyPreset(preset)}>
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Filter builder — rendered only on client to avoid Radix Select SSR mismatch */}
      {mounted && (
        <Card>
          <CardContent className="pt-4">
            {/* Active filter chips */}
            {filters.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {filters.map((chip, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="cursor-pointer gap-1 font-mono text-xs"
                    onClick={() => removeFilter(i)}
                  >
                    {chip.path} {chip.op}
                    {chip.value !== undefined ? ` ${chip.value}` : ""}
                    <span className="ml-1 text-muted-foreground">&times;</span>
                  </Badge>
                ))}
              </div>
            )}

            {/* Add filter row */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={newFilterPath || undefined} onValueChange={setNewFilterPath}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_PATHS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={newFilterOp} onValueChange={setNewFilterOp}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {operatorNeedsValue(newFilterOp) && (
                <Input
                  type="text"
                  placeholder="Value"
                  value={newFilterValue}
                  onChange={(e) => setNewFilterValue(e.target.value)}
                  className="w-[160px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addFilter();
                  }}
                />
              )}

              <Button variant="secondary" size="sm" onClick={addFilter}>
                Add Filter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-8 px-2 py-3" />
                  {SORTABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="cursor-pointer px-4 py-3 font-medium hover:text-foreground"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortIndicator(col.key)}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Has Logo</th>
                  <th className="px-4 py-3 font-medium">SVG Valid</th>
                </tr>
              </thead>
              <tbody>
                {loading && !results && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                )}
                {results && results.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No results found.
                    </td>
                  </tr>
                )}
                {results?.data.map((row, rowIndex) => {
                  const domainPath = `/domains/${encodeURIComponent(row.domain)}`;
                  return (
                    <tr
                      key={row.domain}
                      className={cn(
                        "border-b last:border-0 cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset",
                        loading && "opacity-50",
                        selectedRowIndex === rowIndex && "ring-2 ring-primary bg-muted/40",
                      )}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(domainPath)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(domainPath);
                        }
                      }}
                    >
                      <td className="w-10 px-2 py-1">
                        {row.bimiLogoUrl ? (
                          <LogoCard
                            svgUrl={
                              row.svgIndicatorHash
                                ? `/api/logo/${row.svgIndicatorHash}?format=svg`
                                : `/api/proxy/svg?url=${encodeURIComponent(row.bimiLogoUrl)}`
                            }
                            tileBg={
                              row.svgTileBg === "rgb(243 244 246)"
                                ? "light"
                                : row.svgTileBg === "rgb(38 38 38)"
                                  ? "dark"
                                  : null
                            }
                            fingerprint={row.svgIndicatorHash}
                            size="sm"
                            alt={`${row.domain} logo`}
                            asLink={!!row.svgIndicatorHash}
                          />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={domainPath}
                          className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.domain}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {row.bimiGrade ? (
                          <Badge variant="secondary" className={cn("font-bold", GRADE_COLORS[row.bimiGrade] ?? "")}>
                            {row.bimiGrade}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.dmarcPolicy ? (
                          <div className="flex flex-col gap-0.5">
                            <HoverCard openDelay={300} closeDelay={100}>
                              <HoverCardTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="cursor-default">
                                  <Badge variant="secondary" className={cn(DMARC_POLICY_COLORS[row.dmarcPolicy] ?? "")}>
                                    {row.dmarcPolicy}
                                  </Badge>
                                </span>
                              </HoverCardTrigger>
                              {row.dmarcRecordRaw && (
                                <HoverCardContent
                                  side="top"
                                  align="start"
                                  className="w-auto max-w-[420px] px-3 py-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <p className="text-[10px] font-medium text-muted-foreground mb-1">DMARC TXT Record</p>
                                  <p className="text-xs font-mono break-all leading-relaxed">{row.dmarcRecordRaw}</p>
                                </HoverCardContent>
                              )}
                            </HoverCard>
                            {(() => {
                              const providers = resolveRuaProviders(row.dmarcRua);
                              if (providers.length === 0) return null;
                              if (providers.length === 1) {
                                return (
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                    {providers[0]}
                                  </span>
                                );
                              }
                              return (
                                <HoverCard openDelay={200} closeDelay={100}>
                                  <HoverCardTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[180px] cursor-default border-b border-dotted border-muted-foreground/40">
                                      {providers.join(" · ")}
                                    </span>
                                  </HoverCardTrigger>
                                  <HoverCardContent
                                    side="top"
                                    align="start"
                                    className="w-auto max-w-[260px] px-3 py-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                                      DMARC Report Processors
                                    </p>
                                    <ul className="space-y-0.5">
                                      {providers.map((p) => (
                                        <li key={p} className="text-xs">
                                          {p}
                                        </li>
                                      ))}
                                    </ul>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.lastChecked ? new Date(row.lastChecked).toLocaleDateString() : "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        {row.bimiLogoUrl ? (
                          <Badge variant="secondary" className="bg-green-500/15 text-green-700 dark:text-green-400">
                            Yes
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.svgTinyPsValid === null ? (
                          <span className="text-muted-foreground">&mdash;</span>
                        ) : (
                          <HoverCard openDelay={300} closeDelay={100}>
                            <HoverCardTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <span className="cursor-default">
                                {row.svgTinyPsValid ? (
                                  <Badge
                                    variant="secondary"
                                    className="bg-green-500/15 text-green-700 dark:text-green-400"
                                  >
                                    Valid
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-red-500/15 text-red-700 dark:text-red-400">
                                    Invalid
                                  </Badge>
                                )}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent
                              side="top"
                              align="start"
                              className="w-auto max-w-[420px] px-3 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                                SVG Tiny PS Validation
                              </p>
                              {row.bimiRecordRaw && (
                                <p className="text-xs font-mono break-all leading-relaxed mb-1">{row.bimiRecordRaw}</p>
                              )}
                              {row.svgTinyPsValid ? (
                                <p className="text-xs text-green-600 dark:text-green-400">
                                  Passes SVG Tiny PS profile requirements
                                </p>
                              ) : row.svgValidationErrors && row.svgValidationErrors.length > 0 ? (
                                <ul className="space-y-0.5">
                                  {row.svgValidationErrors.map((err, i) => (
                                    <li key={i} className="text-xs text-red-600 dark:text-red-400">
                                      {err}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-red-600 dark:text-red-400">Fails SVG Tiny PS validation</p>
                              )}
                            </HoverCardContent>
                          </HoverCard>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {results && <PaginationBar pagination={results.pagination} onPageChange={handlePageChange} noun="domains" />}
    </div>
  );
}
