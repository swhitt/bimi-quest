"use client";

import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface CertTypeChartProps {
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
  apiQuery?: string;
}

const CERT_TYPE_COLORS = {
  VMC: "oklch(0.65 0.18 230)",
  CMC: "oklch(0.70 0.14 165)",
};

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
  const vmcTotal = caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = caBreakdown.reduce((s, d) => s + d.cmcCount, 0);
  const grandTotal = vmcTotal + cmcTotal;

  const outerData = [
    { name: "VMC", value: vmcTotal, fill: CERT_TYPE_COLORS.VMC },
    { name: "CMC", value: cmcTotal, fill: CERT_TYPE_COLORS.CMC },
  ].filter((d) => d.value > 0);

  const markTypes = markTypeBreakdown
    .filter((d) => d.count > 0)
    .map((d, i) => ({
      name: d.markType || "Unknown",
      value: d.count,
      fill: getMarkColor(d.markType || "", i),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>VMC vs CMC</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Download cert type data as CSV"
            onClick={() => {
              const sep = apiQuery ? "&" : "";
              window.location.href = `/api/export/dashboard?dataset=cert-types${sep}${apiQuery}`;
            }}
          >
            <Download />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        {grandTotal > 0 ? (
          <div className="flex flex-col gap-2 h-full">
            <div
              role="img"
              aria-label="Donut chart showing VMC vs CMC certificate type distribution"
              className="flex-1 min-h-[200px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={(props) => <DonutTooltip {...props} grandTotal={grandTotal} />} />
                  {/* Outer ring: VMC vs CMC */}
                  <Pie
                    data={outerData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    innerRadius="58%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {outerData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  {/* Inner ring: Mark types */}
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

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-sm">
              {outerData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: entry.fill }} />
                  <span className="font-medium">{entry.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {((entry.value / grandTotal) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground">
            No certificates match current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
