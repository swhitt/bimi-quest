"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrgChip } from "@/components/org-chip";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { cn } from "@/lib/utils";

interface LeaderboardRow {
  org: string;
  total: number;
  vmcCount: number;
  cmcCount: number;
  activeCerts: number;
  industry: string | null;
  country: string | null;
  maxNotability: number | null;
}

interface LeaderboardResponse {
  data: LeaderboardRow[];
  pagination: {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
}

const PAGE_SIZE = 50;

export function LeaderboardContent() {
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<LeaderboardRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const filterParams = buildApiParams({ page: String(p), limit: String(PAGE_SIZE) });
        const res = await fetch(`/api/stats/leaderboard?${filterParams}`);
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json: LeaderboardResponse = await res.json();
        setData(json.data);
        setTotalPages(json.pagination.totalPages);
        setTotal(json.pagination.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [buildApiParams],
  );

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  if (error) {
    return (
      <Card>
        <CardContent className="flex h-64 flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchData(page)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-3 w-12 font-medium">#</th>
                  <th className="px-3 py-3 font-medium">Organization</th>
                  <th className="px-3 py-3 font-medium text-right">Total</th>
                  <th className="px-3 py-3 font-medium text-right">VMC</th>
                  <th className="px-3 py-3 font-medium text-right">CMC</th>
                  <th className="px-3 py-3 font-medium text-right">Active</th>
                  <th className="px-3 py-3 font-medium">Industry</th>
                  <th className="px-3 py-3 font-medium">Country</th>
                </tr>
              </thead>
              <tbody>
                {loading && data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                      No organizations match current filters.
                    </td>
                  </tr>
                )}
                {data.map((row, i) => {
                  const rank = (page - 1) * PAGE_SIZE + i + 1;
                  const activeRate = row.total > 0 ? Math.round((row.activeCerts / row.total) * 100) : 0;
                  return (
                    <tr
                      key={row.org}
                      className={cn("border-b last:border-0 hover:bg-muted/50", loading && "opacity-50")}
                    >
                      <td className="px-3 py-2.5 font-mono text-muted-foreground tabular-nums">{rank}</td>
                      <td className="px-3 py-2.5">
                        <OrgChip org={row.org} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{row.total}</td>
                      <td className="px-3 py-2.5 text-right">
                        {row.vmcCount > 0 ? (
                          <Badge variant="secondary" className="bg-blue-500/15 text-blue-700 dark:text-blue-400">
                            {row.vmcCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {row.cmcCount > 0 ? (
                          <Badge variant="secondary" className="bg-purple-500/15 text-purple-700 dark:text-purple-400">
                            {row.cmcCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            activeRate === 100
                              ? "text-green-600"
                              : activeRate >= 50
                                ? "text-yellow-600"
                                : "text-red-600",
                          )}
                        >
                          {activeRate}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.industry ?? "\u2014"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.country ?? "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {total.toLocaleString()} organizations &middot; page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
