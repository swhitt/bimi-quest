"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MiniPagination } from "@/components/dashboard/mini-pagination";
import { LogoCard } from "@/components/logo-card";
import { Badge } from "@/components/ui/badge";
import { UtcTime, formatUtcFull } from "@/components/ui/utc-time";
import { displayIntermediateCa } from "@/lib/ca-display";
import { HostChip } from "@/components/host-chip";
import { certUrl, orgUrl } from "@/lib/entity-urls";
import { usePaginatedData } from "@/lib/use-paginated-data";

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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    data: certs,
    page,
    totalPages,
    setPage,
    loading,
  } = usePaginatedData<RecentCert>({
    url: "/api/certificates",
    pageSize: PAGE_SIZE,
    extraParams: { sort: "notBefore", dir: "desc" },
    extractData: (json) => (json as { data?: RecentCert[] }).data ?? [],
    extractTotalPages: (json) => (json as { pagination?: { totalPages?: number } }).pagination?.totalPages ?? 1,
    initialData,
    initialTotalPages,
  });

  const caMatch = pathname.match(/\/ca\/([^/]+)/);
  const caSuffix = caMatch ? `/ca/${caMatch[1]}` : "";
  const filterSearch = new URLSearchParams(searchParams.toString());
  filterSearch.delete("page");
  filterSearch.delete("limit");
  const viewAllHref = `/certificates${caSuffix}${filterSearch.size > 0 ? `?${filterSearch}` : ""}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          latest certificates
        </span>
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          all <ArrowRight className="size-2.5" />
        </Link>
      </div>
      {loading && certs.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm" aria-live="polite">
          Loading...
        </p>
      ) : certs.length > 0 ? (
        <div className="space-y-1">
          <div className="max-h-[320px] overflow-y-auto space-y-0.5">
            {certs.map((cert) => {
              const certPath = certUrl(cert.fingerprintSha256);
              return (
                <div
                  key={cert.id}
                  className="flex items-center gap-2 py-0.5 hover:bg-secondary/50 rounded px-1 cursor-pointer"
                  onClick={() => router.push(certPath)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(certPath);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  {cert.hasLogo && cert.logotypeSvgHash ? (
                    <LogoCard
                      svgUrl={`/api/logo/${cert.logotypeSvgHash}?format=svg`}
                      size="xs"
                      asLink={false}
                      className="shrink-0"
                    />
                  ) : (
                    <div className="size-5 shrink-0 rounded border bg-muted" />
                  )}
                  <span className="text-[13px] font-medium truncate flex-1 min-w-0">
                    {cert.sanList[0] ? (
                      <HostChip hostname={cert.sanList[0]} size="xs" compact />
                    ) : (
                      <span className="font-mono text-muted-foreground">{cert.subjectCn || "Unknown"}</span>
                    )}
                  </span>
                  {cert.subjectOrg && (
                    <Link
                      href={orgUrl(cert.subjectOrg)}
                      className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[120px] hover:underline shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cert.subjectOrg}
                    </Link>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                    {cert.certType || "BIMI"}
                  </Badge>
                  <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0">
                    {displayIntermediateCa(cert.issuerOrg)}
                  </span>
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

          <MiniPagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No recent issuances match current filters.</p>
      )}
    </div>
  );
}
