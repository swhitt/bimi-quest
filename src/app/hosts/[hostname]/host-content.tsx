"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalArrowIcon } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { CertificatesTable, type CertRow } from "@/components/tables/certificates-table";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { errorMessage } from "@/lib/utils";

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface HostContentProps {
  hostname: string;
  initialData?: CertRow[];
  initialPagination?: PaginationData;
}

export function HostContent({ hostname, initialData, initialPagination }: HostContentProps) {
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
    host: hostname,
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/certificates" className="hover:text-foreground">
            Certificates
          </Link>
          <span>/</span>
          <span className="text-foreground">{hostname}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              {hostname}
              <a
                href={`https://${hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors duration-150"
                title={`Open ${hostname} in new tab`}
              >
                <ExternalArrowIcon className="size-4" />
              </a>
            </h1>
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
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
              Run BIMI Check
            </Link>
            <a
              href={`https://${hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Visit site
              <ExternalArrowIcon />
            </a>
            <a
              href={`https://crt.sh/?q=${encodeURIComponent(hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              crt.sh
              <ExternalArrowIcon />
            </a>
            <a
              href={`https://mxtoolbox.com/SuperTool.aspx?action=dmarc%3a${encodeURIComponent(hostname)}&run=toolpage`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              MX Toolbox
              <ExternalArrowIcon />
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
        <div className="flex h-64 items-center justify-center text-muted-foreground">Loading certificates...</div>
      ) : data.data.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-muted-foreground">
            No BIMI certificates found for <strong>{hostname}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            This hostname has not appeared in any VMC or CMC certificates in our CT log data.
          </p>
          <Link href={`/domains/${encodeURIComponent(hostname)}`} className="text-sm text-primary hover:underline">
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
