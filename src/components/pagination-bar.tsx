"use client";

import { Button } from "@/components/ui/button";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function PaginationBar({
  pagination,
  onPageChange,
  noun = "certificates",
}: {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {pagination.total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          className="min-w-9 min-h-9 sm:min-w-auto sm:min-h-auto"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="min-w-9 min-h-9 sm:min-w-auto sm:min-h-auto"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm tabular-nums flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Current page"
            className="w-10 text-center text-sm tabular-nums bg-transparent border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
            defaultValue={pagination.page}
            key={pagination.page}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = Math.max(
                  1,
                  Math.min(pagination.totalPages, parseInt((e.target as HTMLInputElement).value) || 1),
                );
                onPageChange(val);
              }
            }}
            onBlur={(e) => {
              const parsed = parseInt(e.currentTarget.value, 10);
              if (isNaN(parsed) || parsed < 1 || parsed > pagination.totalPages) {
                e.currentTarget.value = String(pagination.page);
                return;
              }
              if (parsed !== pagination.page) {
                onPageChange(parsed);
              }
            }}
          />
          <span className="text-muted-foreground">/ {pagination.totalPages}</span>
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          className="min-w-9 min-h-9 sm:min-w-auto sm:min-h-auto"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="min-w-9 min-h-9 sm:min-w-auto sm:min-h-auto"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.totalPages)}
          aria-label="Last page"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
