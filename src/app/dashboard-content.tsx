import dynamic from "next/dynamic";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DmarcDriftFeed } from "@/components/dashboard/dmarc-drift-feed";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { RecentCerts } from "@/components/dashboard/recent-certs";
import { TopOrgs } from "@/components/dashboard/top-orgs";
import { Skeleton } from "@/components/ui/skeleton";
import { displayIntermediateCa } from "@/lib/ca-display";
import { fetchCertificates, type CertificatesResult } from "@/lib/data/certificates";
import { fetchDashboardData } from "@/lib/data/dashboard";
import {
  fetchDmarcPolicyDistribution,
  fetchExpiryTimeline,
  fetchIndustryBreakdown,
  fetchTopOrgs,
} from "@/lib/data/stats";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";

const IndustryChart = dynamic(
  () => import("@/components/dashboard/industry-chart").then((m) => ({ default: m.IndustryChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);
const ExpiryChart = dynamic(
  () => import("@/components/dashboard/expiry-chart").then((m) => ({ default: m.ExpiryChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);
const DmarcPolicyChart = dynamic(
  () => import("@/components/dashboard/dmarc-policy-chart").then((m) => ({ default: m.DmarcPolicyChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);
const RuaProviderChart = dynamic(
  () => import("@/components/dashboard/rua-provider-chart").then((m) => ({ default: m.RuaProviderChart })),
  { loading: () => <Skeleton className="h-[200px]" /> },
);

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

/** Default date range: current calendar year if March+, otherwise previous year. */
function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  if (month >= 2) {
    // March or later → current calendar year
    return { from: `${year}-01-01`, to: now.toISOString().slice(0, 10) };
  }
  // Jan/Feb → previous calendar year
  return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
}

export async function DashboardContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Apply default date range when no date filters are set
  const userSetDateFilter = !!(searchParams.from || searchParams.to);
  const effectiveParams = { ...searchParams };
  if (!userSetDateFilter) {
    const defaults = getDefaultDateRange();
    effectiveParams.from = defaults.from;
    effectiveParams.to = defaults.to;
  }

  const filterParams = toURLSearchParams(effectiveParams);
  const apiQuery = buildApiParamsFromSearchParams(effectiveParams);

  // Build params for recent certs with pagination defaults
  const recentCertsSearchParams = toURLSearchParams(effectiveParams);
  recentCertsSearchParams.set("page", "1");
  recentCertsSearchParams.set("limit", "7");
  recentCertsSearchParams.set("sort", "notBefore");
  recentCertsSearchParams.set("dir", "desc");

  // Fetch all data in parallel directly from the database (no loopback HTTP calls)
  const [dashboardData, industryData, expiryData, topOrgsData, recentCertsData, dmarcPolicyData] = await Promise.all([
    fetchDashboardData(filterParams).catch(() => null),
    fetchIndustryBreakdown(filterParams).catch(() => null),
    fetchExpiryTimeline(filterParams).catch(() => null),
    fetchTopOrgs(filterParams).catch(() => null),
    fetchCertificates(recentCertsSearchParams, { page: 1, limit: 7, sort: "notBefore", dir: "desc" }).catch(() => null),
    fetchDmarcPolicyDistribution(filterParams).catch(() => null),
  ]);

  if (!dashboardData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load dashboard data</p>
      </div>
    );
  }

  const data = dashboardData;
  const displayCA =
    data.selectedCA === "All Intermediates" ? "All Intermediates" : displayIntermediateCa(data.selectedCA);

  const vmcTotal = data.caBreakdown.reduce((s, d) => s + d.vmcCount, 0);
  const cmcTotal = data.caBreakdown.reduce((s, d) => s + d.cmcCount, 0);
  const hasDateFilter = userSetDateFilter;

  return (
    <div data-testid="dashboard" className="space-y-3">
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

      <div data-dashboard-section="3" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-2">
          <IndustryChart initialData={industryData ?? undefined} />
        </div>
        <div className="rounded-lg border border-border p-2">
          <ExpiryChart initialData={expiryData ?? undefined} />
        </div>
        <div className="rounded-lg border border-border p-2">
          <DmarcPolicyChart initialData={dmarcPolicyData ?? undefined} />
        </div>
      </div>

      <div data-dashboard-section="3b" className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-2">
          <RuaProviderChart />
        </div>
        <div className="rounded-lg border border-border p-2">
          <DmarcDriftFeed />
        </div>
      </div>

      <div data-dashboard-section="4" className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-3">
        <div className="rounded-lg border border-border p-2">
          <TopOrgs
            initialData={topOrgsData?.data ?? undefined}
            initialTotalPages={topOrgsData?.totalPages ?? undefined}
          />
        </div>
        <div className="rounded-lg border border-border p-2">
          <RecentCerts
            initialData={recentCertsData ? serializeCertsForClient(recentCertsData) : undefined}
            initialTotalPages={recentCertsData?.pagination?.totalPages ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
