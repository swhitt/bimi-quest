"use client";

import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { displayIntermediateCa } from "@/lib/ca-display";
import { CA_COLOR_INDEX, useCertTypeColors } from "@/lib/chart-colors";

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
  const isFiltered = selectedCA !== "All Intermediates" && selectedCA in CA_COLOR_INDEX;

  const grandTotal = data.reduce((s, d) => s + d.total, 0);

  const chartData = [...data]
    .sort((a, b) => b.total - a.total)
    .map((d) => ({
      name: displayIntermediateCa(d.ca),
      total: d.total,
      vmcCount: d.vmcCount,
      cmcCount: d.cmcCount,
      grandTotal,
    }));

  const barHeight = Math.min(Math.max(chartData.length * 40, 120), 280);

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">market share</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-foreground"
          title="Download market share as CSV"
          onClick={() => {
            const sep = apiQuery ? "&" : "";
            window.location.href = `/api/export/dashboard?dataset=market-share${sep}${apiQuery}`;
          }}
        >
          <Download className="size-3" />
        </Button>
      </div>
      {chartData.length > 0 ? (
        <div
          role="img"
          aria-label="Horizontal bar chart showing certificate distribution by Certificate Authority"
          className="max-h-[280px] overflow-y-auto"
        >
          <ResponsiveContainer width="100%" height={barHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid horizontal={false} className="stroke-border" />
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
              <Bar dataKey="vmcCount" name="VMC" stackId="share" fill={certColors.VMC}>
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
              <Bar dataKey="cmcCount" name="CMC" stackId="share" fill={certColors.CMC}>
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
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground">
          No certificates match current filters.
        </div>
      )}
    </div>
  );
}
