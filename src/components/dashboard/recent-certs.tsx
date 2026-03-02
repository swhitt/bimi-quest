"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UtcTime } from "@/components/ui/utc-time";
import { displayIssuerOrg } from "@/lib/ca-display";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface RecentCert {
  id: number;
  fingerprintSha256: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  issuerOrg: string | null;
  certType: string | null;
  notBefore: string;
  subjectCountry: string | null;
  sanList: string[];
  logotypeSvgHash: string | null;
  hasLogo: boolean;
  logoBg: string | null;
  notabilityScore: number | null;
}

const PAGE_SIZE = 7;

export function RecentCerts() {
  const { buildApiParams } = useGlobalFilters();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [certs, setCerts] = useState<RecentCert[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build "View all" link preserving current filters (CA in path, rest as search params)
  const caMatch = pathname.match(/\/ca\/([^/]+)/);
  const caSuffix = caMatch ? `/ca/${caMatch[1]}` : "";
  const filterSearch = new URLSearchParams(searchParams.toString());
  // Strip transient params that are specific to this widget
  filterSearch.delete("page");
  filterSearch.delete("limit");
  const viewAllHref = `/certificates${caSuffix}${filterSearch.size > 0 ? `?${filterSearch}` : ""}`;

  const filterParams = buildApiParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    sort: "notBefore",
    dir: "desc",
  });
  const loading = loadedParams !== filterParams;

  // Reset to page 1 when filters change
  const baseFilterParams = buildApiParams();
  useEffect(() => {
    setPage(1);
  }, [baseFilterParams]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    fetch(`/api/certificates?${filterParams}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setCerts(json.data ?? []);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setLoadedParams(filterParams);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message ?? "Failed to load");
          setCerts([]);
        }
      });

    return () => controller.abort();
  }, [filterParams]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Latest Issuances</CardTitle>
        <CardAction>
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all <ArrowRight className="size-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        {loading && certs.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm" aria-live="polite">
            Loading...
          </p>
        ) : error ? (
          <p className="text-destructive text-sm py-4 text-center" aria-live="polite">
            {error}
          </p>
        ) : certs.length > 0 ? (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium w-10" />
                    <th className="pb-2 pr-2 font-medium">Organization</th>
                    <th className="pb-2 pr-2 font-medium hidden lg:table-cell">SANs</th>
                    <th className="pb-2 pr-2 font-medium hidden sm:table-cell">Type</th>
                    <th className="pb-2 pr-2 font-medium hidden sm:table-cell">CA</th>
                    <th className="pb-2 pr-2 font-medium hidden md:table-cell">Country</th>
                    <th className="pb-2 font-medium text-right">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map((cert) => (
                    <tr key={cert.id} className="border-b last:border-0 hover:bg-secondary/50 transition-colors">
                      <td className="py-0 pr-2 w-10">
                        {cert.hasLogo && cert.logotypeSvgHash ? (
                          <img
                            src={`/api/logo/${cert.logotypeSvgHash}?format=svg`}
                            alt=""
                            width={40}
                            height={40}
                            className="h-10 w-10 min-w-10 shrink-0 rounded-lg border object-contain"
                            style={cert.logoBg ? { backgroundColor: cert.logoBg } : undefined}
                          />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg border bg-muted" />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/certificates/${cert.fingerprintSha256.slice(0, 12)}`}
                            className="hover:underline font-medium"
                          >
                            {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}
                          </Link>
                          {cert.notabilityScore != null && cert.notabilityScore >= 7 && (
                            <span
                              className={`size-1.5 rounded-full shrink-0 ${
                                cert.notabilityScore >= 9 ? "bg-amber-500" : "bg-blue-500"
                              }`}
                              title={`Notability: ${cert.notabilityScore}`}
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 hidden lg:table-cell text-muted-foreground text-xs max-w-[200px] truncate">
                        {cert.sanList.length > 0 ? (
                          <>
                            {cert.sanList[0]}
                            {cert.sanList.length > 1 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-muted-foreground/60 cursor-help">
                                    {" "}
                                    +{cert.sanList.length - 1} more
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-80">
                                  <ul className="space-y-0.5">
                                    {cert.sanList.slice(1).map((san) => (
                                      <li key={san} className="font-mono text-xs">
                                        {san}
                                      </li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-1.5 pr-2 hidden sm:table-cell">
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                          {cert.certType || "BIMI"}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-2 hidden sm:table-cell text-muted-foreground">
                        {displayIssuerOrg(cert.issuerOrg)}
                      </td>
                      <td className="py-1.5 pr-2 hidden md:table-cell text-muted-foreground">
                        {cert.subjectCountry || "—"}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground whitespace-nowrap">
                        <UtcTime date={cert.notBefore} relative />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-1 pt-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No recent issuances match current filters.</p>
        )}
      </CardContent>
    </Card>
  );
}
