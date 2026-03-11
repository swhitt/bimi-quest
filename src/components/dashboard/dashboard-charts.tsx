"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
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

class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[200px] flex-col items-center justify-center gap-2 px-3 py-2">
          <p className="text-sm text-destructive">Failed to load</p>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border rounded-lg border border-border">
      <div className="flex-1 min-w-[1px]">
        <ChartErrorBoundary>
          <MarketShareChart data={caBreakdown} selectedCA={selectedCA} apiQuery={apiQuery} />
        </ChartErrorBoundary>
      </div>
      <div className="flex-1 min-w-[1px]">
        <ChartErrorBoundary>
          <TrendChart data={monthlyTrend} selectedCA={selectedCA} apiQuery={apiQuery} hasDateFilter={hasDateFilter} />
        </ChartErrorBoundary>
      </div>
      <div className="flex-1 min-w-[1px]">
        <ChartErrorBoundary>
          <CertTypeChart caBreakdown={caBreakdown} markTypeBreakdown={markTypeBreakdown} apiQuery={apiQuery} />
        </ChartErrorBoundary>
      </div>
    </div>
  );
}
