"use client";

import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayIssuerOrg } from "@/lib/ca-display";
import { CA_COLOR_INDEX, useCertTypeColors } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

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

interface MarketShareDataPoint {
  name: string;
  total: number;
  vmcCount: number;
  cmcCount: number;
  grandTotal: number;
}

interface BarTooltipEntry {
  name: string;
  value: number;
  color: string;
  payload: MarketShareDataPoint;
}

function BarTooltip({
  active,
  payload,
  vmcColor,
  cmcColor,
}: {
  active?: boolean;
  payload?: readonly BarTooltipEntry[];
  vmcColor: string;
  cmcColor: string;
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0]?.payload;
  if (!entry) return null;

  const rows = [];
  if (entry.vmcCount > 0) {
    rows.push({ color: vmcColor, name: "VMC", value: entry.vmcCount.toLocaleString() });
  }
  if (entry.cmcCount > 0) {
    rows.push({ color: cmcColor, name: "CMC", value: entry.cmcCount.toLocaleString() });
  }

  const pct = entry.grandTotal > 0 ? ((entry.total / entry.grandTotal) * 100).toFixed(1) : "0.0";

  return <ChartTooltipContent label={`${entry.name} (${entry.total.toLocaleString()} total, ${pct}%)`} rows={rows} />;
}

export function MarketShareChart({ data, selectedCA, apiQuery = "" }: MarketShareChartProps) {
  const certColors = useCertTypeColors();
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

  // Cap the chart height to prevent layout shifts when filters change the data count
  const barHeight = Math.min(Math.max(chartData.length * 40, 120), 400);

  return (
    <Card>
      <CardHeader>
        <CardTitle>CA Market Share</CardTitle>
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
            <div
              role="img"
              aria-label="Horizontal bar chart showing certificate distribution by Certificate Authority"
              className="max-h-[400px] overflow-y-auto"
            >
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
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    content={(props) => <BarTooltip {...props} vmcColor={certColors.VMC} cmcColor={certColors.CMC} />}
                  />
                  <Bar dataKey="vmcCount" name="VMC" stackId="share" fill={certColors.VMC} radius={[0, 0, 0, 0]}>
                    {chartData.map((entry) => {
                      const isSelected = entry.name === selectedCA;
                      return (
                        <Cell
                          key={`vmc-${entry.name}`}
                          fill={certColors.VMC}
                          fillOpacity={isFiltered && !isSelected ? 0.2 : 0.9}
                        />
                      );
                    })}
                  </Bar>
                  <Bar dataKey="cmcCount" name="CMC" stackId="share" fill={certColors.CMC} radius={[0, 3, 3, 0]}>
                    {chartData.map((entry) => {
                      const isSelected = entry.name === selectedCA;
                      return (
                        <Cell
                          key={`cmc-${entry.name}`}
                          fill={certColors.CMC}
                          fillOpacity={isFiltered && !isSelected ? 0.2 : 0.8}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Summary list with percentage */}
            <div className="space-y-1 px-1">
              {chartData.map((entry) => {
                const pct = grandTotal > 0 ? (entry.total / grandTotal) * 100 : 0;
                const isSelected = entry.name === selectedCA;
                return (
                  <div
                    key={entry.name}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                      isSelected && "bg-muted font-medium",
                      isFiltered && !isSelected && "opacity-50",
                    )}
                  >
                    <span className="flex-1">{entry.name}</span>
                    <span className="tabular-nums text-muted-foreground">{entry.total.toLocaleString()}</span>
                    <span className="w-14 text-right tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground">
            No certificates match current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
