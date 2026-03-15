"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface LogDistEntry {
  logName: string | null;
  logOperator: string | null;
  certCount: number;
}

interface SctCountEntry {
  sctCount: number | null;
  certCount: number;
}

interface LagByCA {
  ca: string | null;
  avgLag: string | null;
  certCount: number;
}

interface SctStats {
  logDistribution: LogDistEntry[];
  sctCountDistribution: SctCountEntry[];
  avgLagByCA: LagByCA[];
  singleLogCerts: number;
}

const BAR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function formatLag(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function TransparencyContent() {
  const [data, setData] = useState<SctStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats/sct?from=all")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {error ? `Failed to load SCT data: ${error}` : "No SCT data available yet. Run the backfill worker first."}
        </CardContent>
      </Card>
    );
  }

  const totalScts = data.logDistribution.reduce((sum, d) => sum + d.certCount, 0);
  const totalCertsWithScts = data.sctCountDistribution.reduce((sum, d) => sum + d.certCount, 0);

  // Log distribution chart data
  const logChartData = data.logDistribution.map((d) => ({
    name: d.logName || "Unknown",
    operator: d.logOperator || "Unknown",
    count: d.certCount,
  }));

  // SCT count histogram
  const sctCountData = data.sctCountDistribution
    .filter((d) => d.sctCount != null)
    .map((d) => ({
      scts: `${d.sctCount}`,
      count: d.certCount,
    }));

  // Lag by CA
  const lagData = data.avgLagByCA
    .filter((d) => d.avgLag != null)
    .map((d) => ({
      ca: d.ca || "Unknown",
      avgLag: Math.round(Number(d.avgLag)),
      certCount: d.certCount,
    }))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalScts.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total SCT entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalCertsWithScts.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Certs with SCT data</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{data.logDistribution.length}</div>
            <p className="text-xs text-muted-foreground">Distinct CT logs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{Number(data.singleLogCerts).toLocaleString()}</span>
              {Number(data.singleLogCerts) > 0 && (
                <Badge variant="destructive" className="text-xs">
                  Risk
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Single-log certs</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Log distribution */}
        <Card>
          <CardHeader>
            <CardTitle>CT Log Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {logChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(logChartData.length * 32, 150)}>
                <BarChart data={logChartData} layout="vertical" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} className="stroke-border" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--color-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--color-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={160}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <ChartTooltipContent
                          label={`${label}`}
                          rows={[
                            { color: BAR_COLORS[0], name: "Operator", value: d.operator },
                            { color: BAR_COLORS[0], name: "Certs", value: d.count.toLocaleString() },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Certificates">
                    {logChartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-4">No log distribution data.</p>
            )}
          </CardContent>
        </Card>

        {/* SCT count histogram */}
        <Card>
          <CardHeader>
            <CardTitle>SCTs per Certificate</CardTitle>
          </CardHeader>
          <CardContent>
            {sctCountData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sctCountData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} className="stroke-border" />
                  <XAxis
                    dataKey="scts"
                    tick={{ fontSize: 12, fill: "var(--color-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Number of SCTs", position: "insideBottom", offset: -2, fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 12, fill: "var(--color-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <ChartTooltipContent
                          label={`${d.scts} SCT${d.scts !== "1" ? "s" : ""}`}
                          rows={[{ color: BAR_COLORS[1], name: "Certificates", value: d.count.toLocaleString() }]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="count" fill={BAR_COLORS[1]} fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-4">No SCT count data.</p>
            )}
          </CardContent>
        </Card>

        {/* Lag analysis by CA */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Average Issuance-to-SCT Lag by CA</CardTitle>
          </CardHeader>
          <CardContent>
            {lagData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Root CA</th>
                      <th className="pb-2 pr-4">Avg Lag</th>
                      <th className="pb-2">Certs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lagData.map((d) => (
                      <tr key={d.ca} className="border-b last:border-0">
                        <td className="py-2 pr-4">{d.ca}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{formatLag(d.avgLag)}</td>
                        <td className="py-2">{d.certCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-4">No lag data available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
