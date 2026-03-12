"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { PROVIDER_NAMES, providerFilterTerm } from "@/lib/rua-providers";

interface RuaProviderRow {
  provider: string;
  domainCount: number;
}

interface AggregatedProvider {
  name: string;
  domainCount: number;
  /** All hostnames that mapped to this provider (for click-through filter) */
  hostnames: string[];
}

/** Merge hostname-level rows into provider-level rows using PROVIDER_NAMES */
function aggregateByProvider(rows: RuaProviderRow[]): AggregatedProvider[] {
  const map = new Map<string, { count: number; hostnames: string[] }>();
  for (const row of rows) {
    const provider = PROVIDER_NAMES[row.provider] ?? row.provider;
    const existing = map.get(provider);
    if (existing) {
      existing.count += row.domainCount;
      existing.hostnames.push(row.provider);
    } else {
      map.set(provider, { count: row.domainCount, hostnames: [row.provider] });
    }
  }
  return [...map.entries()]
    .map(([name, { count, hostnames }]) => ({ name, domainCount: count, hostnames }))
    .sort((a, b) => b.domainCount - a.domainCount);
}

export function RuaProviderChart() {
  const router = useRouter();
  const [data, setData] = useState<RuaProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/rua-providers")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data?: RuaProviderRow[] }) => {
        if (!cancelled) setData(json.data ?? []);
      })
      .catch(() => {
        /* keep empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && data.length === 0) {
    return (
      <div>
        <div className="mb-1">
          <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
            dmarc report destinations
          </span>
          <p className="text-[10px] text-muted-foreground">Top aggregate report (rua) providers by domain count</p>
        </div>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const aggregated = aggregateByProvider(data);
  const chartData = aggregated.slice(0, 25);

  const barHeight = Math.max(chartData.length * 24, 120);

  return (
    <div>
      <div className="mb-1">
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          dmarc report destinations
        </span>
        <p className="text-[10px] text-muted-foreground">Top aggregate report (rua) providers by domain count</p>
      </div>
      {chartData.length > 0 ? (
        <div role="img" aria-label="Horizontal bar chart showing top DMARC RUA report destination providers">
          <ResponsiveContainer width="100%" height={barHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} className="stroke-border" />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={200}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const count = payload[0]?.value ?? 0;
                  return (
                    <ChartTooltipContent
                      label={String(label ?? "")}
                      rows={[
                        {
                          color: payload[0]?.color ?? "var(--color-chart-1)",
                          name: "Domains",
                          value: Number(count).toLocaleString(),
                        },
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="domainCount"
                name="Domains"
                fill="var(--color-chart-1)"
                fillOpacity={0.85}
                radius={[0, 3, 3, 0]}
                style={{ cursor: "pointer" }}
                onClick={(d) => {
                  const entry = chartData.find((e) => e.name === d?.name);
                  if (!entry) return;
                  const term = providerFilterTerm(entry.name, entry.hostnames);
                  router.push(`/domains?f=dmarc.rua:contains:${encodeURIComponent(term)}`);
                }}
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
