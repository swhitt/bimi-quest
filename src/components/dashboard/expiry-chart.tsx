"use client";

import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { displayIssuerOrg } from "@/lib/ca-display";
import { CA_COLOR_INDEX, getCAColor, useChartColors } from "@/lib/chart-colors";
import { useFilteredData } from "@/lib/use-filtered-data";
import { useGlobalFilters } from "@/lib/use-global-filters";

export interface ExpiryRow {
  month: string;
  ca: string | null;
  total: number;
}

interface ExpiryTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function ExpiryTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: readonly ExpiryTooltipEntry[];
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

  return <ChartTooltipContent label={`${formattedLabel} (${total.toLocaleString()} expiring)`} rows={rows} />;
}

export function ExpiryChart({ initialData }: { initialData?: ExpiryRow[] }) {
  const colors = useChartColors();
  const { buildApiParams } = useGlobalFilters();
  const filterParams = buildApiParams();
  const { data, loading } = useFilteredData<ExpiryRow[]>(
    "/api/stats/expiry-timeline",
    (json: unknown) => (json as { data?: ExpiryRow[] }).data ?? [],
    initialData ?? [],
    initialData,
  );

  if (loading && data.length === 0) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">expirations</span>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const normalized = data.map((d) => ({
    ...d,
    ca: displayIssuerOrg(d.ca),
  }));

  const months = [...new Set(normalized.map((d) => d.month))].sort();
  const cas = Object.keys(CA_COLOR_INDEX).filter((ca) => normalized.some((d) => d.ca === ca));

  const pivoted = months.map((month) => {
    const row: Record<string, string | number> = { month };
    for (const ca of cas) {
      const point = normalized.find((d) => d.month === month && d.ca === ca);
      row[ca] = point?.total ?? 0;
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
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">expirations</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-foreground"
          title="Download expiry data as CSV"
          onClick={() => {
            const q = filterParams;
            const sep = q ? "&" : "";
            window.location.href = `/api/export/dashboard?dataset=expiry${sep}${q}`;
          }}
        >
          <Download className="size-3" />
        </Button>
      </div>
      {pivoted.length > 0 ? (
        <div role="img" aria-label="Stacked bar chart showing upcoming certificate expirations by month">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pivoted} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} className="stroke-border" />
              <XAxis
                dataKey="month"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                content={(props) => <ExpiryTooltip {...props} colors={colors} />}
              />
              {cas.map((ca) => (
                <Bar
                  key={ca}
                  dataKey={ca}
                  name={ca}
                  stackId="expiry"
                  fill={getCAColor(colors, ca)}
                  fillOpacity={0.85}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No upcoming expirations.
        </div>
      )}
    </div>
  );
}
