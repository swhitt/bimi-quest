import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { ExpiryChart, type ExpiryRow } from "@/components/dashboard/expiry-chart";
import { IndustryChart, type IndustryRow } from "@/components/dashboard/industry-chart";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { RecentCerts, type RecentCert } from "@/components/dashboard/recent-certs";
import { TopOrgs, type OrgRow } from "@/components/dashboard/top-orgs";
import { displayIssuerOrg } from "@/lib/ca-display";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";
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

/** Fetch JSON from an internal API route, returning null on failure. */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function DashboardContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const apiQuery = buildApiParamsFromSearchParams(searchParams);

  const baseUrl = await getBaseUrl();

  // Fetch dashboard data and sub-widget data in parallel to eliminate waterfall
  const recentCertsParams = buildApiParamsFromSearchParams(searchParams, {
    page: "1",
    limit: "7",
    sort: "notBefore",
    dir: "desc",
  });

  const [dashboardRes, industryRes, expiryRes, topOrgsRes, recentCertsRes] = await Promise.all([
    fetchJson<DashboardData>(`${baseUrl}/api/dashboard?${apiQuery}`),
    fetchJson<{ data: IndustryRow[] }>(`${baseUrl}/api/stats/industry-breakdown?${apiQuery}`),
    fetchJson<{ data: ExpiryRow[] }>(`${baseUrl}/api/stats/expiry-timeline?${apiQuery}`),
    fetchJson<{ data: OrgRow[] }>(`${baseUrl}/api/stats/top-orgs?${apiQuery}`),
    fetchJson<{ data: RecentCert[]; pagination: { totalPages: number } }>(
      `${baseUrl}/api/certificates?${recentCertsParams}`,
    ),
  ]);

  if (!dashboardRes) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load dashboard data</p>
      </div>
    );
  }

  const data = dashboardRes;
  const displayCA = data.selectedCA === "All Issuers" ? "All Issuers" : displayIssuerOrg(data.selectedCA);

  const vmcTotal = data.caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = data.caBreakdown.reduce((s, d) => s + d.cmcCount, 0);
  const hasDateFilter = !!(searchParams.from || searchParams.to);

  return (
    <div data-testid="dashboard" className="space-y-6">
      <KPICards
        selectedCA={displayCA}
        totalCerts={data.totalCerts}
        caCerts={data.caCerts}
        activeCerts={data.activeCerts || 0}
        marketShare={data.marketShare}
        uniqueOrgs={data.uniqueOrgs}
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
          <IndustryChart initialData={industryRes?.data ?? undefined} />
        </div>
        <div className="md:col-span-2">
          <ExpiryChart initialData={expiryRes?.data ?? undefined} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5 items-stretch">
        <div className="md:col-span-2">
          <TopOrgs initialData={topOrgsRes?.data ?? undefined} />
        </div>
        <div className="md:col-span-3">
          <RecentCerts
            initialData={recentCertsRes?.data ?? undefined}
            initialTotalPages={recentCertsRes?.pagination?.totalPages ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
