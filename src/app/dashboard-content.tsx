import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { ExpiryChart } from "@/components/dashboard/expiry-chart";
import { IndustryChart } from "@/components/dashboard/industry-chart";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { RecentCerts } from "@/components/dashboard/recent-certs";
import { TopOrgs } from "@/components/dashboard/top-orgs";
import { displayIssuerOrg } from "@/lib/ca-display";
import { fetchCertificates, type CertificatesResult } from "@/lib/data/certificates";
import { fetchDashboardData } from "@/lib/data/dashboard";
import { fetchExpiryTimeline, fetchIndustryBreakdown, fetchTopOrgs } from "@/lib/data/stats";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";

/**
 * Serialize Date fields to ISO strings for the RecentCerts client component,
 * which expects string dates (as would come from a JSON API response).
 */
function serializeCertsForClient(result: CertificatesResult) {
  return result.data.map((row) => ({
    ...row,
    notBefore: row.notBefore instanceof Date ? row.notBefore.toISOString() : String(row.notBefore),
    notAfter: row.notAfter instanceof Date ? row.notAfter.toISOString() : String(row.notAfter),
    ctLogTimestamp: row.ctLogTimestamp instanceof Date ? row.ctLogTimestamp.toISOString() : row.ctLogTimestamp,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  }));
}

/**
 * Build a URLSearchParams from a record, for passing to shared data functions.
 * Only includes non-empty string values.
 */
function toURLSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string" && val) params.set(key, val);
  }
  return params;
}

export async function DashboardContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filterParams = toURLSearchParams(searchParams);
  const apiQuery = buildApiParamsFromSearchParams(searchParams);

  // Build params for recent certs with pagination defaults
  const recentCertsSearchParams = toURLSearchParams(searchParams);
  recentCertsSearchParams.set("page", "1");
  recentCertsSearchParams.set("limit", "7");
  recentCertsSearchParams.set("sort", "notBefore");
  recentCertsSearchParams.set("dir", "desc");

  // Fetch all data in parallel directly from the database (no loopback HTTP calls)
  const [dashboardData, industryData, expiryData, topOrgsData, recentCertsData] = await Promise.all([
    fetchDashboardData(filterParams).catch(() => null),
    fetchIndustryBreakdown(filterParams).catch(() => null),
    fetchExpiryTimeline(filterParams).catch(() => null),
    fetchTopOrgs(filterParams).catch(() => null),
    fetchCertificates(recentCertsSearchParams, { page: 1, limit: 7, sort: "notBefore", dir: "desc" }).catch(() => null),
  ]);

  if (!dashboardData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load dashboard data</p>
      </div>
    );
  }

  const data = dashboardData;
  const displayCA = data.selectedCA === "All Issuers" ? "All Issuers" : displayIssuerOrg(data.selectedCA);

  const vmcTotal = data.caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = data.caBreakdown.reduce((s, d) => s + d.cmcCount, 0);
  const hasDateFilter = !!(searchParams.from || searchParams.to);

  return (
    <div data-testid="dashboard" className="space-y-6">
      <div data-dashboard-section="1">
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
          dailyTrend={data.dailyTrend}
        />
      </div>

      <div data-dashboard-section="2">
        <DashboardCharts
          caBreakdown={data.caBreakdown}
          monthlyTrend={data.monthlyTrend}
          markTypeBreakdown={data.markTypeBreakdown}
          selectedCA={displayCA}
          apiQuery={apiQuery}
          hasDateFilter={hasDateFilter}
        />
      </div>

      <div data-dashboard-section="3" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <IndustryChart initialData={industryData ?? undefined} />
        <ExpiryChart initialData={expiryData ?? undefined} />
        <TopOrgs initialData={topOrgsData ?? undefined} />
        <RecentCerts
          initialData={recentCertsData ? serializeCertsForClient(recentCertsData) : undefined}
          initialTotalPages={recentCertsData?.pagination?.totalPages ?? undefined}
        />
      </div>
    </div>
  );
}
