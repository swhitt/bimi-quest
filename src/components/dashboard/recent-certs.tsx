"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { format, formatDistanceToNow } from "date-fns";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { displayIssuerOrg, displayRootCa } from "@/lib/ca-display";
import { PaginationBar, type Pagination } from "@/components/pagination-bar";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface RecentCert {
  id: number;
  fingerprintSha256: string;
  serialNumber: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  issuerOrg: string | null;
  rootCaOrg: string | null;
  certType: string | null;
  notBefore: string;
  subjectCountry: string | null;
  sanList: string[];
  logotypeSvg: string | null;
  isPrecert: boolean | null;
  notabilityScore: number | null;
  companyDescription: string | null;
}

const PAGE_SIZE = 10;

export function RecentCerts() {
  const { buildApiParams } = useGlobalFilters();
  const [certs, setCerts] = useState<RecentCert[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const filterParams = buildApiParams();

  // Reset to page 1 when filters change
  const [prevFilters, setPrevFilters] = useState(filterParams);
  if (filterParams !== prevFilters) {
    setPrevFilters(filterParams);
    setPage(1);
  }

  useEffect(() => {
    setLoading(true);
    const qs = buildApiParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: "notBefore",
      dir: "desc",
    });
    fetch(`/api/certificates?${qs}`)
      .then((res) => res.json())
      .then((json) => {
        setCerts(json.data ?? []);
        setPagination(json.pagination ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
      })
      .catch(() => {
        setCerts([]);
      })
      .finally(() => setLoading(false));
  }, [filterParams, page]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const sanitizedCerts = useMemo(
    () =>
      certs.map((c) => ({
        ...c,
        logotypeSvg: c.logotypeSvg ? sanitizeSvg(c.logotypeSvg) : null,
      })),
    [certs],
  );

  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent Issuances</h2>
        <div className="flex-1 border-t" />
      </div>
      {loading && certs.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center" aria-live="polite">
          Loading...
        </p>
      ) : sanitizedCerts.length > 0 ? (
        <div className="space-y-2">
          {sanitizedCerts.map((cert) => (
            <Link
              key={cert.id}
              href={`/certificates/${cert.fingerprintSha256.slice(0, 12)}`}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-secondary/50"
            >
              <div className="flex items-center gap-3">
                {cert.logotypeSvg ? (
                  <HoverCard openDelay={300} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div
                        className="h-10 w-10 shrink-0 rounded border bg-white p-0.5 overflow-hidden [&>svg]:w-full [&>svg]:h-full cursor-zoom-in"
                        dangerouslySetInnerHTML={{
                          __html: cert.logotypeSvg,
                        }}
                      />
                    </HoverCardTrigger>
                    <HoverCardContent side="right" className="w-56 p-3">
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="size-32 rounded-lg border bg-white p-2 overflow-hidden [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{
                            __html: cert.logotypeSvg,
                          }}
                        />
                        <div className="text-center">
                          <div className="font-medium text-sm">
                            {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}
                          </div>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded border bg-muted" />
                )}
                <div className="space-y-0.5">
                  <div className="font-medium flex items-center gap-2">
                    {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}
                    {cert.notabilityScore != null && cert.notabilityScore >= 7 && (
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          cert.notabilityScore >= 9 ? "bg-amber-500/15 text-amber-500" : "bg-blue-500/15 text-blue-500"
                        }`}
                        title={cert.companyDescription || undefined}
                      >
                        ★ {cert.notabilityScore}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {cert.companyDescription || cert.sanList[0] || cert.subjectCn}
                    {cert.subjectCountry && ` · ${cert.subjectCountry}`}
                    {" · "}
                    <span className="font-mono italic text-xs" title={cert.serialNumber}>
                      ({cert.serialNumber.slice(0, 8)})
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <Badge variant="outline">
                  <abbr
                    className="no-underline"
                    title={
                      cert.certType === "VMC"
                        ? "Verified Mark Certificate"
                        : cert.certType === "CMC"
                          ? "Common Mark Certificate"
                          : undefined
                    }
                  >
                    {cert.certType || "BIMI"}
                  </abbr>
                </Badge>
                {cert.isPrecert && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1 py-0 text-amber-600 dark:text-amber-400"
                    title="Precertificate only (final certificate not yet logged)"
                  >
                    Precert
                  </Badge>
                )}
                <Badge variant="secondary">{displayIssuerOrg(cert.issuerOrg)}</Badge>
                {cert.rootCaOrg && displayRootCa(cert.rootCaOrg) !== displayIssuerOrg(cert.issuerOrg) && (
                  <span className="text-[10px] text-muted-foreground">Root: {displayRootCa(cert.rootCaOrg)}</span>
                )}
                <span className="text-xs text-muted-foreground" title={format(new Date(cert.notBefore), "PPP pp")}>
                  {formatDistanceToNow(new Date(cert.notBefore), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </Link>
          ))}

          <PaginationBar pagination={pagination} onPageChange={handlePageChange} />
        </div>
      ) : (
        <p className="text-muted-foreground">No certificates found. Run the ingestion worker to populate data.</p>
      )}
    </section>
  );
}
