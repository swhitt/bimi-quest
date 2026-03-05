"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredData } from "@/lib/use-filtered-data";

export interface OrgRow {
  org: string | null;
  total: number;
  maxNotability: number | null;
  industry: string | null;
  country: string | null;
}

export function TopOrgs({ initialData }: { initialData?: OrgRow[] }) {
  const { data: orgs, loading } = useFilteredData<OrgRow[]>(
    "/api/stats/top-orgs",
    (json: unknown) => (json as { data?: OrgRow[] }).data ?? [],
    initialData ?? [],
    initialData,
  );

  if (loading && orgs.length === 0) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">top orgs</span>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const orgs10 = orgs.slice(0, 10);

  return (
    <div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">top orgs</span>
      {orgs10.length > 0 ? (
        <ol className="mt-1 space-y-1 max-h-[320px] overflow-y-auto">
          {orgs10.map((org, i) => (
            <li key={org.org} className="flex items-center gap-1.5 text-[13px]">
              <span className="font-mono tabular-nums text-muted-foreground/50 w-5 text-right shrink-0 text-[11px]">
                {String(i + 1).padStart(2, "0")}.
              </span>
              <div className="min-w-0 flex-1 truncate">
                {org.org ? (
                  <Link href={`/orgs/${encodeURIComponent(org.org)}`} className="hover:underline truncate">
                    {org.org}
                  </Link>
                ) : (
                  <span className="truncate">Unknown</span>
                )}
              </div>
              <span className="font-mono tabular-nums text-muted-foreground text-[12px] shrink-0">{org.total}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No organizations match current filters.
        </div>
      )}
    </div>
  );
}
