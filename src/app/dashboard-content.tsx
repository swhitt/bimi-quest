import { KPICards } from "@/components/dashboard/kpi-cards";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { RecentCerts } from "@/components/dashboard/recent-certs";
import { IndustryChart } from "@/components/dashboard/industry-chart";
import { ExpiryChart } from "@/components/dashboard/expiry-chart";
import { TopOrgs } from "@/components/dashboard/top-orgs";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";
import { displayIssuerOrg } from "@/lib/ca-display";
import { getBaseUrl } from "@/lib/server-url";

interface DashboardData {
  selectedCA: string;
  totalCerts: number;
  caCerts: number;
  activeCerts: number;
  marketShare: number | null;
  uniqueOrgs: number;
  newLast30d: number;
  caNewLast30d: number;
  expiringCount: number;
  caBreakdown: { ca: string | null; total: number; vmcCount: number; cmcCount: number }[];
  monthlyTrend: { month: string; ca: string | null; count: number }[];
  markTypeBreakdown: { markType: string | null; count: number }[];
  lastUpdated: string | null;
  activeFilters: {
    type: string | null;
    mark: string | null;
    industry: string | null;
    country: string | null;
  };
}

export async function DashboardContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const apiQuery = buildApiParamsFromSearchParams(searchParams);

  const baseUrl = await getBaseUrl();

  let data: DashboardData;
  try {
    const res = await fetch(`${baseUrl}/api/dashboard?${apiQuery}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("Failed to load");
    data = await res.json();
  } catch {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load dashboard data</p>
      </div>
    );
  }

  const displayCA = data.selectedCA === "All Issuers" ? "All Issuers" : displayIssuerOrg(data.selectedCA);

  const vmcTotal = data.caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = data.caBreakdown.reduce((s, d) => s + d.cmcCount, 0);
  const hasDateFilter = !!(searchParams.from || searchParams.to);

  return (
    <div className="space-y-6">
      <KPICards
        selectedCA={displayCA}
        totalCerts={data.totalCerts}
        caCerts={data.caCerts}
        activeCerts={data.activeCerts || 0}
        marketShare={data.marketShare}
        uniqueOrgs={data.uniqueOrgs}
        newLast30d={data.newLast30d || 0}
        caNewLast30d={data.caNewLast30d || 0}
        expiringCount={data.expiringCount || 0}
        vmcTotal={vmcTotal}
        cmcTotal={cmcTotal}
        activeFilters={data.activeFilters}
        lastUpdated={data.lastUpdated}
      />

      <DashboardCharts
        caBreakdown={data.caBreakdown}
        monthlyTrend={data.monthlyTrend}
        markTypeBreakdown={data.markTypeBreakdown}
        selectedCA={displayCA}
        apiQuery={apiQuery}
        hasDateFilter={hasDateFilter}
      />

      <div className="grid gap-4 md:grid-cols-5 items-stretch">
        <div className="md:col-span-3">
          <IndustryChart />
        </div>
        <div className="md:col-span-2">
          <ExpiryChart />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5 items-stretch">
        <div className="md:col-span-2">
          <TopOrgs />
        </div>
        <div className="md:col-span-3">
          <RecentCerts />
        </div>
      </div>
    </div>
  );
}
