"use client";

import { useState, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface CertRow {
  id: number;
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

const columns: ColumnDef<CertRow>[] = [
  {
    accessorKey: "subjectOrg",
    header: "Organization",
    cell: ({ row }) => (
      <Link
        href={`/certificates/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.subjectOrg || row.original.subjectCn || row.original.sanList[0] || "Unknown"}
      </Link>
    ),
  },
  {
    id: "domain",
    header: "Domain",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.sanList[0] || row.original.subjectCn || "-"}
      </span>
    ),
  },
  {
    accessorKey: "issuerOrg",
    header: "CA",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.issuerOrg || "Unknown"}</Badge>
    ),
  },
  {
    accessorKey: "certType",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.certType || "BIMI"}</Badge>
    ),
  },
  {
    accessorKey: "subjectCountry",
    header: "Country",
    cell: ({ row }) => row.original.subjectCountry || "-",
  },
  {
    accessorKey: "notBefore",
    header: "Issued",
    cell: ({ row }) =>
      row.original.notBefore
        ? format(new Date(row.original.notBefore), "yyyy-MM-dd")
        : "-",
  },
  {
    accessorKey: "notAfter",
    header: "Expires",
    cell: ({ row }) => {
      if (!row.original.notAfter) return "-";
      const date = new Date(row.original.notAfter);
      const isExpired = date < new Date();
      return (
        <span className={isExpired ? "text-destructive" : ""}>
          {format(date, "yyyy-MM-dd")}
          {isExpired && " (expired)"}
        </span>
      );
    },
  },
];

export function CertificatesTable({ data, pagination }: CertificatesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search domains or orgs..."
          className="max-w-xs"
          defaultValue={searchParams.get("search") || ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParams({ search: (e.target as HTMLInputElement).value, page: "1" });
            }
          }}
        />
        <Select
          value={searchParams.get("type") || "all"}
          onValueChange={(v) => updateParams({ type: v === "all" ? null : v, page: "1" })}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="VMC">VMC</SelectItem>
            <SelectItem value="CMC">CMC</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("validity") || "all"}
          onValueChange={(v) => updateParams({ validity: v === "all" ? null : v, page: "1" })}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Validity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csvHeader = "Organization,Domain,CA,Type,Country,Issued,Expires";
            const csvRows = data.map((r) =>
              [
                r.subjectOrg || "",
                r.sanList[0] || r.subjectCn || "",
                r.issuerOrg || "",
                r.certType || "",
                r.subjectCountry || "",
                r.notBefore || "",
                r.notAfter || "",
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
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
                  className="cursor-pointer"
                  onClick={() => router.push(`/certificates/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
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
          Showing {data.length} of {pagination.total.toLocaleString()} certificates
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => updateParams({ page: String(pagination.page - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => updateParams({ page: String(pagination.page + 1) })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
