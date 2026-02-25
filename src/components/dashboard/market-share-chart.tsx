"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useChartColors, getCAColor, CA_COLOR_INDEX } from "@/lib/chart-colors";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { cn } from "@/lib/utils";

interface CABreakdown {
  ca: string | null;
  total: number;
}

interface MarketShareChartProps {
  data: CABreakdown[];
  selectedCA: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload, colors }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const pct = ((Number(entry.payload?.percent) || 0) * 100).toFixed(1);
  return (
    <ChartTooltipContent
      rows={[
        {
          color: getCAColor(colors, entry.name ?? ""),
          name: entry.name ?? "",
          value: `${(entry.value ?? 0).toLocaleString()} (${pct}%)`,
        },
      ]}
    />
  );
}

export function MarketShareChart({ data, selectedCA }: MarketShareChartProps) {
  const colors = useChartColors();
  const isFiltered = selectedCA !== "All CAs" && selectedCA in CA_COLOR_INDEX;

  const chartData = data.map((d) => ({
    name: d.ca || "Unknown",
    value: d.total,
  }));

  const grandTotal = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Share by CA</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div role="img" aria-label="Market share pie chart showing certificate distribution by Certificate Authority">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  minAngle={4}
                  label={false}
                  labelLine={false}
                >
                  {chartData.map((entry) => {
                    const isSelected = entry.name === selectedCA;
                    return (
                      <Cell
                        key={entry.name}
                        fill={getCAColor(colors, entry.name)}
                        fillOpacity={isFiltered && !isSelected ? 0.25 : 1}
                        stroke={isSelected ? getCAColor(colors, entry.name) : "transparent"}
                        strokeWidth={isSelected ? 3 : 0}
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  content={(props) => (
                    <PieTooltip {...props} colors={colors} />
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
            </div>

            <div className="space-y-1 px-1">
              {chartData.map((entry) => {
                const pct =
                  grandTotal > 0 ? (entry.value / grandTotal) * 100 : 0;
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
                      {entry.value.toLocaleString()}
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
