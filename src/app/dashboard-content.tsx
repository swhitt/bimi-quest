"use client";

import { useEffect, useState } from "react";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { MarketShareChart } from "@/components/dashboard/market-share-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { RecentCerts } from "@/components/dashboard/recent-certs";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface DashboardData {
  selectedCA: string;
  totalCerts: number;
  caCerts: number;
  marketShare: string;
  uniqueOrgs: number;
  caBreakdown: { ca: string | null; total: number }[];
  monthlyTrend: { month: string; ca: string | null; count: number }[];
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
}

export function DashboardContent() {
  const { buildApiParams, ca } = useGlobalFilters();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const apiQuery = buildApiParams();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard?${apiQuery}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiQuery]);

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
        marketShare={data.marketShare}
        uniqueOrgs={data.uniqueOrgs}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <MarketShareChart
          data={data.caBreakdown}
          selectedCA={data.selectedCA}
        />
        <TrendChart data={data.monthlyTrend} selectedCA={data.selectedCA} />
      </div>

      <RecentCerts certs={data.recentCerts} />
    </div>
  );
}
