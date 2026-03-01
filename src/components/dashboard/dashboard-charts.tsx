"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const TrendChart = dynamic(
  () => import("@/components/dashboard/trend-chart").then((m) => ({ default: m.TrendChart })),
  { loading: () => <Skeleton className="h-[260px]" /> }
);
const MarketShareChart = dynamic(
  () => import("@/components/dashboard/market-share-chart").then((m) => ({ default: m.MarketShareChart })),
  { loading: () => <Skeleton className="h-[260px]" /> }
);

interface DashboardChartsProps {
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  monthlyTrend: { month: string; ca: string | null; count: number }[];
  selectedCA: string;
  apiQuery: string;
}

export function DashboardCharts({ caBreakdown, monthlyTrend, selectedCA, apiQuery }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 items-start">
      <MarketShareChart data={caBreakdown} selectedCA={selectedCA} apiQuery={apiQuery} />
      <TrendChart data={monthlyTrend} selectedCA={selectedCA} apiQuery={apiQuery} />
    </div>
  );
}
