"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { OrgChip } from "@/components/org-chip";
import { CertificatesTable, type CertRow } from "@/components/tables/certificates-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CaStats } from "@/lib/data/ca-stats";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { errorMessage } from "@/lib/utils";
import { slugify } from "@/lib/slugify";

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CaContentProps {
  slug: string;
  displayName: string;
  rootCaOrg: string;
  intermediateFilter: string | null;
  stats: CaStats;
}

export function CaContent({ slug, displayName, rootCaOrg, intermediateFilter, stats }: CaContentProps) {
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<{ data: CertRow[]; pagination: PaginationData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiQuery = buildApiParams({
    root: rootCaOrg,
    ...(intermediateFilter && { ca: intermediateFilter }),
    sort: "notBefore",
    dir: "desc",
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/certificates?${apiQuery}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [apiQuery]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Certificates", href: "/certificates" },
          { label: displayName },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
        {intermediateFilter && (
          <p className="text-muted-foreground mt-1">
            Filtered to intermediate: <span className="font-medium">{intermediateFilter}</span>
            {" · "}
            <Link href={`/cas/${slug}`} className="text-primary hover:underline">
              Show all
            </Link>
          </p>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold tabular-nums">{stats.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total certificates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold tabular-nums">{stats.vmcCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">VMC</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold tabular-nums">{stats.cmcCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">CMC</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold tabular-nums">{stats.activeCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Active (not expired)</p>
          </CardContent>
        </Card>
      </div>

      {/* Intermediates */}
      {stats.intermediates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Intermediates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.intermediates.map((int) => (
                <Link
                  key={int.name}
                  href={`/cas/${slug}?intermediate=${slugify(int.name)}`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-secondary ${
                    intermediateFilter === int.name ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  {int.name}
                  <Badge variant="secondary" className="text-[10px]">
                    {int.count.toLocaleString()}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top organizations */}
      {stats.topOrgs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.topOrgs.map((org) => (
                <span key={org.name} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
                  <OrgChip org={org.name} compact />
                  <Badge variant="secondary" className="text-[10px]">
                    {org.count.toLocaleString()}
                  </Badge>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certificates table */}
      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      ) : loading || !data ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">Loading certificates...</p>
          </CardContent>
        </Card>
      ) : (
        <CertificatesTable data={data.data} pagination={data.pagination} basePath={`/cas/${slug}`} showSearch={false} />
      )}
    </div>
  );
}
