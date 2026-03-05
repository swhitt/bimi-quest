"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function MiniPagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-1 pt-0.5">
      <button
        type="button"
        disabled={page <= 1}
        onClick={onPrev}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {page}/{totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={onNext}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Next page"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
