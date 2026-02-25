"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
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
import { Input } from "@/components/ui/input";
import { format, formatDistanceToNow } from "date-fns";
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface CertRow {
  id: number;
  serialNumber: string;
  fingerprintSha256: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  subjectCountry: string | null;
  issuerOrg: string | null;
  certType: string | null;
  markType: string | null;
  notBefore: string;
  notAfter: string;
  sanList: string[];
  ctLogTimestamp: string | null;
  logotypeSvg: string | null;
  isPrecert: boolean | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CertificatesTableProps {
  data: CertRow[];
  pagination: Pagination;
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
}: CertificatesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort") || "notBefore";
  const currentDir = searchParams.get("dir") || "desc";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`/certificates?${params.toString()}`);
    },
    [router, searchParams]
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
        const serial = row.original.serialNumber;
        return (
          <div className="min-w-0">
            <Link
              href={`/certificates/${row.original.id}`}
              className="font-medium hover:underline block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {org}
            </Link>
            <span className="text-xs text-muted-foreground block truncate">
              {domain}
              {domain && " · "}
              <span className="font-mono italic" title={serial}>
                ({serial.slice(0, 8)})
              </span>
            </span>
          </div>
        );
      },
    },
    {
      id: "sans",
      header: "SANs",
      cell: ({ row }) => {
        const sans = row.original.sanList;
        if (sans.length <= 1) return null;
        return (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {sans.slice(0, 3).map((san) => (
              <Badge key={san} variant="outline" className="text-xs font-normal">
                {san}
              </Badge>
            ))}
            {sans.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{sans.length - 3}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "issuerOrg",
      header: () => (
        <SortHeader
          label="CA"
          sortKey="issuerOrg"
          currentSort={currentSort}
          currentDir={currentDir}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary" className="whitespace-nowrap">
          {row.original.issuerOrg || "Unknown"}
        </Badge>
      ),
    },
    {
      accessorKey: "certType",
      header: "Type",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Badge variant="outline">{row.original.certType || "BIMI"}</Badge>
          {row.original.isPrecert && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 text-amber-600 dark:text-amber-400" title="Precertificate only (final certificate not yet logged)">
              Precert
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "subjectCountry",
      header: "Country",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.subjectCountry || "-"}
        </span>
      ),
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
        const date = new Date(row.original.notBefore);
        return (
          <div title={format(date, "PPP pp")}>
            <span className="text-sm">
              {format(date, "yyyy-MM-dd")}
            </span>
            <span className="text-xs text-muted-foreground block">
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "notAfter",
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
        const date = new Date(row.original.notAfter);
        const isExpired = date < new Date();
        return (
          <div title={format(date, "PPP pp")}>
            <span className={isExpired ? "text-destructive text-sm" : "text-sm"}>
              {format(date, "yyyy-MM-dd")}
            </span>
            <span className={`text-xs block ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const searchValue = searchParams.get("search") || "";

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search domains, orgs..."
            className="pl-9"
            defaultValue={searchValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParams({
                  search: (e.target as HTMLInputElement).value,
                  page: "1",
                });
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csvHeader =
              "Organization,Domain,SANs,CA,Type,Country,Issued,Expires,Serial Number";
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

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs uppercase tracking-wider">
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
                    router.push(`/certificates/${row.original.id}`)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
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
                  No certificates found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination.total.toLocaleString()} certificates
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pagination.page <= 1}
            onClick={() => updateParams({ page: "1" })}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pagination.page <= 1}
            onClick={() =>
              updateParams({ page: String(pagination.page - 1) })
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm px-3 tabular-nums">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() =>
              updateParams({ page: String(pagination.page + 1) })
            }
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() =>
              updateParams({ page: String(pagination.totalPages) })
            }
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
