"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCertTypeColors } from "@/lib/chart-colors";
import { useFilteredData } from "@/lib/use-filtered-data";
import { useGlobalFilters } from "@/lib/use-global-filters";

export interface IndustryRow {
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

export function IndustryChart({ initialData }: { initialData?: IndustryRow[] }) {
  const router = useRouter();
  const certColors = useCertTypeColors();
  const { buildApiParams } = useGlobalFilters();
  const filterParams = buildApiParams();
  const { data, loading } = useFilteredData<IndustryRow[]>(
    "/api/stats/industry-breakdown",
    (json: unknown) => (json as { data?: IndustryRow[] }).data ?? [],
    initialData ?? [],
    initialData,
  );

  if (loading && data.length === 0) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">by sector</span>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const chartData = data.slice(0, 6).map((d) => ({
    name: d.industry || "Unknown",
    vmcCount: d.vmcCount,
    cmcCount: d.cmcCount,
    total: d.total,
  }));

  const barHeight = Math.max(chartData.length * 28, 120);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">by sector</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-foreground"
          title="Download industry data as CSV"
          onClick={() => {
            const q = filterParams;
            const sep = q ? "&" : "";
            window.location.href = `/api/export/dashboard?dataset=industries${sep}${q}`;
          }}
        >
          <Download className="size-3" />
        </Button>
      </div>
      {chartData.length > 0 ? (
        <div role="img" aria-label="Horizontal bar chart showing certificate distribution by industry">
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
                tick={{ fontSize: 12, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={120}
                interval={0}
              />
              <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<IndustryTooltip />} />
              <Bar
                dataKey="vmcCount"
                name="VMC"
                stackId="industry"
                fill={certColors.VMC}
                fillOpacity={0.9}
                style={{ cursor: "pointer" }}
                onClick={(d) => {
                  if (d?.name) router.push(`/certificates?industry=${encodeURIComponent(String(d.name))}`);
                }}
              />
              <Bar
                dataKey="cmcCount"
                name="CMC"
                stackId="industry"
                fill={certColors.CMC}
                fillOpacity={0.7}
                style={{ cursor: "pointer" }}
                onClick={(d) => {
                  if (d?.name) router.push(`/certificates?industry=${encodeURIComponent(String(d.name))}`);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No industry data for current filters.
        </div>
      )}
    </div>
  );
}
