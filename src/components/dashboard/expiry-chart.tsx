"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useChartColors, getCAColor, CA_COLOR_INDEX } from "@/lib/chart-colors";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { displayIssuerOrg } from "@/lib/ca-display";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format, parseISO } from "date-fns";

interface ExpiryRow {
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

export function ExpiryChart() {
  const colors = useChartColors();
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<ExpiryRow[]>([]);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);

  const filterParams = buildApiParams();
  const loading = loadedParams !== filterParams;

  useEffect(() => {
    fetch(`/api/stats/expiry-timeline?${filterParams}`)
      .then((res) => res.json())
      .then((json) => setData(json.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoadedParams(filterParams));
  }, [filterParams]);

  if (loading && data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Expirations</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px]" />
        </CardContent>
      </Card>
    );
  }

  // Normalize CA names
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
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Expirations</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Download expiry data as CSV"
            onClick={() => {
              const q = filterParams;
              const sep = q ? "&" : "";
              window.location.href = `/api/export/dashboard?dataset=expiry${sep}${q}`;
            }}
          >
            <Download />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {pivoted.length > 0 ? (
          <div role="img" aria-label="Stacked area chart showing upcoming certificate expirations by month">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={pivoted} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
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
                  content={(props) => <ExpiryTooltip {...props} colors={colors} />}
                />
                {cas.map((ca) => (
                  <Area
                    key={ca}
                    type="monotone"
                    dataKey={ca}
                    name={ca}
                    stackId="expiry"
                    fill={getCAColor(colors, ca)}
                    fillOpacity={0.4}
                    stroke={getCAColor(colors, ca)}
                    strokeWidth={1.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground">
            No upcoming expirations.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
