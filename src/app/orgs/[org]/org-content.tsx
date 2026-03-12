"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { HostnameLink } from "@/components/hostname-link";
import { CertificatesTable, type CertRow } from "@/components/tables/certificates-table";
import { Badge } from "@/components/ui/badge";
import { orgUrl } from "@/lib/entity-urls";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { errorMessage } from "@/lib/utils";

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface OrgContentProps {
  org: string;
  initialData?: CertRow[];
  initialPagination?: PaginationData;
}

export function OrgContent({ org, initialData, initialPagination }: OrgContentProps) {
  const searchParams = useSearchParams();
  const { buildApiParams } = useGlobalFilters();
  const hasInitialData = initialData !== undefined && initialPagination !== undefined;

  const [data, setData] = useState<{
    data: CertRow[];
    pagination: PaginationData;
  }>({
    data: initialData ?? [],
    pagination: initialPagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState<string | null>(null);
  // Track whether this is the first render with SSR data to skip the initial fetch
  const [isInitialRender, setIsInitialRender] = useState(hasInitialData);

  const page = searchParams.get("page") || "";
  const sort = searchParams.get("sort") || "";
  const dir = searchParams.get("dir") || "";

  const apiQuery = buildApiParams({
    org,
    ...(page && { page }),
    ...(sort && { sort }),
    ...(dir && { dir }),
  });

  useEffect(() => {
    // Skip the initial fetch if we received SSR data and no client-side
    // params have changed (first render only)
    if (isInitialRender) {
      setIsInitialRender(false);
      return;
    }

    setError(null);
    setLoading(true);
    fetch(`/api/certificates?${apiQuery}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [apiQuery]); // eslint-disable-line react-hooks/exhaustive-deps -- isInitialRender is intentionally excluded

  // Derive unique domains from the returned cert data
  const domains = useMemo(() => {
    if (!data.data.length) return [];
    const counts = new Map<string, number>();
    for (const cert of data.data) {
      for (const san of cert.sanList) {
        counts.set(san, (counts.get(san) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [data.data]);

  const country = data.data.length > 0 ? data.data[0].subjectCountry : null;

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* Header */}
      <div>
        <BreadcrumbNav
          items={[{ label: "Dashboard", href: "/" }, { label: "Organizations", href: "/leaderboard" }, { label: org }]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{org}</h1>
              {country && (
                <Badge variant="outline" className="text-sm font-mono">
                  {country}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {loading
                ? "Loading certificates..."
                : `${data.pagination.total} certificate${data.pagination.total !== 1 ? "s" : ""} across ${domains.length} domain${domains.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <p className="text-destructive">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">Loading certificates...</div>
      ) : data.data.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-muted-foreground">
            No certificates found for <strong>{org}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            This organization has not appeared in any BIMI certificates in our CT log data.
          </p>
        </div>
      ) : (
        <>
          {/* Domains section */}
          {domains.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-1.5">
                Top domains{data.pagination.totalPages > 1 ? " (this page)" : ""}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {domains.map(([domain, count]) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm"
                    aria-label={`${domain}, ${count} ${count === 1 ? "certificate" : "certificates"}`}
                  >
                    <HostnameLink hostname={domain} size="xs" />
                    <span className="text-xs text-muted-foreground" aria-hidden="true">
                      {count} {count === 1 ? "cert" : "certs"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <CertificatesTable data={data.data} pagination={data.pagination} basePath={orgUrl(org)} showSearch={false} />
        </>
      )}
    </div>
  );
}
