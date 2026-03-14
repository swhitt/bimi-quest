"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronRight, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CHANGE_STYLE } from "@/components/dashboard/dns-changes-feed";
import { DiffBlock, computeDiff } from "@/components/dns/diff-block";
import { HostChip } from "@/components/host-chip";
import { type Pagination, PaginationBar } from "@/components/pagination-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UtcTime } from "@/components/ui/utc-time";
import type { DnsChangeRow } from "@/lib/data/dns-changes";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

const RECORD_TYPES = [
  { value: "", label: "All types" },
  { value: "bimi", label: "BIMI" },
  { value: "dmarc", label: "DMARC" },
] as const;

const CHANGE_TYPES = [
  { value: "", label: "All changes" },
  { value: "policy_strengthened", label: "Policy strengthened" },
  { value: "policy_weakened", label: "Policy weakened" },
  { value: "record_created", label: "Record created" },
  { value: "record_removed", label: "Record removed" },
  { value: "record_ambiguous", label: "Ambiguous records" },
  { value: "logo_url_changed", label: "Logo URL changed" },
  { value: "logo_changed", label: "Logo changed" },
  { value: "authority_url_changed", label: "Authority URL changed" },
  { value: "authority_changed", label: "Authority changed" },
  { value: "declination_set", label: "Declined" },
  { value: "tags_modified", label: "Tags modified" },
] as const;

const POLICY_CHANGES = new Set(["policy_strengthened", "policy_weakened"]);

interface DnsChangesTableProps {
  data: DnsChangeRow[];
  pagination: Pagination;
}

function useDnsChangesTable(data: DnsChangeRow[], columns: ColumnDef<DnsChangeRow>[]) {
  "use no memo";
  // eslint-disable-next-line react-hooks/incompatible-library
  return useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
}

export function DnsChangesTable({ data, pagination }: DnsChangesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (key !== "page") params.delete("page");
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.push(`/dns-changes${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams],
  );

  const columns = useMemo<ColumnDef<DnsChangeRow>[]>(
    () => [
      {
        id: "expand",
        meta: { className: "w-8 !pr-0" },
        header: "",
        cell: ({ row }) => {
          const showAll = POLICY_CHANGES.has(row.original.changeType);
          const diffs = computeDiff(row.original.previousRecord, row.original.newRecord, showAll);
          if (diffs.length === 0) return null;
          const isOpen = expanded.has(row.original.id);
          return (
            <ChevronRight
              className={cn("size-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")}
            />
          );
        },
      },
      {
        id: "recordType",
        meta: { className: "w-[60px]" },
        header: "Type",
        cell: ({ row }) => (
          <span
            className={cn(
              "font-mono text-[11px] uppercase",
              row.original.recordType === "bimi" ? "text-blue-500" : "text-violet-500",
            )}
          >
            {row.original.recordType}
          </span>
        ),
      },
      {
        accessorKey: "domain",
        meta: { className: "min-w-0" },
        header: "Domain",
        cell: ({ row }) => (
          <div className="min-w-0 truncate">
            <HostChip hostname={row.original.domain} size="xs" compact />
          </div>
        ),
      },
      {
        accessorKey: "changeType",
        meta: { className: "w-[140px] hidden sm:table-cell" },
        header: "Change",
        cell: ({ row }) => {
          const style = CHANGE_STYLE[row.original.changeType] ?? {
            label: row.original.changeType,
            color: "text-muted-foreground",
          };
          return <span className={cn("font-mono text-xs", style.color)}>{style.label}</span>;
        },
      },
      {
        accessorKey: "detectedAt",
        meta: { className: "w-[80px] whitespace-nowrap" },
        header: "Detected",
        cell: ({ row }) => {
          if (!row.original.detectedAt) return <span className="text-muted-foreground">—</span>;
          return <UtcTime date={row.original.detectedAt} compact />;
        },
      },
    ],
    [expanded],
  );

  const table = useDnsChangesTable(data, columns);

  const searchValue = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchValue);
  const recordType = searchParams.get("recordType") || "";
  const changeType = searchParams.get("changeType") || "";

  const toggleRow = useCallback((id: number, hasDiffs: boolean) => {
    if (!hasDiffs) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-1 sm:space-y-2">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParams({ search: searchInput || null, page: "1" });
              }
            }}
            placeholder="Search domains..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={recordType}
            onChange={(e) => updateParams({ recordType: e.target.value || null, page: "1" })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Filter by record type"
          >
            {RECORD_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>
                {rt.label}
              </option>
            ))}
          </select>
          <select
            value={changeType}
            onChange={(e) => updateParams({ changeType: e.target.value || null, page: "1" })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Filter by change type"
          >
            {CHANGE_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
          {(recordType || changeType || searchValue) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                router.push("/dns-changes");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 tabular-nums ml-auto">
          {pagination.total.toLocaleString()} changes
        </span>
      </div>

      <PaginationBar
        pagination={pagination}
        onPageChange={(page) => updateParams({ page: String(page) })}
        noun="changes"
      />

      {/* Table */}
      <div className="border-b border-border/50 bg-card/30 overflow-clip sm:overflow-hidden">
        <Table className="table-fixed" containerClassName="sm:overflow-x-auto">
          <TableHeader>
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
              table.getRowModel().rows.flatMap((row) => {
                const showAll = POLICY_CHANGES.has(row.original.changeType);
                const diffs = computeDiff(row.original.previousRecord, row.original.newRecord, showAll);
                const hasDiffs = diffs.length > 0;
                const isOpen = expanded.has(row.original.id);

                const rows = [
                  <TableRow
                    key={row.id}
                    className={cn("group/row", hasDiffs && "cursor-pointer hover:bg-muted/40")}
                    onClick={() => toggleRow(row.original.id, hasDiffs)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn("py-1.5", cell.column.columnDef.meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>,
                ];

                if (isOpen && hasDiffs) {
                  rows.push(
                    <TableRow key={`${row.id}-diff`} className="hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="py-0 px-2 pb-2">
                        <DiffBlock diffs={diffs} />
                      </TableCell>
                    </TableRow>,
                  );
                }

                return rows;
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  No DNS changes match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        pagination={pagination}
        onPageChange={(page) => updateParams({ page: String(page) })}
        noun="changes"
      />
    </div>
  );
}
