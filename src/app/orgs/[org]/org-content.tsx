"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CertificatesTable, type CertRow } from "@/components/tables/certificates-table";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { Badge } from "@/components/ui/badge";

interface OrgContentProps {
  org: string;
}

export function OrgContent({ org }: OrgContentProps) {
  const searchParams = useSearchParams();
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<{
    data: CertRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setLoading(true);
    fetch(`/api/certificates?${apiQuery}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load certificates")
      )
      .finally(() => setLoading(false));
  }, [apiQuery]);

  // Derive unique domains from the returned cert data
  const domains = useMemo(() => {
    if (!data.data.length) return [];
    const counts = new Map<string, number>();
    for (const cert of data.data) {
      for (const san of cert.sanList) {
        counts.set(san, (counts.get(san) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [data.data]);

  const country = data.data.length > 0 ? data.data[0].subjectCountry : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Dashboard</Link>
          <span>/</span>
          <Link href="/certificates" className="hover:text-foreground">Certificates</Link>
          <span>/</span>
          <span className="text-foreground">{org}</span>
        </nav>
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
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading certificates...
        </div>
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
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                Top domains{data.pagination.totalPages > 1 ? " (this page)" : ""}
              </h2>
              <div className="flex flex-wrap gap-2">
                {domains.map(([domain, count]) => (
                  <Link
                    key={domain}
                    href={`/hosts/${encodeURIComponent(domain)}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-secondary"
                    aria-label={`${domain}, ${count} ${count === 1 ? "certificate" : "certificates"}`}
                  >
                    {domain}
                    <span className="text-xs text-muted-foreground" aria-hidden="true">
                      {count} {count === 1 ? "cert" : "certs"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <CertificatesTable
            data={data.data}
            pagination={data.pagination}
            basePath={`/orgs/${encodeURIComponent(org)}`}
            showSearch={false}
          />
        </>
      )}
    </div>
  );
}
