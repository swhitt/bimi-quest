"use client";

import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCertTypeColors } from "@/lib/chart-colors";
import { useFilteredData } from "@/lib/use-filtered-data";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface IndustryRow {
  industry: string | null;
  total: number;
  vmcCount: number;
  cmcCount: number;
}

interface IndustryTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function IndustryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly IndustryTooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .filter((p) => (p.value ?? 0) > 0)
    .map((p) => ({
      color: p.color,
      name: p.name,
      value: (p.value ?? 0).toLocaleString(),
    }));

  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);

  return <ChartTooltipContent label={`${label} (${total.toLocaleString()} total)`} rows={rows} />;
}

export function IndustryChart() {
  const certColors = useCertTypeColors();
  const { buildApiParams } = useGlobalFilters();
  const filterParams = buildApiParams();
  const { data, loading } = useFilteredData<IndustryRow[]>(
    "/api/stats/industry-breakdown",
    (json: unknown) => (json as { data?: IndustryRow[] }).data ?? [],
    [],
  );

  if (loading && data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Adoption by Sector</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px]" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: d.industry || "Unknown",
    vmcCount: d.vmcCount,
    cmcCount: d.cmcCount,
    total: d.total,
  }));

  const barHeight = Math.max(chartData.length * 28, 120);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adoption by Sector</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Download industry data as CSV"
            onClick={() => {
              const q = filterParams;
              const sep = q ? "&" : "";
              window.location.href = `/api/export/dashboard?dataset=industries${sep}${q}`;
            }}
          >
            <Download />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div role="img" aria-label="Horizontal bar chart showing certificate distribution by industry" className="">
              <ResponsiveContainer width="100%" height={barHeight}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
                    width={130}
                  />
                  <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<IndustryTooltip />} />
                  <Bar dataKey="vmcCount" name="VMC" stackId="industry" fill={certColors.VMC} fillOpacity={0.9} />
                  <Bar
                    dataKey="cmcCount"
                    name="CMC"
                    stackId="industry"
                    fill={certColors.CMC}
                    fillOpacity={0.7}
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 px-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm"
                  style={{ background: certColors.VMC, opacity: 0.9 }}
                />
                <span>VMC</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm"
                  style={{ background: certColors.CMC, opacity: 0.7 }}
                />
                <span>CMC</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground">
            No industry data for current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
