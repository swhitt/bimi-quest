"use client";

import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useChartColors, getCAColor, CA_COLOR_INDEX } from "@/lib/chart-colors";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { format, parseISO } from "date-fns";
import { displayIssuerOrg } from "@/lib/ca-display";

interface TrendDataPoint {
  month: string;
  ca: string | null;
  count: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  selectedCA: string;
  apiQuery?: string;
  /** When true, the first month is kept (user set an explicit date filter) */
  hasDateFilter?: boolean;
}

interface TrendTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function TrendTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: readonly TrendTooltipEntry[];
  label?: string | number;
  colors: ReturnType<typeof useChartColors>;
}) {
  if (!active || !payload?.length) return null;

  const rows = [...payload]
    .filter((p) => (p.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .map((p) => ({
      color: getCAColor(colors, p.name ?? ""),
      name: p.name ?? "",
      value: (p.value ?? 0).toLocaleString(),
    }));

  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);

  let formattedLabel = String(label);
  try {
    formattedLabel = format(parseISO(`${label}-01`), "MMMM yyyy");
  } catch {
    // keep raw label
  }

  return <ChartTooltipContent label={`${formattedLabel} (${total.toLocaleString()} total)`} rows={rows} />;
}

export function TrendChart({ data, selectedCA, apiQuery = "", hasDateFilter }: TrendChartProps) {
  const colors = useChartColors();
  const isFiltered = selectedCA !== "All Issuers" && selectedCA in CA_COLOR_INDEX;

  // Normalize raw rootCaOrg values to display names
  const normalized = data.map((d) => ({
    ...d,
    ca: displayIssuerOrg(d.ca),
  }));

  // Drop the oldest month when no date filter is active (it's partial from the 13-month window)
  const allMonths = [...new Set(normalized.map((d) => d.month))].sort();
  const months = hasDateFilter ? allMonths : allMonths.slice(1);

  // When a specific CA is selected, show only that CA.
  // When "All Issuers", show stacked bars — but filter out CAs with zero total across all
  // months so the rounded top radius is always on the visually topmost segment.
  const displayCAs = isFiltered
    ? [selectedCA]
    : Object.keys(CA_COLOR_INDEX).filter((ca) => {
        const total = normalized.filter((d) => d.ca === ca).reduce((sum, d) => sum + d.count, 0);
        return total > 0;
      });

  const pivoted = months.map((month) => {
    const row: Record<string, string | number> = { month };
    for (const ca of displayCAs) {
      const point = normalized.find((d) => d.month === month && d.ca === ca);
      row[ca] = point?.count ?? 0;
    }
    return row;
  });

  const tickFormatter = (value: string) => {
    try {
      return format(parseISO(`${value}-01`), "MMM");
    } catch {
      return value;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isFiltered ? `${selectedCA} Monthly Issuance` : "Monthly Issuance"}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Download trend data as CSV"
            onClick={() => {
              const sep = apiQuery ? "&" : "";
              window.location.href = `/api/export/dashboard?dataset=trends${sep}${apiQuery}`;
            }}
          >
            <Download />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {pivoted.length > 0 ? (
          <div className="flex flex-col gap-2 h-full">
            <div
              role="img"
              aria-label="Bar chart showing BIMI certificate issuance trends over time"
              className="flex-1 min-h-[240px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pivoted} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={tickFormatter}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    content={(props) => <TrendTooltip {...props} colors={colors} />}
                  />
                  {displayCAs.map((ca, i) => {
                    const color = getCAColor(colors, ca);
                    const isLast = i === displayCAs.length - 1;
                    return (
                      <Bar
                        key={ca}
                        dataKey={ca}
                        name={ca}
                        stackId={isFiltered ? undefined : "trend"}
                        fill={color}
                        fillOpacity={isFiltered ? 0.85 : 0.8}
                        radius={isFiltered || isLast ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend — only shown when multiple CAs are stacked */}
            {!isFiltered && displayCAs.length > 1 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
                {displayCAs.map((ca) => (
                  <div key={ca} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-4 rounded-sm"
                      style={{ background: getCAColor(colors, ca), opacity: 0.8 }}
                    />
                    <span>{ca}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground">
            No trend data available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
