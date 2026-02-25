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
import dynamic from "next/dynamic";

const WorldMap = dynamic(
  () => import("@/components/world-map").then((mod) => ({ default: mod.WorldMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        Loading map...
      </div>
    ),
  }
);

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
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const apiQuery = buildApiParams();

  useEffect(() => {
    setError(null);
    setLoading(true);
    fetch(`/api/stats/geo?${apiQuery}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((json) => setData(json.geoData || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load geographic data"))
      .finally(() => setLoading(false));
  }, [apiQuery, retryKey]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">{error}</p>
        <button
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => setRetryKey((k) => k + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

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
          <CardTitle>Certificates by Country ({total.toLocaleString()} total)</CardTitle>
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
