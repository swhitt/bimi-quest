"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { UtcTime, formatUtcFull } from "@/components/ui/utc-time";
import { useGlobalFilters } from "@/lib/use-global-filters";

export interface RecentCert {
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
  createdAt: string | null;
}

const PAGE_SIZE = 7;

export function RecentCerts({
  initialData,
  initialTotalPages,
}: {
  initialData?: RecentCert[];
  initialTotalPages?: number;
}) {
  const { buildApiParams } = useGlobalFilters();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [certs, setCerts] = useState<RecentCert[]>(initialData ?? []);
  const [totalPages, setTotalPages] = useState(initialTotalPages ?? 1);
  const [page, setPage] = useState(1);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(!!initialData);
  const [prevBaseFilter, setPrevBaseFilter] = useState<string | null>(null);

  const caMatch = pathname.match(/\/ca\/([^/]+)/);
  const caSuffix = caMatch ? `/ca/${caMatch[1]}` : "";
  const filterSearch = new URLSearchParams(searchParams.toString());
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

  const baseFilterParams = buildApiParams();
  if (prevBaseFilter !== null && prevBaseFilter !== baseFilterParams) {
    setPrevBaseFilter(baseFilterParams);
    setPage(1);
  }
  if (prevBaseFilter === null) {
    setPrevBaseFilter(baseFilterParams);
  }

  if (isInitialLoad) {
    setIsInitialLoad(false);
    setLoadedParams(filterParams);
  }

  if (loadedParams !== filterParams && error !== null) {
    setError(null);
  }

  useEffect(() => {
    if (loadedParams === filterParams) return;

    const controller = new AbortController();

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
  }, [filterParams, loadedParams]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">latest</span>
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          all <ArrowRight className="size-2.5" />
        </Link>
      </div>
      {loading && certs.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm" aria-live="polite">
          Loading...
        </p>
      ) : error ? (
        <p className="text-destructive text-sm py-4 text-center" aria-live="polite">
          {error}
        </p>
      ) : certs.length > 0 ? (
        <div className="space-y-1">
          <div className="max-h-[320px] overflow-y-auto space-y-0.5">
            {certs.map((cert) => {
              const certPath = `/certificates/${cert.fingerprintSha256.slice(0, 12)}`;
              return (
                <div
                  key={cert.id}
                  className="flex items-center gap-2 py-0.5 hover:bg-secondary/50 rounded px-1 cursor-pointer transition-colors"
                  onClick={() => router.push(certPath)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(certPath);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  {cert.hasLogo && cert.logotypeSvgHash ? (
                    <Image
                      src={`/api/logo/${cert.logotypeSvgHash}?format=svg`}
                      alt=""
                      width={20}
                      height={20}
                      unoptimized
                      className="size-5 shrink-0 rounded border object-contain"
                      style={cert.logoBg ? { backgroundColor: cert.logoBg } : undefined}
                    />
                  ) : (
                    <div className="size-5 shrink-0 rounded border bg-muted" />
                  )}
                  <span className="text-[13px] truncate flex-1 min-w-0">
                    {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                    {cert.certType || "BIMI"}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    <UtcTime
                      date={cert.notBefore}
                      relative
                      tooltipExtra={
                        cert.createdAt ? (
                          <p className="font-mono text-xs mt-1 pt-1 border-t border-border/50">
                            Ingested: {formatUtcFull(cert.createdAt)}
                          </p>
                        ) : undefined
                      }
                    />
                  </span>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-1 pt-0.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {page}/{totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No recent issuances match current filters.</p>
      )}
    </div>
  );
}
