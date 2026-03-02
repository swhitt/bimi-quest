"use client";

import Link from "next/link";
import { useFilteredData } from "@/lib/use-filtered-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface OrgRow {
  org: string | null;
  total: number;
  maxNotability: number | null;
  industry: string | null;
  country: string | null;
}

export function TopOrgs() {
  const { data: orgs, loading } = useFilteredData<OrgRow[]>(
    "/api/stats/top-orgs",
    (json: unknown) => (json as { data?: OrgRow[] }).data ?? [],
    [],
  );

  if (loading && orgs.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Who&rsquo;s Adopting</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px]" />
        </CardContent>
      </Card>
    );
  }

  const orgs15 = orgs.slice(0, 15);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Who&rsquo;s Adopting</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {orgs15.length > 0 ? (
          <ol className="space-y-1.5">
            {orgs15.map((org, i) => (
              <li key={org.org} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground/60 tabular-nums w-4 text-right shrink-0">{i + 1}</span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {org.org ? (
                    <Link
                      href={`/orgs/${encodeURIComponent(org.org)}`}
                      className="truncate font-medium hover:underline"
                    >
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
      </CardContent>
    </Card>
  );
}
