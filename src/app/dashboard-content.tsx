"use client";

import { useEffect, useState } from "react";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { MarketShareChart } from "@/components/dashboard/market-share-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { RecentCerts } from "@/components/dashboard/recent-certs";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { formatDistanceToNow } from "date-fns";

interface DashboardData {
  selectedCA: string;
  totalCerts: number;
  caCerts: number;
  activeCerts: number;
  marketShare: string;
  uniqueOrgs: number;
  newLast30d: number;
  caNewLast30d: number;
  expiringCount: number;
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  monthlyTrend: { month: string; ca: string | null; count: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
  recentCerts: {
    id: number;
    serialNumber: string;
    subjectCn: string | null;
    subjectOrg: string | null;
    issuerOrg: string | null;
    certType: string | null;
    notBefore: string;
    subjectCountry: string | null;
    sanList: string[];
    logotypeSvg: string | null;
    isPrecert: boolean | null;
  }[];
  lastUpdated: string | null;
}

export function DashboardContent() {
  const { buildApiParams, ca } = useGlobalFilters();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const apiQuery = buildApiParams();

  useEffect(() => {
    setError(null);
    setLoading(true);
    fetch(`/api/dashboard?${apiQuery}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [apiQuery, retryKey]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">{error}</p>
        <button
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => setRetryKey((k) => k + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading dashboard data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KPICards
        selectedCA={data.selectedCA}
        totalCerts={data.totalCerts}
        caCerts={data.caCerts}
        activeCerts={data.activeCerts || 0}
        marketShare={data.marketShare}
        uniqueOrgs={data.uniqueOrgs}
        newLast30d={data.newLast30d || 0}
        caNewLast30d={data.caNewLast30d || 0}
        expiringCount={data.expiringCount || 0}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <MarketShareChart
          data={data.caBreakdown}
          selectedCA={data.selectedCA}
        />
        <TrendChart data={data.monthlyTrend} selectedCA={data.selectedCA} />
      </div>

      <RecentCerts certs={data.recentCerts} />

      {data.lastUpdated && (
        <p className="text-xs text-muted-foreground text-right">
          Data last updated {formatDistanceToNow(new Date(data.lastUpdated), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
