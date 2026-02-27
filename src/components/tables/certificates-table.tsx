"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HostnameAutocomplete } from "@/components/hostname-autocomplete";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { displayIssuerOrg, displayRootCa } from "@/lib/ca-display";
import { getMarkTypeInfo } from "@/lib/mark-types";
import { UtcTime } from "@/components/ui/utc-time";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
} from "lucide-react";
import {
  PaginationBar,
  type Pagination,
} from "@/components/pagination-bar";

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
  logotypeSvg: string | null;
  isPrecert: boolean | null;
  notabilityScore: number | null;
  companyDescription: string | null;
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
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors -ml-2 px-2 py-1 rounded"
      onClick={() => onSort(sortKey)}
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

export function CertificatesTable({
  data,
  pagination,
  basePath = "/certificates",
  showSearch = true,
}: CertificatesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-sanitize SVGs once so column renderers don't re-sanitize on every render
  const sanitizedData = useMemo(
    () => data.map(c => ({ ...c, logotypeSvg: c.logotypeSvg ? sanitizeSvg(c.logotypeSvg) : null })),
    [data]
  );

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
    [router, searchParams, basePath]
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
    [currentSort, currentDir, updateParams]
  );

  const columns: ColumnDef<CertRow>[] = [
    {
      id: "logo",
      header: "",
      size: 48,
      cell: ({ row }) => {
        const svg = row.original.logotypeSvg;
        if (!svg) {
          return (
            <div className="size-10 rounded-md border bg-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">N/A</span>
            </div>
          );
        }
        const org = row.original.subjectOrg || row.original.subjectCn || row.original.sanList[0] || "Unknown";
        const domain = row.original.sanList[0] || row.original.subjectCn;
        return (
          <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild onClick={(e) => e.stopPropagation()}>
              <div
                className="size-10 rounded-md border bg-white p-0.5 shrink-0 overflow-hidden [&>svg]:w-full [&>svg]:h-full cursor-zoom-in"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </HoverCardTrigger>
            <HoverCardContent side="right" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col items-center gap-3">
                <div
                  className="size-36 rounded-lg border bg-white p-2 overflow-hidden [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <div className="text-center space-y-0.5">
                  <div className="font-medium text-sm">{org}</div>
                  {domain && <div className="text-xs text-muted-foreground">{domain}</div>}
                  {row.original.issuerOrg && (
                    <div className="text-xs text-muted-foreground">CA: {row.original.issuerOrg}</div>
                  )}
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
        const org =
          row.original.subjectOrg ||
          row.original.subjectCn ||
          row.original.sanList[0] ||
          "Unknown";
        const domain = row.original.sanList[0] || row.original.subjectCn;
        const score = row.original.notabilityScore;
        const country = row.original.subjectCountry;
        const sans = row.original.sanList;
        const extraSans = sans.length > 1 ? sans.slice(1) : [];
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/certificates/${row.original.fingerprintSha256.slice(0, 12)}`}
                className="font-medium hover:underline block truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {org}
              </Link>
              {score != null && (
                <span className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  score >= 9 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : score >= 7 ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                    : "bg-muted text-muted-foreground"
                }`} title={row.original.companyDescription || undefined}>
                  ★ {score}
                </span>
              )}
              {country && (
                <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                  {country}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground block truncate">
              {domain}
              {extraSans.length > 0 && (
                <span className="text-muted-foreground/60" title={sans.join(", ")}>
                  {" "}+{extraSans.length} more
                </span>
              )}
            </span>
            {row.original.companyDescription && (
              <span className="text-[10px] text-muted-foreground/60 block truncate">
                {row.original.companyDescription}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "issuerOrg",
      header: () => (
        <SortHeader
          label="CA / Type"
          sortKey="issuerOrg"
          currentSort={currentSort}
          currentDir={currentDir}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => {
        const issuer = displayIssuerOrg(row.original.issuerOrg);
        const root = displayRootCa(row.original.rootCaOrg);
        const showRoot = row.original.rootCaOrg && root !== issuer;
        const certType = row.original.certType || "BIMI";
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="whitespace-nowrap">
                {issuer}
              </Badge>
              <abbr className="text-xs text-muted-foreground no-underline" title={certType === "VMC" ? "Verified Mark Certificate" : certType === "CMC" ? "Common Mark Certificate" : undefined}>{certType}</abbr>
              {(() => {
                const mtInfo = getMarkTypeInfo(row.original.markType);
                return mtInfo ? (
                  <span title={mtInfo.title} className={mtInfo.colorClass}>
                    <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {mtInfo.iconPaths.map((d, i) => <path key={i} d={d} />)}
                    </svg>
                  </span>
                ) : null;
              })()}
              {row.original.isPrecert && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400" title="Precertificate">
                  Pre
                </span>
              )}
            </div>
            {showRoot && (
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Root: {root}
              </span>
            )}
          </div>
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
    {
      accessorKey: "ctLogTimestamp",
      meta: { className: "hidden lg:table-cell" },
      header: () => (
        <SortHeader
          label="CT Date"
          sortKey="ctLogTimestamp"
          currentSort={currentSort}
          currentDir={currentDir}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => {
        if (!row.original.ctLogTimestamp) return "-";
        return <UtcTime date={row.original.ctLogTimestamp} relative />;
      },
    },
  ];

  const table = useReactTable({
    data: sanitizedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const searchValue = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchValue);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csvHeader =
                "Organization,Domain,SANs,CA,Type,Country,Issued,Expires,CT Date,Serial Number";
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
                ].join(",")
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
            Export
          </Button>
        </div>
      )}

      <PaginationBar
        pagination={pagination}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={cn("text-xs uppercase tracking-wider", header.column.columnDef.meta?.className)}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
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
                  onClick={() =>
                    router.push(`/certificates/${row.original.fingerprintSha256.slice(0, 12)}`)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("py-3", cell.column.columnDef.meta?.className)}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
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

      <PaginationBar
        pagination={pagination}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />
    </div>
  );
}
