"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";

interface CertTypeChartProps {
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <ChartTooltipContent
      label={entry.name}
      rows={[{ color: entry.fill, name: entry.name, value: entry.value.toLocaleString() }]}
    />
  );
}

export function CertTypeChart({ caBreakdown, markTypeBreakdown }: CertTypeChartProps) {
  const vmcTotal = caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = caBreakdown.reduce((s, d) => s + d.cmcCount, 0);

  const outerData = [
    { name: "VMC", value: vmcTotal, fill: CERT_TYPE_COLORS.VMC },
    { name: "CMC", value: cmcTotal, fill: CERT_TYPE_COLORS.CMC },
  ].filter((d) => d.value > 0);

  const innerData = markTypeBreakdown
    .filter((d) => d.count > 0)
    .map((d, i) => ({
      name: d.markType || "Unknown",
      value: d.count,
      fill: getMarkColor(d.markType || "", i),
    }));

  const grandTotal = vmcTotal + cmcTotal;

  return (
    <Card>
      <CardHeader>
        <CardTitle>VMC vs CMC</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {grandTotal > 0 ? (
          <div className="flex flex-col gap-2 h-full">
            <div
              role="img"
              aria-label="Donut chart showing VMC vs CMC certificate type distribution"
              className="flex-1 min-h-[200px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<DonutTooltip />} />
                  {/* Outer ring: VMC vs CMC */}
                  <Pie
                    data={outerData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={62}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {outerData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  {/* Inner ring: Mark types */}
                  {innerData.length > 0 && (
                    <Pie
                      data={innerData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      outerRadius={58}
                      innerRadius={34}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {innerData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                  )}
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend — cert types */}
            <div className="flex items-center justify-center gap-4 text-xs">
              {outerData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: entry.fill }} />
                  <span className="font-medium">{entry.name}</span>
                  <span className="tabular-nums text-muted-foreground">{entry.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {/* Legend — mark types */}
            <div className="space-y-0.5 text-xs">
              {innerData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: entry.fill }} />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="ml-auto tabular-nums font-medium">{entry.value.toLocaleString()}</span>
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
