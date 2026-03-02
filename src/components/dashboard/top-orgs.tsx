"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { Skeleton } from "@/components/ui/skeleton";

interface OrgRow {
  org: string | null;
  total: number;
  maxNotability: number | null;
  industry: string | null;
  country: string | null;
}

export function TopOrgs() {
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<OrgRow[]>([]);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);

  const filterParams = buildApiParams();
  const loading = loadedParams !== filterParams;

  useEffect(() => {
    fetch(`/api/stats/top-orgs?${filterParams}`)
      .then((res) => res.json())
      .then((json) => setData(json.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoadedParams(filterParams));
  }, [filterParams]);

  if (loading && data.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium mb-3">Who&rsquo;s Adopting</h3>
        <Skeleton className="h-[260px]" />
      </div>
    );
  }

  const orgs = data.slice(0, 15);

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">Who&rsquo;s Adopting</h3>
      {orgs.length > 0 ? (
        <ol className="space-y-1.5">
          {orgs.map((org, i) => (
            <li key={org.org} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground/60 tabular-nums w-4 text-right shrink-0">{i + 1}</span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {org.org ? (
                  <Link href={`/orgs/${encodeURIComponent(org.org)}`} className="truncate font-medium hover:underline">
                    {org.org}
                  </Link>
                ) : (
                  <span className="truncate font-medium">Unknown</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                {org.industry && <span className="hidden sm:inline">{org.industry}</span>}
                {org.country && <span>{org.country}</span>}
                <span className="tabular-nums font-medium text-foreground">{org.total}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground">
          No organizations match current filters.
        </div>
      )}
    </div>
  );
}
