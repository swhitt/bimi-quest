"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const TrendChart = dynamic(
  () => import("@/components/dashboard/trend-chart").then((m) => ({ default: m.TrendChart })),
  { loading: () => <Skeleton className="h-[320px]" /> },
);
const MarketShareChart = dynamic(
  () => import("@/components/dashboard/market-share-chart").then((m) => ({ default: m.MarketShareChart })),
  { loading: () => <Skeleton className="h-[320px]" /> },
);
const CertTypeChart = dynamic(
  () => import("@/components/dashboard/cert-type-chart").then((m) => ({ default: m.CertTypeChart })),
  { loading: () => <Skeleton className="h-[320px]" /> },
);

interface DashboardChartsProps {
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  monthlyTrend: { month: string; ca: string | null; count: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
  selectedCA: string;
  apiQuery: string;
}

export function DashboardCharts({
  caBreakdown,
  monthlyTrend,
  markTypeBreakdown,
  selectedCA,
  apiQuery,
}: DashboardChartsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
      <MarketShareChart data={caBreakdown} selectedCA={selectedCA} apiQuery={apiQuery} />
      <TrendChart data={monthlyTrend} selectedCA={selectedCA} apiQuery={apiQuery} />
      <CertTypeChart caBreakdown={caBreakdown} markTypeBreakdown={markTypeBreakdown} />
    </div>
  );
}
