"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredData } from "@/lib/use-filtered-data";

interface RuaProviderRow {
  provider: string;
  domainCount: number;
}

interface RuaTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function RuaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly RuaTooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const count = payload[0]?.value ?? 0;

  return (
    <ChartTooltipContent
      label={label}
      rows={[{ color: payload[0]?.color ?? "oklch(0.55 0.15 230)", name: "Domains", value: count.toLocaleString() }]}
    />
  );
}

export function RuaProviderChart() {
  const { data, loading } = useFilteredData<RuaProviderRow[]>(
    "/api/stats/rua-providers",
    (json: unknown) => (json as { data?: RuaProviderRow[] }).data ?? [],
    [],
  );

  if (loading && data.length === 0) {
    return (
      <div>
        <div className="mb-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            dmarc report destinations
          </span>
          <p className="text-[10px] text-muted-foreground/70">Top aggregate report (rua) providers by domain count</p>
        </div>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const chartData = data.slice(0, 15).map((d) => ({
    name: d.provider,
    domainCount: d.domainCount,
  }));

  const barHeight = Math.max(chartData.length * 28, 120);

  return (
    <div>
      <div className="mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          dmarc report destinations
        </span>
        <p className="text-[10px] text-muted-foreground/70">Top aggregate report (rua) providers by domain count</p>
      </div>
      {chartData.length > 0 ? (
        <div role="img" aria-label="Horizontal bar chart showing top DMARC RUA report destination providers">
          <ResponsiveContainer width="100%" height={barHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} className="stroke-border" />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
                width={140}
              />
              <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<RuaTooltip />} />
              <Bar
                dataKey="domainCount"
                name="Domains"
                fill="oklch(0.55 0.15 230)"
                fillOpacity={0.85}
                radius={[0, 3, 3, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No RUA data available.
        </div>
      )}
    </div>
  );
}
