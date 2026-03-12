"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { useCertTypeColors } from "@/lib/chart-colors";

interface CertTypeChartProps {
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
  apiQuery?: string;
}

const MARK_TYPE_COLORS: Record<string, string> = {
  "Registered Mark": "oklch(0.60 0.16 280)",
  "Government Mark": "oklch(0.65 0.15 25)",
  "Common Law Mark": "oklch(0.70 0.13 65)",
};

function getMarkColor(markType: string, index: number): string {
  return MARK_TYPE_COLORS[markType] || `oklch(0.60 0.12 ${(index * 72 + 180) % 360})`;
}

interface DonutTooltipEntry {
  name: string;
  value: number;
  payload: { name: string; value: number; fill: string };
}

function DonutTooltip({
  active,
  payload,
  grandTotal,
}: {
  active?: boolean;
  payload?: readonly DonutTooltipEntry[];
  grandTotal: number;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;
  const pct = grandTotal > 0 ? ((entry.value / grandTotal) * 100).toFixed(1) : "0.0";

  return (
    <ChartTooltipContent
      label={`${entry.name} — ${pct}%`}
      rows={[{ color: entry.fill, name: "Count", value: entry.value.toLocaleString() }]}
    />
  );
}

export function CertTypeChart({ caBreakdown, markTypeBreakdown, apiQuery = "" }: CertTypeChartProps) {
  const router = useRouter();
  const certColors = useCertTypeColors();
  const vmcTotal = caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = caBreakdown.reduce((s, d) => s + d.cmcCount, 0);
  const grandTotal = vmcTotal + cmcTotal;

  const outerData = [
    { name: "VMC", value: vmcTotal, fill: certColors.VMC },
    { name: "CMC", value: cmcTotal, fill: certColors.CMC },
  ].filter((d) => d.value > 0);

  const markTypes = markTypeBreakdown
    .filter((d) => d.count > 0)
    .map((d, i) => ({
      name: d.markType || "Unknown",
      value: d.count,
      fill: getMarkColor(d.markType || "", i),
    }));

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">vmc vs cmc</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-foreground"
          title="Download cert type data as CSV"
          onClick={() => {
            const sep = apiQuery ? "&" : "";
            window.location.href = `/api/export/dashboard?dataset=cert-types${sep}${apiQuery}`;
          }}
        >
          <Download className="size-3" />
        </Button>
      </div>
      {grandTotal > 0 ? (
        <div role="img" aria-label="Donut chart showing VMC vs CMC certificate type distribution" className="h-[200px]">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Tooltip content={(props) => <DonutTooltip {...props} grandTotal={grandTotal} />} />
              <Pie
                data={outerData}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius="80%"
                innerRadius="58%"
                paddingAngle={2}
                strokeWidth={0}
                style={{ cursor: "pointer" }}
                onClick={(d) => {
                  if (d?.name) router.push(`/certificates?type=${d.name}`);
                }}
              >
                {outerData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              {markTypes.length > 0 && (
                <Pie
                  data={markTypes}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  outerRadius="50%"
                  innerRadius="30%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {markTypes.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground">
          No certificates match current filters.
        </div>
      )}
    </div>
  );
}
