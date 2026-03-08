"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// --- Types ---

interface DomainResult {
  domain: string;
  bimiGrade: string | null;
  dmarcPolicy: string | null;
  bimiLogoUrl: string | null;
  bimiAuthorityUrl: string | null;
  svgTinyPsValid: boolean | null;
  dmarcValid: boolean | null;
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

const SORTABLE_COLUMNS = [
  { key: "domain", label: "Domain" },
  { key: "bimiGrade", label: "Grade" },
  { key: "dmarcPolicy", label: "DMARC Policy" },
  { key: "lastChecked", label: "Last Checked" },
] as const;

const PAGE_LIMIT = 50;

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
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const f = searchParams.get("f") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const sort = searchParams.get("sort") ?? "domain";
  const dir = searchParams.get("dir") ?? "asc";

  const [inputValue, setInputValue] = useState(q);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter builder state
  const [mounted, setMounted] = useState(false);
  const [newFilterPath, setNewFilterPath] = useState<string>("");
  const [newFilterOp, setNewFilterOp] = useState<string>("eq");
  const [newFilterValue, setNewFilterValue] = useState<string>("");

  useEffect(() => setMounted(true), []);

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
      params.set("limit", String(PAGE_LIMIT));
      params.set("sort", currentSort);
      params.set("dir", currentDir);

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

  // Fetch on mount and whenever URL params change
  useEffect(() => {
    fetchResults();
  }, [q, f, page, sort, dir, fetchResults]);

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
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                )}
                {results && results.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No results found.
                    </td>
                  </tr>
                )}
                {results?.data.map((row) => (
                  <tr
                    key={row.domain}
                    className={cn("border-b last:border-0 hover:bg-muted/50", loading && "opacity-50")}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/domains/${encodeURIComponent(row.domain)}`}
                        className="font-mono text-blue-600 hover:underline dark:text-blue-400"
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
                      {row.dmarcPolicy ?? <span className="text-muted-foreground">&mdash;</span>}
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
                      ) : row.svgTinyPsValid ? (
                        <Badge variant="secondary" className="bg-green-500/15 text-green-700 dark:text-green-400">
                          Valid
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-red-500/15 text-red-700 dark:text-red-400">
                          Invalid
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {results && results.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {results.pagination.total.toLocaleString()} results &middot; page {results.pagination.page} of{" "}
            {results.pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= results.pagination.totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
