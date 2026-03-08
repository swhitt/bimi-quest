"use client";

import { useTheme } from "next-themes";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredData } from "@/lib/use-filtered-data";

export interface DmarcPolicyRow {
  policy: string;
  count: number;
}

/** Color mapping for DMARC policies: reject=green, quarantine=yellow, none=red, unknown=gray */
const POLICY_COLORS: Record<string, { light: string; dark: string }> = {
  reject: { light: "oklch(0.55 0.16 145)", dark: "oklch(0.72 0.16 145)" },
  quarantine: { light: "oklch(0.65 0.16 85)", dark: "oklch(0.78 0.16 85)" },
  none: { light: "oklch(0.55 0.18 25)", dark: "oklch(0.68 0.18 25)" },
  unknown: { light: "oklch(0.55 0 0)", dark: "oklch(0.65 0 0)" },
};

function getPolicyColor(policy: string, theme: string | undefined): string {
  const entry = POLICY_COLORS[policy] ?? POLICY_COLORS.unknown;
  return theme === "light" ? entry.light : entry.dark;
}

interface PolicyTooltipEntry {
  name: string;
  value: number;
  payload: { policy: string; count: number; percent: string; fill: string };
}

function PolicyTooltip({ active, payload }: { active?: boolean; payload?: readonly PolicyTooltipEntry[] }) {
  if (!active || !payload?.length) return null;

  const rows = payload.map((p) => ({
    color: p.payload.fill,
    name: p.payload.policy,
    value: `${p.payload.count.toLocaleString()} (${p.payload.percent}%)`,
  }));

  return <ChartTooltipContent rows={rows} />;
}

/** Sort order so the pie slices go reject → quarantine → none → unknown */
const POLICY_ORDER: Record<string, number> = {
  reject: 0,
  quarantine: 1,
  none: 2,
  unknown: 3,
};

export function DmarcPolicyChart({ initialData }: { initialData?: DmarcPolicyRow[] }) {
  const { resolvedTheme } = useTheme();
  const { data, loading } = useFilteredData<DmarcPolicyRow[]>(
    "/api/stats/dmarc-policy",
    (json: unknown) => (json as { data?: DmarcPolicyRow[] }).data ?? [],
    initialData ?? [],
    initialData,
  );

  if (loading && data.length === 0) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">dmarc policies</span>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  const chartData = [...data]
    .sort((a, b) => (POLICY_ORDER[a.policy] ?? 99) - (POLICY_ORDER[b.policy] ?? 99))
    .map((d) => ({
      policy: d.policy,
      count: d.count,
      percent: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0.0",
      fill: getPolicyColor(d.policy, resolvedTheme),
    }));

  return (
    <div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">dmarc policies</span>
      {chartData.length > 0 ? (
        <div className="flex items-center gap-4 mt-1">
          <div role="img" aria-label="Pie chart showing DMARC policy distribution across domains" className="shrink-0">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="policy"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={70}
                  strokeWidth={1.5}
                  className="stroke-background"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.policy} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<PolicyTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 text-sm min-w-0">
            {chartData.map((d) => (
              <div key={d.policy} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.fill }} />
                <span className="text-muted-foreground truncate">{d.policy}</span>
                <span className="ml-auto pl-2 font-mono text-xs tabular-nums">{d.count.toLocaleString()}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground w-12 text-right">
                  {d.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No DMARC data for current filters.
        </div>
      )}
    </div>
  );
}
