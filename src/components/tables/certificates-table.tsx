"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HostnameAutocomplete } from "@/components/hostname-autocomplete";
import { displayIssuerOrg } from "@/lib/ca-display";
import { getMarkTypeInfo } from "@/lib/mark-types";
import { UtcTime } from "@/components/ui/utc-time";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from "lucide-react";
import { PaginationBar, type Pagination } from "@/components/pagination-bar";

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
  hasLogo: boolean;
  logoBg: string | null;
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
      className="flex items-center gap-1 hover:text-foreground transition-colors -ml-2 px-2 py-1.5 rounded"
      onClick={() => onSort(sortKey)}
      aria-label={ariaLabel}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </button>
  );
}

function useCertTable(data: CertRow[], columns: ColumnDef<CertRow>[]) {
  // React Compiler pragma: disable auto-memoization for this hook
  // because TanStack Table manages its own internal memoization
  "use no memo";
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

  const columns: ColumnDef<CertRow>[] = [
    {
      id: "logo",
      meta: { className: "hidden sm:table-cell w-[48px]" },
      header: "",
      size: 48,
      cell: ({ row }) => {
        const hash = row.original.logotypeSvgHash;
        if (!hash || !row.original.hasLogo) {
          return <div className="size-8 rounded-md border bg-muted" />;
        }
        const org = row.original.subjectOrg || row.original.subjectCn || row.original.sanList[0] || "Unknown";
        const domain = row.original.sanList[0] || row.original.subjectCn;
        const svgUrl = `/api/logo/${hash}?format=svg`;
        const bg = row.original.logoBg;
        return (
          <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild onClick={(e) => e.stopPropagation()}>
              <img
                src={svgUrl}
                alt={`${org} logo`}
                loading="lazy"
                width={32}
                height={32}
                className="size-8 min-w-8 rounded-md border p-0.5 object-contain cursor-zoom-in"
                style={bg ? { backgroundColor: bg } : undefined}
              />
            </HoverCardTrigger>
            <HoverCardContent side="right" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col items-center gap-3">
                <img
                  src={svgUrl}
                  alt={`${org} logo`}
                  width={144}
                  height={144}
                  className="size-36 rounded-lg border p-2 object-contain"
                  style={bg ? { backgroundColor: bg } : undefined}
                />
                <div className="text-center space-y-0.5">
                  <div className="font-medium text-sm">{org}</div>
                  {domain && <div className="text-xs text-muted-foreground">{domain}</div>}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      },
    },
    {
      accessorKey: "subjectOrg",
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
        const score = row.original.notabilityScore;
        const country = row.original.subjectCountry;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/certificates/${row.original.fingerprintSha256.slice(0, 12)}`}
                className="font-medium hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {org}
              </Link>
              {score != null && score >= 5 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`shrink-0 size-1.5 rounded-full cursor-help ${
                        score >= 9 ? "bg-amber-500" : score >= 7 ? "bg-blue-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-64">
                    <p className="font-medium">Notability: {score}/10</p>
                    {row.original.companyDescription && (
                      <p className="text-foreground/70 mt-0.5">{row.original.companyDescription}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
              {country && <span className="shrink-0 text-[10px] text-muted-foreground font-mono">{country}</span>}
            </div>
            {row.original.industry && (
              <span className="text-[10px] text-muted-foreground/60 block truncate">{row.original.industry}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "sans",
      meta: { className: "hidden md:table-cell" },
      header: "Domains",
      cell: ({ row }) => {
        const sans = row.original.sanList;
        if (sans.length === 0) return <span className="text-muted-foreground">—</span>;
        const extraSans = sans.slice(1);
        return (
          <div className="min-w-0">
            <span className="text-xs font-mono block truncate">{sans[0]}</span>
            {extraSans.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-muted-foreground/60 cursor-help">+{extraSans.length} more</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-80">
                  <ul className="space-y-0.5">
                    {extraSans.map((san) => (
                      <li key={san} className="font-mono text-xs">
                        {san}
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
      meta: { className: "hidden sm:table-cell" },
      header: "Type",
      cell: ({ row }) => {
        const certType = row.original.certType || "BIMI";
        const mtInfo = getMarkTypeInfo(row.original.markType);
        return (
          <div className="flex items-center gap-1">
            <abbr
              className="text-xs font-medium no-underline"
              title={
                certType === "VMC"
                  ? "Verified Mark Certificate"
                  : certType === "CMC"
                    ? "Common Mark Certificate"
                    : undefined
              }
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
            {row.original.isPrecert && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400" title="Precertificate">
                Pre
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "issuerOrg",
      meta: { className: "hidden lg:table-cell" },
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
        const issuer = displayIssuerOrg(row.original.issuerOrg);
        return (
          <Badge variant="secondary" className="whitespace-nowrap">
            {issuer}
          </Badge>
        );
      },
    },
    {
      accessorKey: "notBefore",
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
        return <UtcTime date={row.original.notBefore} relative />;
      },
    },
    {
      accessorKey: "notAfter",
      meta: { className: "hidden md:table-cell" },
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
        const isExpired = new Date(row.original.notAfter) < new Date();
        return <UtcTime date={row.original.notAfter} relative expired={isExpired} />;
      },
    },
  ];

  const table = useCertTable(data, columns);

  const searchValue = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchValue);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      {showSearch && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative sm:max-w-sm flex-1">
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
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const csvHeader = "Organization,Domain,SANs,CA,Type,Country,Issued,Expires,CT Date,Serial Number";
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
              Page
            </Button>
            <Button
              variant="outline"
              size="sm"
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
              All
            </Button>
          </div>
        </div>
      )}

      <PaginationBar pagination={pagination} onPageChange={(page) => updateParams({ page: String(page) })} />

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn("text-xs uppercase tracking-wider xl:h-8", header.column.columnDef.meta?.className)}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/certificates/${row.original.fingerprintSha256.slice(0, 12)}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("py-3 xl:py-1.5", cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
