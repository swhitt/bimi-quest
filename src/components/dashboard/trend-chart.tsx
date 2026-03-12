"use client";

import { format, lastDayOfMonth, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { displayIntermediateCa } from "@/lib/ca-display";
import { CA_COLOR_INDEX, getCAColor, useChartColors } from "@/lib/chart-colors";

interface TrendDataPoint {
  month: string;
  ca: string | null;
  count: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  selectedCA: string;
  apiQuery?: string;
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
  const router = useRouter();
  const colors = useChartColors();
  const isFiltered = selectedCA !== "All Intermediates" && selectedCA in CA_COLOR_INDEX;

  const normalized = data.map((d) => ({
    ...d,
    ca: displayIntermediateCa(d.ca),
  }));

  const allMonths = [...new Set(normalized.map((d) => d.month))].sort();
  const months = hasDateFilter ? allMonths : allMonths.slice(1);

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
      return format(parseISO(`${value}-01`), "MMM ''yy");
    } catch {
      return value;
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {isFiltered ? `${selectedCA} issuance` : "issuance trend"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-foreground"
          title="Download trend data as CSV"
          onClick={() => {
            const sep = apiQuery ? "&" : "";
            window.location.href = `/api/export/dashboard?dataset=trends${sep}${apiQuery}`;
          }}
        >
          <Download className="size-3" />
        </Button>
      </div>
      {pivoted.length > 0 ? (
        <div role="img" aria-label="Bar chart showing BIMI certificate issuance trends over time" className="h-[200px]">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pivoted} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} className="stroke-border" />
              <XAxis
                dataKey="month"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 12, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                content={(props) => <TrendTooltip {...props} colors={colors} />}
              />
              {displayCAs.map((ca) => {
                const color = getCAColor(colors, ca);
                return (
                  <Bar
                    key={ca}
                    dataKey={ca}
                    name={ca}
                    stackId={isFiltered ? undefined : "trend"}
                    fill={color}
                    fillOpacity={isFiltered ? 0.85 : 0.8}
                    style={{ cursor: "pointer" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts onClick data includes custom keys
                    onClick={(d: any) => {
                      const month = String(d.month ?? "");
                      if (!month) return;
                      const from = `${month}-01`;
                      const end = lastDayOfMonth(parseISO(from));
                      router.push(`/certificates?from=${from}&to=${format(end, "yyyy-MM-dd")}`);
                    }}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground">
          No trend data available yet.
        </div>
      )}
    </div>
  );
}
