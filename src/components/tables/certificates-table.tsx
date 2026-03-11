"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { certUrl, orgUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
import { HostnameAutocomplete } from "@/components/hostname-autocomplete";
import { HostnameLink } from "@/components/hostname-link";
import { LogoCard } from "@/components/logo-card";
import { type Pagination, PaginationBar } from "@/components/pagination-bar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UtcTime } from "@/components/ui/utc-time";
import { displayIntermediateCa } from "@/lib/ca-display";
import { getMarkTypeInfo } from "@/lib/mark-types";

export interface CertRow {
  id: number;
  serialNumber: string;
  fingerprintSha256: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  subjectCountry: string | null;
  issuerOrg: string | null;
  rootCaOrg: string | null;
  certType: string | null;
  markType: string | null;
  notBefore: string;
  notAfter: string;
  sanList: string[];
  ctLogTimestamp: string | null;
  logotypeSvgHash: string | null;
  logoTileBg: string | null;
  hasLogo: boolean;
  isPrecert: boolean | null;
  notabilityScore: number | null;
  companyDescription: string | null;
  industry: string | null;
}

interface CertificatesTableProps {
  data: CertRow[];
  pagination: Pagination;
  basePath?: string;
  showSearch?: boolean;
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: string;
  onSort: (key: string) => void;
}) {
  const isActive = currentSort === sortKey;
  const ariaLabel = isActive
    ? `Sort by ${label}, currently ${currentDir === "asc" ? "ascending" : "descending"}`
    : `Sort by ${label}`;
  return (
    <button
      className={cn(
        "flex items-center gap-1 -ml-2 px-2 py-1.5 rounded",
        isActive ? "text-foreground" : "hover:text-foreground",
      )}
      onClick={() => onSort(sortKey)}
      aria-label={ariaLabel}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ArrowUp className="size-3.5 text-primary" />
        ) : (
          <ArrowDown className="size-3.5 text-primary" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-30" />
      )}
    </button>
  );
}

/** Returns validity status based on notAfter date. */
function getCertValidity(notAfter: string): "active" | "expiring-soon" | "expired" {
  const now = new Date();
  const expiry = new Date(notAfter);
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  if (expiry < now) return "expired";
  if (expiry < ninetyDaysFromNow) return "expiring-soon";
  return "active";
}

function useCertTable(data: CertRow[], columns: ColumnDef<CertRow>[]) {
  // React Compiler pragma: disable auto-memoization for this hook
  // because TanStack Table manages its own internal memoization
  "use no memo";
  // eslint-disable-next-line react-hooks/incompatible-library
  return useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
}

export function CertificatesTable({
  data,
  pagination,
  basePath = "/certificates",
  showSearch = true,
}: CertificatesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort") || "notBefore";
  const currentDir = searchParams.get("dir") || "desc";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      let page: string | null = null;
      for (const [key, value] of Object.entries(updates)) {
        if (key === "page") {
          page = value && value !== "1" ? value : null;
        } else if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const pageSuffix = page ? `/page/${page}` : "";
      const qs = params.toString();
      router.push(`${basePath}${pageSuffix}${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams, basePath],
  );

  const handleSort = useCallback(
    (key: string) => {
      if (currentSort === key) {
        updateParams({
          dir: currentDir === "asc" ? "desc" : "asc",
          page: "1",
        });
      } else {
        updateParams({ sort: key, dir: "desc", page: "1" });
      }
    },
    [currentSort, currentDir, updateParams],
  );

  const columns = useMemo<ColumnDef<CertRow>[]>(
    () => [
      {
        id: "logo",
        meta: { className: "w-12 !py-0" },
        header: "",
        size: 56,
        cell: ({ row }) => {
          const hash = row.original.logotypeSvgHash;
          if (!hash || !row.original.hasLogo) {
            return <div className="size-8 rounded border border-border/30 bg-muted/50" />;
          }
          const org = row.original.subjectOrg || row.original.subjectCn || row.original.sanList[0] || "Unknown";
          const svgUrl = `/api/logo/${hash}?format=svg`;
          return (
            <LogoCard
              svgUrl={svgUrl}
              tileBg={row.original.logoTileBg as "light" | "dark" | null}
              size="sm"
              fingerprint={row.original.fingerprintSha256}
              alt={`${org} logo`}
            />
          );
        },
      },
      {
        accessorKey: "subjectOrg",
        meta: { className: "min-w-0 overflow-hidden" },
        header: () => (
          <SortHeader
            label="Organization"
            sortKey="subjectOrg"
            currentSort={currentSort}
            currentDir={currentDir}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => {
          const org = row.original.subjectOrg || row.original.subjectCn || row.original.sanList[0] || "Unknown";
          const firstDomain = row.original.sanList[0] || row.original.subjectCn;
          const orgHref = row.original.subjectOrg
            ? orgUrl(row.original.subjectOrg)
            : certUrl(row.original.fingerprintSha256);
          return (
            <div className="min-w-0">
              <Link
                href={orgHref}
                className="font-medium text-foreground/90 hover:text-foreground hover:underline decoration-foreground/30 underline-offset-2 truncate max-w-full inline-block transition-colors duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {org}
              </Link>
              {firstDomain && (
                <span className="text-[11px] md:hidden block truncate">
                  <HostnameLink hostname={firstDomain} size="xs" compact />
                  {row.original.sanList.length > 1 && (
                    <span className="text-muted-foreground"> +{row.original.sanList.length - 1}</span>
                  )}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "sans",
        meta: { className: "hidden md:table-cell md:w-[140px] lg:w-[160px] xl:w-[200px]" },
        header: "Hostnames",
        cell: ({ row }) => {
          const sans = row.original.sanList;
          if (sans.length === 0) return <span className="text-muted-foreground">—</span>;
          const extraSans = sans.slice(1);
          return (
            <div className="min-w-0">
              <span className="block truncate">
                <HostnameLink hostname={sans[0]} size="xs" compact />
              </span>
              {extraSans.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <span className="text-[11px] text-muted-foreground cursor-help hover:text-muted-foreground transition-colors duration-150">
                      +{extraSans.length} more
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <ul className="space-y-0.5">
                      {extraSans.map((san) => (
                        <li key={san}>
                          <HostnameLink hostname={san} size="xs" />
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "certType",
        meta: { className: "w-[52px] sm:w-[68px]" },
        header: "Type",
        cell: ({ row }) => {
          const certType = row.original.certType || "BIMI";
          const mtInfo = getMarkTypeInfo(row.original.markType);
          return (
            <div className="flex items-center gap-1">
              <abbr
                className={cn("text-xs font-medium no-underline", row.original.isPrecert && "opacity-50")}
                title={[
                  certType === "VMC"
                    ? "Verified Mark Certificate"
                    : certType === "CMC"
                      ? "Common Mark Certificate"
                      : certType,
                  mtInfo?.title,
                  row.original.isPrecert ? "Precertificate" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {certType}
              </abbr>
              {mtInfo && (
                <span title={mtInfo.title} className={mtInfo.colorClass}>
                  <svg
                    className="size-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {mtInfo.iconPaths.map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                  </svg>
                </span>
              )}
            </div>
          );
        },
      },
      {
        // Country: not sortable via API (subjectCountry not in VALID_SORT_COLUMNS)
        id: "subjectCountry",
        meta: { className: "hidden xl:table-cell xl:w-[56px]" },
        header: "Country",
        cell: ({ row }) => {
          const country = row.original.subjectCountry;
          if (!country) return <span className="text-muted-foreground">—</span>;
          return <span className="text-xs font-mono text-muted-foreground tracking-wider">{country}</span>;
        },
      },
      {
        accessorKey: "issuerOrg",
        meta: { className: "w-[60px] sm:w-[90px] lg:w-[110px]" },
        header: () => (
          <SortHeader
            label="CA"
            sortKey="issuerOrg"
            currentSort={currentSort}
            currentDir={currentDir}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => {
          const issuer = displayIntermediateCa(row.original.issuerOrg);
          return <span className="text-xs text-muted-foreground truncate">{issuer}</span>;
        },
      },
      {
        accessorKey: "notBefore",
        meta: { className: "w-[72px] whitespace-nowrap" },
        header: () => (
          <SortHeader
            label="Issued"
            sortKey="notBefore"
            currentSort={currentSort}
            currentDir={currentDir}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => {
          if (!row.original.notBefore) return "-";
          return <UtcTime date={row.original.notBefore} compact />;
        },
      },
      {
        accessorKey: "notAfter",
        meta: { className: "hidden md:table-cell md:w-[72px] whitespace-nowrap" },
        header: () => (
          <SortHeader
            label="Expires"
            sortKey="notAfter"
            currentSort={currentSort}
            currentDir={currentDir}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => {
          if (!row.original.notAfter) return "-";
          const status = getCertValidity(row.original.notAfter);
          const colorClass =
            status === "active"
              ? "text-green-700 dark:text-emerald-400/80"
              : status === "expiring-soon"
                ? "text-amber-700 dark:text-amber-400/70"
                : "text-muted-foreground/70 line-through decoration-muted-foreground/30";
          return (
            <span className={colorClass}>
              <UtcTime date={row.original.notAfter} compact expired={status === "expired"} />
            </span>
          );
        },
      },
      {
        // CT Log Timestamp: hidden by default, visible at xl breakpoint
        accessorKey: "ctLogTimestamp",
        meta: { className: "hidden xl:table-cell xl:w-[72px] whitespace-nowrap" },
        header: () => (
          <SortHeader
            label="CT Logged"
            sortKey="ctLogTimestamp"
            currentSort={currentSort}
            currentDir={currentDir}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => {
          if (!row.original.ctLogTimestamp) return <span className="text-muted-foreground">—</span>;
          return <UtcTime date={row.original.ctLogTimestamp} compact />;
        },
      },
    ],
    [currentSort, currentDir, handleSort],
  );

  const table = useCertTable(data, columns);

  const searchValue = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchValue);

  return (
    <div className="space-y-1 sm:space-y-2">
      {/* Search bar + mobile count */}
      {showSearch && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:contents">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
              <HostnameAutocomplete
                value={searchInput}
                onChange={setSearchInput}
                onSelect={(val) => {
                  setSearchInput(val);
                  updateParams({ search: val, page: "1" });
                }}
                placeholder="Search domains, orgs..."
                inputClassName="pl-9"
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 tabular-nums">
              {pagination.total.toLocaleString()}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              aria-label="Export current page as CSV"
              onClick={() => {
                const csvHeader = "Organization,Domain,Hostnames,CA,Type,Country,Issued,Expires,CT Date,Serial Number";
                const csvRows = data.map((r) =>
                  [
                    `"${(r.subjectOrg || "").replace(/"/g, '""')}"`,
                    r.sanList[0] || r.subjectCn || "",
                    `"${r.sanList.join("; ")}"`,
                    r.issuerOrg || "",
                    r.certType || "",
                    r.subjectCountry || "",
                    r.notBefore || "",
                    r.notAfter || "",
                    r.ctLogTimestamp || "",
                    r.serialNumber || "",
                  ].join(","),
                );
                const csv = [csvHeader, ...csvRows].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "bimi-certificates.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="size-4" />
              Export page
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Export all matching certificates as CSV"
              onClick={() => {
                const exportParams = new URLSearchParams(searchParams.toString());
                exportParams.delete("page");
                exportParams.delete("limit");
                exportParams.delete("sort");
                exportParams.delete("dir");
                exportParams.set("format", "csv");
                window.location.href = `/api/export/certificates?${exportParams.toString()}`;
              }}
              title="Export all certificates matching current filters (up to 50,000)"
            >
              <Download className="size-4" />
              Export all
            </Button>
          </div>
        </div>
      )}

      <PaginationBar pagination={pagination} onPageChange={(page) => updateParams({ page: String(page) })} />

      {/* Table */}
      <div className="border-b border-border/50 bg-card/30 overflow-clip sm:overflow-hidden">
        <Table className="table-fixed" containerClassName="sm:overflow-x-auto">
          <TableHeader className="sticky top-12 sm:static z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-background sm:bg-muted/30 hover:bg-transparent border-b border-border/50"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn("text-xs font-medium h-9", header.column.columnDef.meta?.className)}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const org = row.original.subjectOrg || row.original.subjectCn || row.original.sanList[0] || "Unknown";
                const certPath = certUrl(row.original.fingerprintSha256);
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer group/row hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    tabIndex={0}
                    aria-label={org}
                    onClick={() => router.push(certPath)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(certPath);
                      }
                    }}
                    style={
                      row.original.notabilityScore != null && row.original.notabilityScore >= 9
                        ? { boxShadow: "inset 3px 0 0 0 oklch(0.8 0.15 85 / 0.5)" }
                        : row.original.notabilityScore != null && row.original.notabilityScore >= 7
                          ? { boxShadow: "inset 3px 0 0 0 oklch(0.6 0.15 240 / 0.4)" }
                          : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn("py-0.5", cell.column.columnDef.meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  <div className="space-y-1">
                    <p>No certificates match your current filters.</p>
                    <p className="text-xs">
                      Try adjusting your search or filters, or use the{" "}
                      <Link href="/validate" className="text-primary hover:underline">
                        Validator
                      </Link>{" "}
                      to check a specific domain.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar pagination={pagination} onPageChange={(page) => updateParams({ page: String(page) })} />
    </div>
  );
}
