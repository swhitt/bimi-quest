"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const TrendChart = dynamic(
  () => import("@/components/dashboard/trend-chart").then((m) => ({ default: m.TrendChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);
const MarketShareChart = dynamic(
  () => import("@/components/dashboard/market-share-chart").then((m) => ({ default: m.MarketShareChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);
const CertTypeChart = dynamic(
  () => import("@/components/dashboard/cert-type-chart").then((m) => ({ default: m.CertTypeChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);

interface DashboardChartsProps {
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  monthlyTrend: { month: string; ca: string | null; count: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
  selectedCA: string;
  apiQuery: string;
  hasDateFilter?: boolean;
}

export function DashboardCharts({
  caBreakdown,
  monthlyTrend,
  markTypeBreakdown,
  selectedCA,
  apiQuery,
  hasDateFilter,
}: DashboardChartsProps) {
  return (
    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
      <div className="flex-1 min-w-0">
        <MarketShareChart data={caBreakdown} selectedCA={selectedCA} apiQuery={apiQuery} />
      </div>
      <div className="flex-1 min-w-0">
        <TrendChart data={monthlyTrend} selectedCA={selectedCA} apiQuery={apiQuery} hasDateFilter={hasDateFilter} />
      </div>
      <div className="flex-1 min-w-0">
        <CertTypeChart caBreakdown={caBreakdown} markTypeBreakdown={markTypeBreakdown} apiQuery={apiQuery} />
      </div>
    </div>
  );
}
