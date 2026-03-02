"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { Skeleton } from "@/components/ui/skeleton";

interface IndustryRow {
  industry: string | null;
  total: number;
  vmcCount: number;
  cmcCount: number;
}

const VMC_COLOR = "oklch(0.65 0.18 230)";
const CMC_COLOR = "oklch(0.70 0.14 165)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IndustryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .filter((p: { value: number }) => (p.value ?? 0) > 0)
    .map((p: { name: string; value: number; color: string }) => ({
      color: p.color,
      name: p.name,
      value: (p.value ?? 0).toLocaleString(),
    }));

  const total = payload.reduce((sum: number, p: { value: number }) => sum + (p.value ?? 0), 0);

  return <ChartTooltipContent label={`${label} (${total.toLocaleString()} total)`} rows={rows} />;
}

export function IndustryChart() {
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<IndustryRow[]>([]);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);

  const filterParams = buildApiParams();
  const loading = loadedParams !== filterParams;

  useEffect(() => {
    fetch(`/api/stats/industry-breakdown?${filterParams}`)
      .then((res) => res.json())
      .then((json) => setData(json.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoadedParams(filterParams));
  }, [filterParams]);

  if (loading && data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Adoption by Sector</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px]" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: d.industry || "Unknown",
    vmcCount: d.vmcCount,
    cmcCount: d.cmcCount,
    total: d.total,
  }));

  const barHeight = Math.max(chartData.length * 28, 120);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adoption by Sector</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div role="img" aria-label="Horizontal bar chart showing certificate distribution by industry">
              <ResponsiveContainer width="100%" height={barHeight}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<IndustryTooltip />} />
                  <Bar dataKey="vmcCount" name="VMC" stackId="industry" fill={VMC_COLOR} fillOpacity={0.9} />
                  <Bar
                    dataKey="cmcCount"
                    name="CMC"
                    stackId="industry"
                    fill={CMC_COLOR}
                    fillOpacity={0.7}
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 px-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: VMC_COLOR, opacity: 0.9 }} />
                <span>VMC</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: CMC_COLOR, opacity: 0.7 }} />
                <span>CMC</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground">
            No industry data for current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
