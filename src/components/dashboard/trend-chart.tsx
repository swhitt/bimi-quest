"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TrendDataPoint {
  month: string;
  ca: string | null;
  count: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  selectedCA: string;
}

const CA_COLORS: Record<string, string> = {
  "SSL.com": "hsl(221, 83%, 53%)",
  DigiCert: "hsl(199, 89%, 48%)",
  Entrust: "hsl(0, 84%, 60%)",
  GlobalSign: "hsl(142, 71%, 45%)",
  Sectigo: "hsl(24, 95%, 53%)",
};

export function TrendChart({ data, selectedCA }: TrendChartProps) {
  // Pivot data: { month, CA1: count, CA2: count, ... }
  const months = [...new Set(data.map((d) => d.month))].sort();
  const cas = [...new Set(data.map((d) => d.ca || "Unknown"))];

  const pivoted = months.map((month) => {
    const row: Record<string, string | number> = { month };
    for (const ca of cas) {
      const point = data.find((d) => d.month === month && (d.ca || "Unknown") === ca);
      row[ca] = point?.count || 0;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issuance Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {pivoted.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={pivoted}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              {cas.map((ca) => (
                <Line
                  key={ca}
                  type="monotone"
                  dataKey={ca}
                  stroke={CA_COLORS[ca] || "hsl(0, 0%, 60%)"}
                  strokeWidth={ca === selectedCA ? 3 : 1.5}
                  dot={ca === selectedCA}
                  strokeOpacity={ca === selectedCA ? 1 : 0.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No trend data available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
