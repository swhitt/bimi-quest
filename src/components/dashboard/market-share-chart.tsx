"use client";

import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useChartColors, getCAColor, CA_COLOR_INDEX } from "@/lib/chart-colors";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { cn } from "@/lib/utils";
import { displayIssuerOrg } from "@/lib/ca-display";

interface CABreakdown {
  ca: string | null;
  total: number;
  vmcCount: number;
  cmcCount: number;
}

interface MarketShareChartProps {
  data: CABreakdown[];
  selectedCA: string;
  apiQuery?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTooltip({ active, payload, colors }: any) {
  if (!active || !payload?.length) return null;

  const entry = payload[0]?.payload;
  if (!entry) return null;

  const rows = [];
  if (entry.vmcCount > 0) {
    rows.push({
      color: getCAColor(colors, entry.name),
      name: "VMC",
      value: entry.vmcCount.toLocaleString(),
    });
  }
  if (entry.cmcCount > 0) {
    rows.push({
      color: `${getCAColor(colors, entry.name)}80`,
      name: "CMC",
      value: entry.cmcCount.toLocaleString(),
    });
  }

  const pct = entry.grandTotal > 0
    ? ((entry.total / entry.grandTotal) * 100).toFixed(1)
    : "0.0";

  return (
    <ChartTooltipContent
      label={`${entry.name} (${entry.total.toLocaleString()} total, ${pct}%)`}
      rows={rows}
    />
  );
}

export function MarketShareChart({ data, selectedCA, apiQuery = "" }: MarketShareChartProps) {
  const colors = useChartColors();
  const isFiltered = selectedCA !== "All Issuers" && selectedCA in CA_COLOR_INDEX;

  const grandTotal = data.reduce((s, d) => s + d.total, 0);

  // Sort by total descending, highest volume at top
  const chartData = [...data]
    .sort((a, b) => b.total - a.total)
    .map((d) => ({
      name: displayIssuerOrg(d.ca),
      total: d.total,
      vmcCount: d.vmcCount,
      cmcCount: d.cmcCount,
      grandTotal,
    }));

  // Compute the dynamic bar chart height: each bar ~40px, plus margins
  const barHeight = Math.max(chartData.length * 40, 120);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Share by CA</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Download market share as CSV"
            onClick={() => {
              const sep = apiQuery ? "&" : "";
              window.location.href = `/api/export/dashboard?dataset=market-share${sep}${apiQuery}`;
            }}
          >
            <Download />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div role="img" aria-label="Horizontal bar chart showing certificate distribution by Certificate Authority">
              <ResponsiveContainer width="100%" height={barHeight}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
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
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    content={(props) => (
                      <BarTooltip {...props} colors={colors} />
                    )}
                  />
                  <Bar
                    dataKey="vmcCount"
                    name="VMC"
                    stackId="share"
                    radius={[0, 0, 0, 0]}
                  >
                    {chartData.map((entry) => {
                      const isSelected = entry.name === selectedCA;
                      return (
                        <Cell
                          key={`vmc-${entry.name}`}
                          fill={getCAColor(colors, entry.name)}
                          fillOpacity={isFiltered && !isSelected ? 0.2 : 0.9}
                        />
                      );
                    })}
                  </Bar>
                  <Bar
                    dataKey="cmcCount"
                    name="CMC"
                    stackId="share"
                    radius={[0, 3, 3, 0]}
                  >
                    {chartData.map((entry) => {
                      const isSelected = entry.name === selectedCA;
                      return (
                        <Cell
                          key={`cmc-${entry.name}`}
                          fill={getCAColor(colors, entry.name)}
                          fillOpacity={isFiltered && !isSelected ? 0.1 : 0.45}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend for VMC vs CMC distinction */}
            <div className="flex items-center gap-4 px-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-sm bg-foreground/70" />
                <span>VMC</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-sm bg-foreground/30" />
                <span>CMC</span>
              </div>
            </div>

            {/* Summary list with percentage */}
            <div className="space-y-1 px-1">
              {chartData.map((entry) => {
                const pct =
                  grandTotal > 0 ? (entry.total / grandTotal) * 100 : 0;
                const isSelected = entry.name === selectedCA;
                return (
                  <div
                    key={entry.name}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                      isSelected && "bg-muted font-medium",
                      isFiltered && !isSelected && "opacity-50"
                    )}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: getCAColor(colors, entry.name) }}
                    />
                    <span className="flex-1">{entry.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {entry.total.toLocaleString()}
                    </span>
                    <span className="w-14 text-right tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
