"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { displayIssuerOrg } from "@/lib/ca-display";
import { useGlobalFilters } from "@/lib/use-global-filters";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowRight } from "lucide-react";

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
  logotypeSvg: string | null;
  notabilityScore: number | null;
}

export function RecentCerts() {
  const { buildApiParams } = useGlobalFilters();
  const [certs, setCerts] = useState<RecentCert[]>([]);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);

  const filterParams = buildApiParams({
    page: "1",
    limit: "7",
    sort: "notBefore",
    dir: "desc",
  });
  const loading = loadedParams !== filterParams;

  useEffect(() => {
    fetch(`/api/certificates?${filterParams}`)
      .then((res) => res.json())
      .then((json) => setCerts(json.data ?? []))
      .catch(() => setCerts([]))
      .finally(() => setLoadedParams(filterParams));
  }, [filterParams]);

  const sanitizedCerts = useMemo(
    () =>
      certs.map((c) => ({
        ...c,
        logotypeSvg: c.logotypeSvg ? sanitizeSvg(c.logotypeSvg) : null,
      })),
    [certs],
  );

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">Latest Issuances</h3>
      {loading && certs.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm" aria-live="polite">
          Loading...
        </p>
      ) : sanitizedCerts.length > 0 ? (
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
                {sanitizedCerts.map((cert) => (
                  <tr key={cert.id} className="border-b last:border-0 hover:bg-secondary/50 transition-colors">
                    <td className="py-0 pr-2 w-10">
                      {cert.logotypeSvg ? (
                        <div
                          className="h-10 w-10 shrink-0 rounded border bg-white p-0.5 overflow-hidden [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{ __html: cert.logotypeSvg }}
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded border bg-muted" />
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
                      {formatDistanceToNow(new Date(cert.notBefore), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link
            href="/certificates"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
          >
            View all certificates <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No recent issuances match current filters.</p>
      )}
    </div>
  );
}
