"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CertificatesTable, type CertRow } from "@/components/tables/certificates-table";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface HostContentProps {
  hostname: string;
}

export function HostContent({ hostname }: HostContentProps) {
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
    host: hostname,
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Dashboard</Link>
          <span>/</span>
          <Link href="/certificates" className="hover:text-foreground">Certificates</Link>
          <span>/</span>
          <span className="text-foreground">{hostname}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{hostname}</h1>
            <p className="text-muted-foreground">
              {loading
                ? "Loading certificates..."
                : `${data.pagination.total} certificate${data.pagination.total !== 1 ? "s" : ""} found`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/domains/${encodeURIComponent(hostname)}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
              Run BIMI Check
            </Link>
            <a
              href={`https://crt.sh/?q=${encodeURIComponent(hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              crt.sh
              <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3h5.5v5.5M9 3L3 9"/></svg>
            </a>
            <a
              href={`https://mxtoolbox.com/SuperTool.aspx?action=dmarc%3a${encodeURIComponent(hostname)}&run=toolpage`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              MX Toolbox
              <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3h5.5v5.5M9 3L3 9"/></svg>
            </a>
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
            No BIMI certificates found for <strong>{hostname}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            This hostname has not appeared in any VMC or CMC certificates in our CT log data.
          </p>
          <Link
            href={`/domains/${encodeURIComponent(hostname)}`}
            className="text-sm text-primary hover:underline"
          >
            Run a BIMI check to see if this domain has BIMI configured
          </Link>
        </div>
      ) : (
        <CertificatesTable
          data={data.data}
          pagination={data.pagination}
          basePath={`/hosts/${encodeURIComponent(hostname)}`}
          showSearch={false}
        />
      )}
    </div>
  );
}
