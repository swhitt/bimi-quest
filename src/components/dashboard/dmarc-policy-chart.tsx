"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export interface DmarcPolicyRow {
  policy: string;
  count: number;
}

/** CSS variable mapping for DMARC policies — defined in globals.css for both light/dark */
const POLICY_CSS_VARS: Record<string, string> = {
  reject: "var(--policy-reject)",
  quarantine: "var(--policy-quarantine)",
  none: "var(--policy-none)",
  unknown: "var(--policy-unknown)",
};

function getPolicyColor(policy: string): string {
  return POLICY_CSS_VARS[policy] ?? POLICY_CSS_VARS.unknown;
}

interface PolicyTooltipEntry {
  name: string;
  value: number;
  payload: { policy: string; label: string; count: number; percent: string; fill: string };
}

function PolicyTooltip({ active, payload }: { active?: boolean; payload?: readonly PolicyTooltipEntry[] }) {
  if (!active || !payload?.length) return null;

  const rows = payload.map((p) => ({
    color: p.payload.fill,
    name: p.payload.label,
    value: `${p.payload.count.toLocaleString()} (${p.payload.percent}%)`,
  }));

  return <ChartTooltipContent rows={rows} />;
}

/** Sort order so the pie slices go reject → quarantine → none → no DMARC */
const POLICY_ORDER: Record<string, number> = {
  reject: 0,
  quarantine: 1,
  none: 2,
  unknown: 3,
};

const POLICY_LABELS: Record<string, string> = {
  unknown: "no DMARC",
};

export function DmarcPolicyChart({ initialData }: { initialData?: DmarcPolicyRow[] }) {
  const router = useRouter();
  const [data, setData] = useState<DmarcPolicyRow[]>(initialData ?? []);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/dmarc-policy")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data?: DmarcPolicyRow[] }) => {
        if (!cancelled) setData(json.data ?? []);
      })
      .catch(() => {
        /* keep initialData or empty */
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
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          dmarc policies
        </span>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  const chartData = [...data]
    .sort((a, b) => (POLICY_ORDER[a.policy] ?? 99) - (POLICY_ORDER[b.policy] ?? 99))
    .map((d) => ({
      policy: d.policy,
      label: POLICY_LABELS[d.policy] ?? d.policy,
      count: d.count,
      percent: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0.0",
      fill: getPolicyColor(d.policy),
    }));

  return (
    <div>
      <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
        dmarc policies
      </span>
      {chartData.length > 0 ? (
        <div className="flex items-center gap-4 mt-1">
          <div role="img" aria-label="Pie chart showing DMARC policy distribution across domains" className="shrink-0">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="policy"
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={90}
                  strokeWidth={1.5}
                  className="stroke-background"
                  style={{ cursor: "pointer" }}
                  onClick={(d) => {
                    if (d?.policy) router.push(`/domains?f=dmarc.policy:eq:${encodeURIComponent(d.policy)}`);
                  }}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.policy} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<PolicyTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5 text-sm font-medium min-w-0">
            {chartData.map((d) => (
              <div key={d.policy} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.fill }} />
                <span className="text-muted-foreground truncate">{d.label}</span>
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
