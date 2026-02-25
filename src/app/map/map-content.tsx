"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { WorldMap } from "@/components/world-map";

interface GeoEntry {
  country: string | null;
  total: number;
  vmcCount: number;
  cmcCount: number;
}

export function MapContent() {
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<GeoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const apiQuery = buildApiParams();

  useEffect(() => {
    fetch(`/api/stats/geo?${apiQuery}`)
      .then((res) => res.json())
      .then((json) => setData(json.geoData || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiQuery]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading geographic data...
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.total, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Global BIMI Certificate Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorldMap data={data.map((d) => ({ country: d.country || "", total: d.total }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Certificates by Country ({total.toLocaleString()} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.length > 0 ? (
            <div className="space-y-2">
              {data.slice(0, 20).map((entry) => {
                const pct = total > 0 ? (entry.total / total) * 100 : 0;
                return (
                  <div
                    key={entry.country || "unknown"}
                    className="flex items-center gap-3"
                  >
                    <span className="w-8 text-right font-mono text-sm">
                      {entry.country || "??"}
                    </span>
                    <div className="flex-1">
                      <div
                        className="h-6 rounded flex items-center px-2"
                        style={{
                          background: "var(--chart-1)",
                          width: `${Math.max(pct, 2)}%`,
                        }}
                      >
                        <span className="text-xs text-primary-foreground font-medium">
                          {entry.total}
                        </span>
                      </div>
                    </div>
                    <span className="w-16 text-right text-sm text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">No geographic data available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Countries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">VMC</TableHead>
                <TableHead className="text-right">CMC</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.country || "unknown"}>
                  <TableCell className="font-medium">
                    {entry.country || "Unknown"}
                  </TableCell>
                  <TableCell className="text-right">{entry.total}</TableCell>
                  <TableCell className="text-right">{entry.vmcCount}</TableCell>
                  <TableCell className="text-right">{entry.cmcCount}</TableCell>
                  <TableCell className="text-right">
                    {total > 0 ? ((entry.total / total) * 100).toFixed(1) : 0}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
