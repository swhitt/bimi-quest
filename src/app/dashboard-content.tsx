import { KPICards } from "@/components/dashboard/kpi-cards";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { RecentCerts } from "@/components/dashboard/recent-certs";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";
import { formatDistanceToNow } from "date-fns";
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
      cache: "no-store",
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

  const displayCA =
    data.selectedCA === "All Issuers"
      ? "All Issuers"
      : displayIssuerOrg(data.selectedCA);

  return (
    <div className="space-y-8">
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
      />

      <DashboardCharts
        caBreakdown={data.caBreakdown}
        monthlyTrend={data.monthlyTrend}
        selectedCA={displayCA}
        apiQuery={apiQuery}
      />

      <RecentCerts />

      {data.lastUpdated && (
        <p className="text-xs text-muted-foreground text-right">
          Data last updated{" "}
          {formatDistanceToNow(new Date(data.lastUpdated), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
