"use client";

import { Button } from "@/components/ui/button";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";

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
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {pagination.total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm tabular-nums flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            className="w-10 text-center text-sm tabular-nums bg-transparent border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
            defaultValue={pagination.page}
            key={pagination.page}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = Math.max(
                  1,
                  Math.min(
                    pagination.totalPages,
                    parseInt((e.target as HTMLInputElement).value) || 1
                  )
                );
                onPageChange(val);
              }
            }}
            onBlur={(e) => {
              const val = Math.max(
                1,
                Math.min(
                  pagination.totalPages,
                  parseInt(e.target.value) || 1
                )
              );
              if (val !== pagination.page) {
                onPageChange(val);
              }
            }}
          />
          <span className="text-muted-foreground">
            / {pagination.totalPages}
          </span>
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.totalPages)}
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
