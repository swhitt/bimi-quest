"use client";

import { MiniPagination } from "@/components/dashboard/mini-pagination";
import { OrgChip } from "@/components/org-chip";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrgRow } from "@/lib/data/stats";
import { usePaginatedData } from "@/lib/use-paginated-data";

export type { OrgRow };

const PAGE_SIZE = 15;

export function TopOrgs({ initialData, initialTotalPages }: { initialData?: OrgRow[]; initialTotalPages?: number }) {
  const {
    data: orgs,
    page,
    totalPages,
    setPage,
    loading,
    error,
    retry,
  } = usePaginatedData<OrgRow>({
    url: "/api/stats/top-orgs",
    pageSize: PAGE_SIZE,
    extractData: (json) => (json as { data?: OrgRow[] }).data ?? [],
    extractTotalPages: (json) => (json as { pagination?: { totalPages?: number } }).pagination?.totalPages ?? 1,
    initialData,
    initialTotalPages,
  });

  if (loading && orgs.length === 0) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">top orgs</span>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">top orgs</span>
        <div className="flex h-[200px] flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">Failed to load</p>
          <button className="text-xs underline text-muted-foreground hover:text-foreground" onClick={retry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">top orgs</span>
      {orgs.length > 0 ? (
        <div className="space-y-1">
          <ol className="mt-1 space-y-0.5">
            {orgs.map((org, i) => (
              <li key={org.org} className="flex items-center gap-1.5 text-[13px]">
                <span className="font-mono tabular-nums text-muted-foreground w-5 text-right shrink-0 text-[11px]">
                  {String((page - 1) * PAGE_SIZE + i + 1).padStart(2, "0")}.
                </span>
                <div className="min-w-0 flex-1 truncate">
                  {org.org ? <OrgChip org={org.org} size="xs" compact /> : <span className="truncate">Unknown</span>}
                </div>
                <span className="font-mono tabular-nums text-muted-foreground text-[12px] shrink-0">{org.total}</span>
              </li>
            ))}
          </ol>
          <MiniPagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No organizations match current filters.
        </div>
      )}
    </div>
  );
}
