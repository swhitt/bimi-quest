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
} from "recharts";
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTooltip({ active, payload, label, colors }: any) {
  if (!active || !payload?.length) return null;

  const rows = [...payload]
    .filter((p: { value: number }) => (p.value ?? 0) > 0)
    .sort((a: { value: number }, b: { value: number }) => (b.value ?? 0) - (a.value ?? 0))
    .map((p: { name: string; value: number }) => ({
      color: getCAColor(colors, p.name ?? ""),
      name: p.name ?? "",
      value: (p.value ?? 0).toLocaleString(),
    }));

  const total = payload.reduce(
    (sum: number, p: { value: number }) => sum + (p.value ?? 0),
    0
  );

  let formattedLabel = String(label);
  try {
    formattedLabel = format(parseISO(`${label}-01`), "MMMM yyyy");
  } catch {
    // keep raw label
  }

  return (
    <ChartTooltipContent
      label={`${formattedLabel} (${total.toLocaleString()} total)`}
      rows={rows}
    />
  );
}

export function TrendChart({ data, selectedCA, apiQuery = "" }: TrendChartProps) {
  const colors = useChartColors();
  const isFiltered = selectedCA !== "All Issuers" && selectedCA in CA_COLOR_INDEX;

  // Normalize raw rootCaOrg values to display names
  const normalized = data.map((d) => ({
    ...d,
    ca: displayIssuerOrg(d.ca),
  }));

  // Drop the oldest month since it's always partial (query starts mid-month)
  const allMonths = [...new Set(normalized.map((d) => d.month))].sort();
  const months = allMonths.slice(1);

  // When a specific CA is selected, show only that CA.
  // When "All Issuers", show stacked bars.
  const displayCAs = isFiltered
    ? [selectedCA]
    : Object.keys(CA_COLOR_INDEX).filter((ca) =>
        normalized.some((d) => d.ca === ca)
      );

  const pivoted = months.map((month) => {
    const row: Record<string, string | number> = { month };
    for (const ca of displayCAs) {
      const point = normalized.find(
        (d) => d.month === month && d.ca === ca
      );
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
        <CardTitle>
          {isFiltered ? `${selectedCA} Issuance Trend` : "Issuance Trends"}
        </CardTitle>
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
      <CardContent>
        {pivoted.length > 0 ? (
          <div role="img" aria-label="Bar chart showing BIMI certificate issuance trends over time">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={pivoted}
              margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-border"
              />
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
                content={(props) => (
                  <TrendTooltip {...props} colors={colors} />
                )}
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
        ) : (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No trend data available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
