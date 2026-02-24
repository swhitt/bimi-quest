"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, type PieLabelRenderProps } from "recharts";

interface CABreakdown {
  ca: string | null;
  total: number;
}

const COLORS = [
  "hsl(221, 83%, 53%)", // blue
  "hsl(142, 71%, 45%)", // green
  "hsl(0, 84%, 60%)",   // red
  "hsl(45, 93%, 47%)",  // yellow
  "hsl(262, 83%, 58%)", // purple
  "hsl(199, 89%, 48%)", // cyan
  "hsl(24, 95%, 53%)",  // orange
  "hsl(330, 81%, 60%)", // pink
];

interface MarketShareChartProps {
  data: CABreakdown[];
  selectedCA: string;
}

export function MarketShareChart({ data, selectedCA }: MarketShareChartProps) {
  const chartData = data.map((d) => ({
    name: d.ca || "Unknown",
    value: d.total,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Share by CA</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={(props: PieLabelRenderProps) =>
                  `${props.name ?? ""} (${((Number(props.percent) || 0) * 100).toFixed(0)}%)`
                }
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={COLORS[index % COLORS.length]}
                    strokeWidth={entry.name === selectedCA ? 3 : 1}
                    stroke={entry.name === selectedCA ? "hsl(0, 0%, 20%)" : "hsl(0, 0%, 95%)"}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No data available. Run the ingestion worker to populate certificates.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
